// The note document: pages, the blocks that flow down each page, and the ink strokes
// drawn over them. It starts as one blank page; the writer builds everything with the
// tools. Every mutation bumps updatedAt so persistence knows to save.
import { defineStore } from 'pinia'
import type { Block, CalloutBox, NoteDocument, Page, Stroke, TextRole, TextRun } from '@/types'
import { blankDocument, blankPage } from '@/content/blankDocument'
import { toScene } from '@/diagrams/diagramSpec'
import { uid } from '@/util/id'
import { replaceInRuns } from '@/ui/richText'

interface DocumentState {
  doc: NoteDocument
  activePageIndex: number
  /** The block currently being edited, for the contextual formatting bar. */
  selectedBlockId: string | null
  /** The free note currently being edited, when the caret is in one instead of a block, so
   *  formatting that acts on a whole line (font size) knows to target the note. */
  selectedNote: { pageIndex: number; id: string } | null
  /** A block just created that the editor should move the caret into. */
  pendingFocusId: string | null
  /** Where along the pending-focus block the caret should land, for keeping it in place when
   *  a block flows to another page. Null means the editor picks the natural spot. */
  pendingFocusOffset: number | null
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
  /** While the AI writes, the index on its page where the next block is placed, so writing
   *  can begin at the line the writer chose rather than only at the end of the page. */
  aiInsertAt: number
  /** The tool the AI is reaching for right now, so a ghost cursor can glide to it and press
   *  it: a role like 'heading', or an insert like 'table'. Null between presses. */
  aiTool: string | null
  /** A run of whole lines chosen together across blocks, so a span can be styled or merged
   *  the way a word processor lets you drag across lines. A native browser selection cannot
   *  cross separate editable lines, so this tracks the chosen range at the line level. */
  lineSelection: { pageIndex: number; refs: LineRef[] } | null
  /** The line a shift-click extends from, set as the caret lands on a line. */
  lineAnchor: LineRef | null
}

// A single editable line addressed across blocks: a paragraph carries item null, a list
// item carries its index. A line selection ranges over these in the order they are read.
export interface LineRef {
  blockId: string
  item: number | null
}

// A stable key for a line, so membership can be checked in one lookup while highlighting.
export function lineKey(blockId: string, item: number | null): string {
  return `${blockId}#${item ?? 'p'}`
}

