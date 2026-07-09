// The note document: pages, the blocks that flow down each page, and the ink strokes
// drawn over them. It starts as one blank page; the writer builds everything with the
// tools. Every mutation bumps updatedAt so persistence knows to save.
import { defineStore } from 'pinia'
import type { Block, CalloutBox, NoteDocument, Stroke, TextRole, TextRun } from '@/types'
import { blankDocument, blankPage } from '@/content/blankDocument'
import { toScene } from '@/diagrams/diagramSpec'
import { uid } from '@/util/id'

interface DocumentState {
  doc: NoteDocument
  activePageIndex: number
  /** The block currently being edited, for the contextual formatting bar. */
  selectedBlockId: string | null
  /** A block just created that the editor should move the caret into. */
  pendingFocusId: string | null
  /** True while Claude is writing onto the page, so the UI can show it live. */
  generating: boolean
  /** The last block Claude wrote, where the writing caret rests. */
  writingBlockId: string | null
  /** Earlier states of this note, most recent last, for undo. */
  past: string[]
  /** Undone states, for redo. */
  future: string[]
  /** True when the whole note is selected, so an action can apply to all of it. */
  allSelected: boolean
  /** Where the writer last pointed on a page, so an inserted figure lands there. */
  lastPoint: { pageIndex: number; x: number; y: number } | null
}

// The state the history compares against; kept out of the reactive store since it is a
// large string touched on every keystroke.
let baseline = ''
const HISTORY_LIMIT = 200

interface BlockLocation {
  pageIndex: number
  blockIndex: number
  block: Block
}

export const useDocument = defineStore('document', {
  state: (): DocumentState => ({
    doc: blankDocument(),
    activePageIndex: 0,
    selectedBlockId: null,
    pendingFocusId: null,
    generating: false,
    writingBlockId: null,
    past: [],
    future: [],
    allSelected: false,
    lastPoint: null,
  }),
  getters: {
    canUndo: (state) => state.past.length > 0,
    canRedo: (state) => state.future.length > 0,
    pageCount: (state) => state.doc.pages.length,
    selectedBlock(state): Block | null {
      if (!state.selectedBlockId) return null
      for (const page of state.doc.pages) {
        const block = page.blocks.find((b) => b.id === state.selectedBlockId)
        if (block) return block
      }
      return null
    },
  },
  actions: {
    touch() {
      this.doc.updatedAt = Date.now()
    },
    setTitle(title: string) {
      this.doc.title = title
      this.touch()
    },
    // Every run of text in the note, so an action can touch the whole thing at once.
    allRunArrays(): TextRun[][] {
      const arrays: TextRun[][] = []
      for (const page of this.doc.pages) {
        for (const block of page.blocks) {
          if (block.type === 'text') arrays.push(block.text.runs)
          else if (block.type === 'list') arrays.push(...block.items)
          else if (block.type === 'callouts') for (const box of block.boxes) arrays.push(box.heading, ...box.items)
        }
        for (const note of page.notes ?? []) arrays.push(note.runs)
      }
      return arrays
    },
    selectWholeNote() {
      this.allSelected = true
    },
    clearWholeNote() {
      this.allSelected = false
    },
    // Apply an emphasis across the whole note, turning it off if every run already has it.
    applyMarkToAll(mark: 'bold' | 'italic' | 'underline') {
      const arrays = this.allRunArrays()
      const runs = arrays.flat().filter((r) => r.text.trim())
      if (!runs.length) return
      const turnOff = runs.every((r) => r[mark])
      for (const array of arrays) for (const run of array) run[mark] = turnOff ? undefined : true
      this.touch()
    },
    setColorForAll(color: string) {
      for (const array of this.allRunArrays()) for (const run of array) run.color = color
      this.touch()
    },
    select(blockId: string | null) {
      this.allSelected = false
      this.selectedBlockId = blockId
    },
    locate(blockId: string): BlockLocation | null {
      for (let p = 0; p < this.doc.pages.length; p++) {
        const blockIndex = this.doc.pages[p].blocks.findIndex((b) => b.id === blockId)
        if (blockIndex !== -1) return { pageIndex: p, blockIndex, block: this.doc.pages[p].blocks[blockIndex] }
      }
      return null
    },

    setRuns(blockId: string, runs: TextRun[]) {
      const at = this.locate(blockId)
      if (at?.block.type === 'text') {
        at.block.text.runs = runs.length ? runs : [{ text: '' }]
        this.touch()
      }
    },
    setRole(blockId: string, role: TextRole) {
      const at = this.locate(blockId)
      if (at?.block.type === 'text') {
        at.block.text.role = role
        this.touch()
      }
    },
    setAlign(blockId: string, align: 'left' | 'center' | 'justify') {
      const at = this.locate(blockId)
      if (at?.block.type === 'text') {
        at.block.text.align = align
        this.touch()
      }
    },

    insertAfter(blockId: string | null, block: Block): string {
      if (!blockId) {
        const page = this.doc.pages[this.activePageIndex] ?? this.doc.pages[0]
        page.blocks.push(block)
      } else {
        const at = this.locate(blockId)
        if (at) this.doc.pages[at.pageIndex].blocks.splice(at.blockIndex + 1, 0, block)
        else (this.doc.pages[this.activePageIndex] ?? this.doc.pages[0]).blocks.push(block)
      }
      this.touch()
      return block.id
    },
    removeBlock(blockId: string) {
      const at = this.locate(blockId)
      if (!at) return
      this.doc.pages[at.pageIndex].blocks.splice(at.blockIndex, 1)
      if (this.selectedBlockId === blockId) this.selectedBlockId = null
      this.touch()
    },

    /** Ask the editor to move the caret into a block once it renders. */
    requestFocus(blockId: string) {
      this.pendingFocusId = blockId
    },
    clearPendingFocus() {
      this.pendingFocusId = null
    },
    addParagraphAfter(blockId: string | null, role: TextRole = 'body'): string {
      const block: Block = { id: uid('b'), type: 'text', text: { id: uid('t'), role, runs: [{ text: '' }] } }
      const id = this.insertAfter(blockId, block)
      this.pendingFocusId = id
      return id
    },
    addList(blockId: string | null, ordered: boolean): string {
      const id = this.insertAfter(blockId, { id: uid('b'), type: 'list', ordered, items: [[{ text: '' }]] })
      this.pendingFocusId = id
      return id
    },
    // Remember where the writer last pointed, so the next inserted figure lands there.
    setLastPoint(pageIndex: number, x: number, y: number) {
      this.lastPoint = { pageIndex, x, y }
    },
    // A figure is dropped where the writer last pointed and floats there, free to be
    // dragged anywhere on its page. With no recent point it lands near the top of the page
    // being worked on.
    placeFigure(block: Block): string {
      const point = this.lastPoint ?? { pageIndex: this.activePageIndex, x: 22, y: 22 }
      const page = this.doc.pages[point.pageIndex] ?? this.doc.pages[this.activePageIndex] ?? this.doc.pages[0]
      const width = block.type === 'diagram' ? 92 : block.type === 'callouts' ? 130 : 84
      block.float = { x: Math.max(2, point.x), y: Math.max(2, point.y), width }
      page.blocks.push(block)
      this.touch()
      this.select(block.id)
      return block.id
    },
    addTable(_blockId: string | null, columns = 3, bodyRows = 2): string {
      const header = Array.from({ length: columns }, (_, i) => (i === 0 ? 'p' : i === columns - 1 ? 'result' : 'q'))
      const rows = Array.from({ length: bodyRows }, () => Array.from({ length: columns }, () => ''))
      return this.placeFigure({ id: uid('b'), type: 'table', header, rows })
    },
    addCallouts(_blockId: string | null, boxes: CalloutBox[], caption?: string): string {
      return this.placeFigure({ id: uid('b'), type: 'callouts', boxes, caption })
    },
    addDiagram(_blockId: string | null, block: Extract<Block, { type: 'diagram' }>): string {
      return this.placeFigure({ ...block, id: uid('b') })
    },
    // Drag a floating figure across its page; docking drops it back into the writing flow,
    // and popping a flowing figure out lifts it to float where the writer last pointed.
    moveFloat(blockId: string, x: number, y: number) {
      const loc = this.locate(blockId)
      if (!loc || !loc.block.float) return
      loc.block.float.x = Math.max(0, x)
      loc.block.float.y = Math.max(0, y)
      this.touch()
    },
    setFloatWidth(blockId: string, width: number) {
      const loc = this.locate(blockId)
      if (!loc || !loc.block.float) return
      loc.block.float.width = Math.max(24, Math.min(190, width))
      this.touch()
    },
    dockFigure(blockId: string) {
      const loc = this.locate(blockId)
      if (loc?.block.float) {
        delete loc.block.float
        this.touch()
      }
    },
    popOutFigure(blockId: string) {
      const loc = this.locate(blockId)
      if (!loc || loc.block.float) return
      const point = this.lastPoint ?? { x: 24, y: 24 }
      const width = loc.block.type === 'diagram' ? 92 : loc.block.type === 'callouts' ? 130 : 84
      loc.block.float = { x: point.x, y: point.y, width }
      this.touch()
    },

    // A table grows and shrinks after it is placed. A column adds an empty cell to the
    // header and to every row; a row adds a full width of empty cells. The header and at
    // least one body row are kept so the grid never collapses to nothing.
    addTableColumn(blockId: string, at?: number) {
      const loc = this.locate(blockId)
      if (!loc || loc.block.type !== 'table') return
      const table = loc.block
      const index = at ?? table.header.length
      table.header.splice(index, 0, '')
      table.rows.forEach((row) => row.splice(index, 0, ''))
      this.touch()
    },
    removeTableColumn(blockId: string, index: number) {
      const loc = this.locate(blockId)
      if (!loc || loc.block.type !== 'table' || loc.block.header.length <= 1) return
      loc.block.header.splice(index, 1)
      loc.block.rows.forEach((row) => row.splice(index, 1))
      this.touch()
    },
    addTableRow(blockId: string, at?: number) {
      const loc = this.locate(blockId)
      if (!loc || loc.block.type !== 'table') return
      const table = loc.block
      const index = at ?? table.rows.length
      table.rows.splice(
        index,
        0,
        Array.from({ length: table.header.length }, () => ''),
      )
      this.touch()
    },
    removeTableRow(blockId: string, index: number) {
      const loc = this.locate(blockId)
      if (!loc || loc.block.type !== 'table' || loc.block.rows.length <= 1) return
      loc.block.rows.splice(index, 1)
      this.touch()
    },

    // Callout boxes are added and removed as a set, and each box's lines the same way.
    addCalloutBox(blockId: string, at?: number) {
      const loc = this.locate(blockId)
      if (!loc || loc.block.type !== 'callouts') return
      const boxes = loc.block.boxes
      const palette = ['#4A72B0', '#C8792E', '#3F8F5C', '#B73B3A']
      boxes.splice(at ?? boxes.length, 0, {
        color: palette[boxes.length % palette.length],
        heading: [{ text: '' }],
        items: [[{ text: '' }]],
      })
      this.touch()
    },
    removeCalloutBox(blockId: string, index: number) {
      const loc = this.locate(blockId)
      if (!loc || loc.block.type !== 'callouts' || loc.block.boxes.length <= 1) return
      loc.block.boxes.splice(index, 1)
      this.touch()
    },
    addCalloutItem(blockId: string, boxIndex: number) {
      const loc = this.locate(blockId)
      if (!loc || loc.block.type !== 'callouts') return
      loc.block.boxes[boxIndex]?.items.push([{ text: '' }])
      this.touch()
    },
    removeCalloutItem(blockId: string, boxIndex: number, itemIndex: number) {
      const loc = this.locate(blockId)
      if (!loc || loc.block.type !== 'callouts') return
      const box = loc.block.boxes[boxIndex]
      if (!box || box.items.length <= 1) return
      box.items.splice(itemIndex, 1)
      this.touch()
    },

    // A diagram is resized by the number of ruled lines it spans, kept within sane bounds.
    setDiagramHeight(blockId: string, heightRules: number) {
      const loc = this.locate(blockId)
      if (!loc || loc.block.type !== 'diagram') return
      loc.block.heightRules = Math.max(4, Math.min(40, Math.round(heightRules)))
      this.touch()
    },
    // Every letter in a diagram is the writer's to change. A named figure is first turned
    // into its concrete scene so its labels become editable in place; then the one being
    // typed is set. The rest of the drawing is untouched, and its seed stays with the
    // block, so the hand-drawn shapes do not shift while a label is edited.
    setDiagramLabel(blockId: string, shapeIndex: number, text: string) {
      const loc = this.locate(blockId)
      if (!loc || loc.block.type !== 'diagram') return
      if (loc.block.spec.kind !== 'scene') {
        loc.block.spec = { kind: 'scene', scene: toScene(loc.block.spec) }
      }
      const shape = loc.block.spec.scene.shapes[shapeIndex]
      if (shape && shape.type === 'label') {
        shape.text = text
        this.touch()
      }
    },
    /** Split the page after a block so the rest continues on a fresh page. */
    breakPageAt(blockId: string): number {
      const at = this.locate(blockId)
      if (!at) return this.activePageIndex
      const page = this.doc.pages[at.pageIndex]
      const moved = page.blocks.splice(at.blockIndex + 1)
      const next = {
        id: uid('p'),
        index: at.pageIndex + 1,
        presetId: page.presetId,
        blocks: moved.length
          ? moved
          : [
              {
                id: uid('b'),
                type: 'text' as const,
                text: { id: uid('t'), role: 'body' as const, runs: [{ text: '' }] },
              },
            ],
        strokes: [],
      }
      this.doc.pages.splice(at.pageIndex + 1, 0, next)
      this.doc.pages.forEach((p, i) => (p.index = i))
      this.touch()
      return at.pageIndex + 1
    },

    updateBlock(blockId: string, patch: Partial<Block>) {
      const at = this.locate(blockId)
      if (!at) return
      Object.assign(at.block, patch)
      this.touch()
    },

    // Free notes: handwriting placed anywhere on a page, over and around the flow.
    addNote(pageIndex: number, x: number, y: number): string {
      const page = this.doc.pages[pageIndex]
      if (!page) return ''
      if (!page.notes) page.notes = []
      const note = { id: uid('n'), x, y, runs: [{ text: '' }] }
      page.notes.push(note)
      this.pendingFocusId = note.id
      this.touch()
      return note.id
    },
    setNoteRuns(pageIndex: number, noteId: string, runs: TextRun[]) {
      const note = this.doc.pages[pageIndex]?.notes?.find((n) => n.id === noteId)
      if (note) {
        note.runs = runs.length ? runs : [{ text: '' }]
        this.touch()
      }
    },
    removeNote(pageIndex: number, noteId: string) {
      const page = this.doc.pages[pageIndex]
      if (!page.notes) return
      page.notes = page.notes.filter((n) => n.id !== noteId)
      this.touch()
    },

    addStroke(pageIndex: number, stroke: Stroke) {
      this.doc.pages[pageIndex]?.strokes.push(stroke)
      this.touch()
    },
    eraseStrokes(pageIndex: number, ids: Set<string>) {
      const page = this.doc.pages[pageIndex]
      if (!page) return
      page.strokes = page.strokes.filter((s) => !ids.has(s.id))
      this.touch()
    },
    replaceStrokes(pageIndex: number, strokes: Stroke[]) {
      const page = this.doc.pages[pageIndex]
      if (!page) return
      page.strokes = strokes
      this.touch()
    },
    fillStroke(pageIndex: number, strokeId: string, color: string) {
      const stroke = this.doc.pages[pageIndex]?.strokes.find((s) => s.id === strokeId)
      if (stroke) {
        stroke.fill = color
        this.touch()
      }
    },

    setActivePage(index: number) {
      this.activePageIndex = Math.max(0, Math.min(index, this.doc.pages.length - 1))
    },
    addBlankPage(): number {
      const page = blankPage(this.doc.pages.length)
      this.doc.pages.push(page)
      this.touch()
      return page.index
    },
    reindexPages() {
      this.doc.pages.forEach((p, i) => (p.index = i))
    },
    addPageAfter(pageIndex: number): number {
      const page = blankPage(pageIndex + 1)
      this.doc.pages.splice(pageIndex + 1, 0, page)
      this.reindexPages()
      this.touch()
      return pageIndex + 1
    },
    duplicatePage(pageIndex: number): number {
      const source = this.doc.pages[pageIndex]
      if (!source) return pageIndex
      const copy = JSON.parse(JSON.stringify(source)) as (typeof this.doc.pages)[number]
      copy.id = uid('p')
      copy.blocks.forEach((b) => (b.id = uid('b')))
      this.doc.pages.splice(pageIndex + 1, 0, copy)
      this.reindexPages()
      this.touch()
      return pageIndex + 1
    },
    // Remove a page, or, when it is the only one, wipe it back to a blank page.
    deletePage(pageIndex: number) {
      if (this.doc.pages.length <= 1) {
        this.doc.pages.splice(0, 1, blankPage(0))
      } else {
        this.doc.pages.splice(pageIndex, 1)
        this.reindexPages()
        this.setActivePage(Math.min(this.activePageIndex, this.doc.pages.length - 1))
      }
      this.selectedBlockId = null
      this.touch()
    },

    // Claude writing live: start a fresh page, drop blocks onto it as they arrive, and
    // keep the caret on the newest one so the writing can be seen happening.
    beginAiPage(): number {
      const page = {
        id: uid('p'),
        index: this.doc.pages.length,
        presetId: this.doc.pages[0].presetId,
        blocks: [],
        strokes: [],
      }
      this.doc.pages.push(page)
      this.generating = true
      this.writingBlockId = null
      this.activePageIndex = page.index
      this.touch()
      return page.index
    },
    appendAiBlock(pageIndex: number, block: Block) {
      const page = this.doc.pages[pageIndex]
      if (!page) return
      page.blocks.push(block)
      this.writingBlockId = block.id
      this.touch()
    },
    endAi() {
      this.generating = false
      this.writingBlockId = null
      // A page that produced nothing is removed so a failed run leaves no blank sheet.
      const last = this.doc.pages[this.activePageIndex]
      if (last && last.blocks.length === 0 && this.doc.pages.length > 1) {
        this.doc.pages.splice(this.activePageIndex, 1)
        this.reindexPages()
        this.setActivePage(this.doc.pages.length - 1)
      }
      this.touch()
    },

    appendGeneratedPages(pages: Block[][]) {
      for (const blocks of pages) {
        this.doc.pages.push({
          id: uid('p'),
          index: this.doc.pages.length,
          presetId: this.doc.pages[0].presetId,
          blocks,
          strokes: [],
        })
      }
      this.touch()
    },
    hydrate(doc: NoteDocument) {
      this.doc = doc
      this.activePageIndex = 0
      this.selectedBlockId = null
      this.resetHistory()
    },
    reset() {
      this.doc = blankDocument()
      this.activePageIndex = 0
      this.selectedBlockId = null
      this.resetHistory()
    },

    // Undo and redo. History records whole states of the note, so anything lost, a word,
    // a line, a drawing, a whole page, comes back. Opening a note starts its own history.
    resetHistory() {
      baseline = JSON.stringify(this.doc)
      this.past = []
      this.future = []
    },
    recordHistory() {
      const now = JSON.stringify(this.doc)
      if (now === baseline) return
      this.past.push(baseline)
      if (this.past.length > HISTORY_LIMIT) this.past.shift()
      this.future = []
      baseline = now
    },
    undo() {
      if (!this.past.length) return
      // Save the current state, capturing edits not yet recorded, then step back.
      this.recordHistory()
      const previous = this.past.pop()
      if (previous === undefined) return
      this.future.push(baseline)
      baseline = previous
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      this.doc = JSON.parse(previous)
      this.selectedBlockId = null
      this.activePageIndex = Math.min(this.activePageIndex, this.doc.pages.length - 1)
    },
    redo() {
      const next = this.future.pop()
      if (next === undefined) return
      this.past.push(baseline)
      baseline = next
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      this.doc = JSON.parse(next)
      this.selectedBlockId = null
      this.activePageIndex = Math.min(this.activePageIndex, this.doc.pages.length - 1)
    },
  },
})