// Every line on a page in reading order, so a shift-click can select the range between two
// of them. Only paragraphs and list items are lines; floating figures are skipped.
function pageLineRefs(page: Page): LineRef[] {
  const refs: LineRef[] = []
  for (const block of page.blocks) {
    if (block.float) continue
    if (block.type === 'text') refs.push({ blockId: block.id, item: null })
    else if (block.type === 'list') block.items.forEach((_, i) => refs.push({ blockId: block.id, item: i }))
  }
  return refs
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
    selectedNote: null,
    pendingFocusId: null,
    pendingFocusOffset: null,
    generating: false,
    writingBlockId: null,
    past: [],
    future: [],
    allSelected: false,
    lastPoint: null,
    aiInsertAt: 0,
    aiTool: null,
    lineSelection: null,
    lineAnchor: null,
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
          else if (block.type === 'quote') arrays.push(block.runs)
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

    // Line selection: a run of whole lines chosen together across blocks. The caret landing on
    // a line sets the anchor; shift-clicking another line selects every line between the two.
    setLineAnchor(blockId: string, item: number | null) {
      this.lineAnchor = { blockId, item }
    },
    selectLineRange(pageIndex: number, focus: LineRef) {
      const page = this.doc.pages[pageIndex]
      const anchor = this.lineAnchor
      if (!page || !anchor) return
      const refs = pageLineRefs(page)
      const ai = refs.findIndex((r) => r.blockId === anchor.blockId && r.item === anchor.item)
      const fi = refs.findIndex((r) => r.blockId === focus.blockId && r.item === focus.item)
      if (ai === -1 || fi === -1) return
      const [lo, hi] = ai <= fi ? [ai, fi] : [fi, ai]
      // A shift-click back on the anchor is not a span; leave the caret to behave normally.
      if (lo === hi) {
        this.lineSelection = null
        return
      }
      this.lineSelection = { pageIndex, refs: refs.slice(lo, hi + 1) }
      this.selectedBlockId = null
      this.selectedNote = null
      this.allSelected = false
    },
    clearLineSelection() {
      this.lineSelection = null
    },
    isLineSelected(blockId: string, item: number | null): boolean {
      return !!this.lineSelection?.refs.some((r) => r.blockId === blockId && r.item === item)
    },
    // The runs of one line, whether a paragraph or a list item, so an action reads and rewrites
    // any line the same way.
    runsOfLine(ref: LineRef): TextRun[] | null {
      const at = this.locate(ref.blockId)
      if (!at) return null
      if (at.block.type === 'text' && ref.item === null) return at.block.text.runs
      if (at.block.type === 'list' && ref.item !== null) return at.block.items[ref.item] ?? null
      return null
    },
    // Emphasis across the selected lines, turned off if every one of them already carries it,
    // the same feel as bolding a run of text.
    applyMarkToLines(mark: 'bold' | 'italic' | 'underline') {
      const sel = this.lineSelection
      if (!sel) return
      const arrays = sel.refs.map((r) => this.runsOfLine(r)).filter((a): a is TextRun[] => !!a)
      const runs = arrays.flat().filter((r) => r.text.trim())
      if (!runs.length) return
      const turnOff = runs.every((r) => r[mark])
      for (const array of arrays) for (const run of array) run[mark] = turnOff ? undefined : true
      this.touch()
    },
    setColorForLines(color: string) {
      const sel = this.lineSelection
      if (!sel) return
      for (const ref of sel.refs) {
        const runs = this.runsOfLine(ref)
        if (runs) for (const run of runs) run.color = color
      }
      this.touch()
    },
    // Change the case of every selected line together. Title case lowercases first so a line
    // that arrived shouting comes back to a clean Capitalised Line.
    setCaseForLines(mode: 'upper' | 'lower' | 'title') {
      const sel = this.lineSelection
      if (!sel) return
      const cased = (text: string) =>
        mode === 'upper'
          ? text.toUpperCase()
          : mode === 'lower'
            ? text.toLowerCase()
            : text.toLowerCase().replace(/(^|\s|[("'])\p{L}/gu, (m) => m.toUpperCase())
      for (const ref of sel.refs) {
        const runs = this.runsOfLine(ref)
        if (runs) for (const run of runs) run.text = cased(run.text)
      }
      this.touch()
    },
    // Join the selected lines into a single paragraph, in order, the way a word processor
    // merges lines: their words run together separated by a space. A list the selection cuts
    // through is left whole on either side, its remaining items still a list.
    mergeSelectedLines() {
      const sel = this.lineSelection
      if (!sel || sel.refs.length < 2) return
      const page = this.doc.pages[sel.pageIndex]
      if (!page) return
      const keys = new Set(sel.refs.map((r) => lineKey(r.blockId, r.item)))
      const merged: TextRun[] = []
      sel.refs.forEach((ref) => {
        const runs = this.runsOfLine(ref)
        if (!runs) return
        if (merged.length) merged.push({ text: ' ' })
        merged.push(...runs.filter((r) => r.text.length))
      })
      const paragraph: Block = {
        id: uid('b'),
        type: 'text',
        text: { id: uid('t'), role: 'body', runs: merged.length ? merged : [{ text: '' }] },
      }
      // Rebuild the page, dropping the selected lines and dropping the one merged paragraph in
      // where the first of them was. A list split by the selection keeps its items on either
      // side as their own lists so nothing else on the page shifts.
      const rebuilt: Block[] = []
      let placed = false
      const place = () => {
        if (!placed) {
          rebuilt.push(paragraph)
          placed = true
        }
      }
      for (const block of page.blocks) {
        if (block.float) {
          rebuilt.push(block)
        } else if (block.type === 'text' && keys.has(lineKey(block.id, null))) {
          place()
        } else if (block.type === 'list' && block.items.some((_, i) => keys.has(lineKey(block.id, i)))) {
          let segment: TextRun[][] = []
          const flush = () => {
            if (segment.length) {
              rebuilt.push({ id: uid('b'), type: 'list', ordered: block.ordered, items: segment })
              segment = []
            }
          }
          block.items.forEach((item, i) => {
            if (keys.has(lineKey(block.id, i))) {
              flush()
              place()
            } else {
              segment.push(item)
            }
          })
          flush()
        } else {
          rebuilt.push(block)
        }
      }
      page.blocks = rebuilt
      this.lineSelection = null
      this.selectedBlockId = paragraph.id
      this.pendingFocusId = paragraph.id
      this.touch()
    },
    select(blockId: string | null) {
      this.allSelected = false
      this.selectedBlockId = blockId
      // Moving into a block means the caret is no longer in a free note.
      this.selectedNote = null
    },
    // The caret has moved into a free note; block-scoped formatting should target it now.
    selectNote(pageIndex: number, id: string) {
      this.allSelected = false
      this.selectedBlockId = null
      this.selectedNote = { pageIndex, id }
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
    setNoteRole(pageIndex: number, noteId: string, role: TextRole) {
      const note = this.doc.pages[pageIndex]?.notes?.find((n) => n.id === noteId)
      if (note) {
        note.role = role
        this.touch()
      }
    },
    // Make whatever line the caret is in a title, heading, or body, whether it is a block or
    // a free note, so the role controls work on any text anywhere.
    setSelectionRole(role: TextRole) {
      if (this.selectedNote) this.setNoteRole(this.selectedNote.pageIndex, this.selectedNote.id, role)
      else if (this.selectedBlockId) this.setRole(this.selectedBlockId, role)
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

    /** Ask the editor to move the caret into a block once it renders, optionally at a given
     *  character offset so the caret can be kept where it was when a block moves pages. */
    requestFocus(blockId: string, offset?: number) {
      this.pendingFocusId = blockId
      this.pendingFocusOffset = offset ?? null
    },
    clearPendingFocus() {
      this.pendingFocusId = null
      this.pendingFocusOffset = null
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
    // A checklist: an unnumbered list that carries a tick per item. The tick states start out
    // clear and stay the same length as the items as the list is edited.
    addTaskList(blockId: string | null): string {
      const id = this.insertAfter(blockId, {
        id: uid('b'),
        type: 'list',
        ordered: false,
        items: [[{ text: '' }]],
        checked: [false],
      })
      this.pendingFocusId = id
      return id
    },
    // A quoted passage set apart from the writing, edited as its own line of runs.
    addQuote(blockId: string | null): string {
      const id = this.insertAfter(blockId, { id: uid('b'), type: 'quote', runs: [{ text: '' }] })
      this.pendingFocusId = id
      return id
    },
    // A block of code kept in a plain monospace face with its spacing and line breaks intact.
    addCode(blockId: string | null): string {
      const id = this.insertAfter(blockId, { id: uid('b'), type: 'code', text: '' })
      this.pendingFocusId = id
      return id
    },
    setCode(blockId: string, text: string) {
      const at = this.locate(blockId)
      if (at?.block.type === 'code') {
        at.block.text = text
        this.touch()
      }
    },
    // A plain rule across the column that separates one part of the note from the next.
    addDivider(blockId: string | null): string {
      return this.insertAfter(blockId, { id: uid('b'), type: 'divider' })
    },
    // Tick or untick one item of a checklist.
    toggleListCheck(blockId: string, index: number) {
      const at = this.locate(blockId)
      if (at?.block.type === 'list' && at.block.checked && index < at.block.checked.length) {
        at.block.checked[index] = !at.block.checked[index]
        this.touch()
      }
    },
    // Turn the line the caret is on into a bullet, so the words already there become the first
    // item rather than a fresh empty bullet appearing below and pushing the line down. A
    // paragraph becomes a one item list keeping its words; a list already there switches its
    // numbered or plain style; anything else, or nothing chosen, starts a new list.
    convertToList(blockId: string | null, ordered: boolean): string {
      const at = blockId ? this.locate(blockId) : null
      if (at?.block.type === 'text') {
        const runs = at.block.text.runs
        const list: Block = { id: at.block.id, type: 'list', ordered, items: [runs.length ? runs : [{ text: '' }]] }
        this.doc.pages[at.pageIndex].blocks.splice(at.blockIndex, 1, list)
        this.pendingFocusId = list.id
        this.touch()
        return list.id
      }
      if (at?.block.type === 'list') {
        at.block.ordered = ordered
        this.pendingFocusId = at.block.id
        this.touch()
        return at.block.id
      }
      return this.addList(blockId, ordered)
    },
    // Remember where the writer last pointed, so the next inserted figure lands there.
    setLastPoint(pageIndex: number, x: number, y: number) {
      this.lastPoint = { pageIndex, x, y }
    },
    // Place a figure floating where the writer last pointed, on that page. With no recent
    // point it lands near the top of the page being worked on.
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

    // Change the paper a page is ruled on: lined, grid, dotted, or blank. Applied per page, so
    // one note can mix a ruled page with a grid one.
    setPagePreset(pageIndex: number, presetId: string) {
      const page = this.doc.pages[pageIndex]
      if (!page) return
      page.presetId = presetId
      this.touch()
    },
    // A figure is resized by the number of ruled lines it spans, kept within sane bounds. Both
    // drawn diagrams and placed pictures stand a whole number of lines tall.
    setFigureHeight(blockId: string, heightRules: number) {
      const loc = this.locate(blockId)
      if (!loc || (loc.block.type !== 'diagram' && loc.block.type !== 'image')) return
      loc.block.heightRules = Math.max(4, Math.min(40, Math.round(heightRules)))
      this.touch()
    },
    // Drop a picture into the writing column after a line, standing as tall as it is asked to.
    insertImage(afterBlockId: string | null, blobRef: string, alt: string, heightRules: number): string {
      const block: Block = { id: uid('b'), type: 'image', blobRef, alt, heightRules }
      const id = this.insertAfter(afterBlockId, block)
      this.select(id)
      return id
    },
    // How large a block's writing is drawn. One dial covers every kind of block: a
    // paragraph, a list, a table's cells, a callout's lines, or a diagram's letters.
    setFontScale(blockId: string, scale: number) {
      const loc = this.locate(blockId)
      if (!loc) return
      loc.block.scale = Math.max(0.6, Math.min(2.4, Math.round(scale * 20) / 20))
      this.touch()
    },
    nudgeFontScale(blockId: string, delta: number) {
      const loc = this.locate(blockId)
      if (!loc) return
      this.setFontScale(blockId, (loc.block.scale ?? 1) + delta)
    },
    setNoteScale(pageIndex: number, noteId: string, scale: number) {
      const note = this.doc.pages[pageIndex]?.notes?.find((n) => n.id === noteId)
      if (!note) return
      note.scale = Math.max(0.6, Math.min(2.4, Math.round(scale * 20) / 20))
      this.touch()
    },
    // Size whatever line the caret is in, be it a block or a free note, so the font-size
    // dial works on any text anywhere and never silently targets the wrong line.
    nudgeSelectionFontScale(delta: number) {
      if (this.selectedNote) {
        const { pageIndex, id } = this.selectedNote
        const note = this.doc.pages[pageIndex]?.notes?.find((n) => n.id === id)
        if (note) this.setNoteScale(pageIndex, id, (note.scale ?? 1) + delta)
      } else if (this.selectedBlockId) {
        this.nudgeFontScale(this.selectedBlockId, delta)
      }
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

    // Move a block and everything after it on its page onto the start of the following page,
    // making a new page when it is the last one. Used to flow writing that no longer fits a
    // page onto the next, so a page never grows past a single sheet.
    movePageTail(blockId: string): boolean {
      const at = this.locate(blockId)
      if (!at || at.blockIndex === 0) return false
      const page = this.doc.pages[at.pageIndex]
      const moved = page.blocks.splice(at.blockIndex)
      if (!moved.length) return false
      let next = this.doc.pages[at.pageIndex + 1]
      if (!next) {
        next = { id: uid('p'), index: at.pageIndex + 1, presetId: page.presetId, blocks: [], strokes: [] }
        this.doc.pages.splice(at.pageIndex + 1, 0, next)
      }
      next.blocks.unshift(...moved)
      this.doc.pages.forEach((p, i) => (p.index = i))
      this.touch()
      return true
    },
    // Pull the first block of a page onto the end of the page before it, so content flows back
    // up to fill the space above. A page left with nothing on it is dropped, closing the gap.
    pullFirstBlockUp(pageIndex: number): boolean {
      const page = this.doc.pages[pageIndex]
      const prev = this.doc.pages[pageIndex - 1]
      if (!page || !prev || !page.blocks.length) return false
      const [block] = page.blocks.splice(0, 1)
      prev.blocks.push(block)
      if (!page.blocks.length && (page.strokes?.length ?? 0) === 0 && (page.notes?.length ?? 0) === 0) {
        this.doc.pages.splice(pageIndex, 1)
      }
      this.doc.pages.forEach((p, i) => (p.index = i))
      this.touch()
      return true
    },
    // Backspace at the very top of a page joins it onto the page above: the block's words merge
    // onto the last line there, or, if that line cannot take them, the block moves up whole. A
    // page left empty by this gives its space back. Returns where the caret should come to rest.
    mergeToPrevPageEnd(blockId: string, runs: TextRun[]): { blockId: string; offset: number } | null {
      const at = this.locate(blockId)
      if (!at || at.pageIndex === 0 || at.blockIndex !== 0) return null
      const page = this.doc.pages[at.pageIndex]
      const prev = this.doc.pages[at.pageIndex - 1]
      const last = prev.blocks[prev.blocks.length - 1] as Block | undefined
      const words = runs.filter((r) => r.text.length)
      let result: { blockId: string; offset: number }
      if (last?.type === 'text') {
        const offset = last.text.runs.reduce((n, r) => n + r.text.length, 0)
        const merged = [...last.text.runs, ...words].filter((r) => r.text.length)
        last.text.runs = merged.length ? merged : [{ text: '' }]
        page.blocks.splice(0, 1)
        result = { blockId: last.id, offset }
      } else {
        // Nothing above to merge into, so the whole line moves up to sit below what is there.
        const [moved] = page.blocks.splice(0, 1)
        prev.blocks.push(moved)
        result = { blockId: moved.id, offset: 0 }
      }
      if (!page.blocks.length && (page.strokes?.length ?? 0) === 0 && (page.notes?.length ?? 0) === 0) {
        this.doc.pages.splice(at.pageIndex, 1)
      }
      this.doc.pages.forEach((p, i) => (p.index = i))
      if (this.selectedBlockId === blockId) this.selectedBlockId = null
      this.touch()
      return result
    },
    // Replace every occurrence of a phrase across the whole note at once, in paragraphs, list
    // items, quotes, callouts, table cells, code, and free notes. Returns how many were changed.
    replaceAll(query: string, replacement: string): number {
      if (!query) return 0
      let total = 0
      const swap = (runs: TextRun[]): TextRun[] => {
        const out = replaceInRuns(runs, query, replacement)
        total += out.count
        return out.count ? out.runs : runs
      }
      const inString = (value: string): string => {
        const parts = value.toLowerCase().split(query.toLowerCase())
        if (parts.length === 1) return value
        // Rebuild from the original text so replacements land at case-insensitive matches.
        let result = ''
        let at = 0
        const needle = query.toLowerCase()
        const lower = value.toLowerCase()
        while (at < value.length) {
          if (lower.startsWith(needle, at)) {
            result += replacement
            at += query.length
            total += 1
          } else {
            result += value[at]
            at += 1
          }
        }
        return result
      }
      for (const page of this.doc.pages) {
        for (const block of page.blocks) {
          if (block.type === 'text') block.text.runs = swap(block.text.runs)
          else if (block.type === 'quote') block.runs = swap(block.runs)
          else if (block.type === 'list') block.items = block.items.map(swap)
          else if (block.type === 'code') block.text = inString(block.text)
          else if (block.type === 'table') {
            block.header = block.header.map(inString)
            block.rows = block.rows.map((row) => row.map(inString))
          } else if (block.type === 'callouts') {
            for (const box of block.boxes) {
              box.heading = swap(box.heading)
              box.items = box.items.map(swap)
            }
          }
        }
        for (const note of page.notes ?? []) note.runs = swap(note.runs)
      }
      if (total) this.touch()
      return total
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

    // The AI correcting the note in place: nothing on the page is cleared. The note as it
    // stands is kept as an undo point, so any change the writer dislikes is one undo away,
    // then the edits are acted out on the exact lines that need them.
    beginAiEdit() {
      this.generating = true
      this.writingBlockId = null
      this.aiTool = null
      const snapshot = JSON.stringify(this.doc)
      this.past.push(snapshot)
      if (this.past.length > HISTORY_LIMIT) this.past.shift()
      this.future = []
      baseline = snapshot
    },
    // The line the AI is working on right now, so the ghost cursor and caret sit on it while
    // it is erased and rewritten.
    setWritingBlock(blockId: string | null) {
      this.writingBlockId = blockId
    },
    // The AI writing live: dropping blocks onto the page as they arrive and keeping the caret
    // on the newest one so the writing is seen happening. A blank page is written into
    // directly, so a new note fills from its first line; a page that already holds writing
    // continues on a fresh sheet after it, so nothing already on the page is disturbed.
    beginAiPage(): number {
      this.generating = true
      this.writingBlockId = null
      this.aiTool = null
      this.aiInsertAt = 0
      const current = this.doc.pages[this.activePageIndex] ?? this.doc.pages[0]
      const currentIsBlank =
        (current.strokes?.length ?? 0) === 0 &&
        (current.notes?.length ?? 0) === 0 &&
        current.blocks.every((b) => b.type === 'text' && b.text.runs.every((r) => !r.text.trim()))
      if (currentIsBlank) {
        current.blocks = []
        this.touch()
        return current.index
      }
      const page = {
        id: uid('p'),
        index: this.doc.pages.length,
        presetId: current.presetId,
        blocks: [] as Block[],
        strokes: [] as Stroke[],
      }
      this.doc.pages.push(page)
      this.activePageIndex = page.index
      this.touch()
      return page.index
    },
    // The tool the AI is reaching for, so the ghost cursor can glide to it and press it.
    setAiTool(tool: string | null) {
      this.aiTool = tool
    },
    appendAiBlock(pageIndex: number, block: Block) {
      const page = this.doc.pages[pageIndex]
      if (!page) return
      const at = Math.min(Math.max(0, this.aiInsertAt), page.blocks.length)
      page.blocks.splice(at, 0, block)
      this.aiInsertAt = at + 1
      this.writingBlockId = block.id
      this.touch()
    },
    endAi() {
      this.generating = false
      const lastWritten = this.writingBlockId
      const page = this.doc.pages[this.activePageIndex]
      if (page && page.blocks.length === 0) {
        if (this.doc.pages.length > 1) {
          // A fresh continuation sheet a failed run left empty is removed.
          this.doc.pages.splice(this.activePageIndex, 1)
          this.reindexPages()
          this.setActivePage(this.doc.pages.length - 1)
        } else {
          // The only page produced nothing, so give it back its blank starting line.
          page.blocks.push({ id: uid('b'), type: 'text', text: { id: uid('t'), role: 'body', runs: [{ text: '' }] } })
        }
      }
      // Rest the caret on the last line the AI wrote, so the view finishes at the end of that
      // section rather than jumping away, and clear the live writing marker.
      const rested = this.doc.pages[this.activePageIndex]
      this.selectedBlockId = lastWritten ?? rested?.blocks[rested.blocks.length - 1]?.id ?? null
      this.writingBlockId = null
      this.aiTool = null
      this.touch()
    },
    // Replace a list's items as the writing is typed in, one growing slice at a time.
    setListItems(blockId: string, items: TextRun[][]) {
      const at = this.locate(blockId)
      if (at?.block.type === 'list') {
        at.block.items = items.length ? items : [[{ text: '' }]]
        this.touch()
      }
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
