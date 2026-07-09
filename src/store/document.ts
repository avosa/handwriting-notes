// The note document: pages, the blocks that flow down each page, and the ink strokes
// drawn over them. It starts as one blank page; the writer builds everything with the
// tools. Every mutation bumps updatedAt so persistence knows to save.
import { defineStore } from 'pinia'
import type { Block, CalloutBox, NoteDocument, Stroke, TextRole, TextRun } from '@/types'
import { blankDocument, blankPage } from '@/content/blankDocument'
import { uid } from '@/util/id'

interface DocumentState {
  doc: NoteDocument
  activePageIndex: number
  /** The block currently being edited, for the contextual formatting bar. */
  selectedBlockId: string | null
}

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
  }),
  getters: {
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
    select(blockId: string | null) {
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

    addParagraphAfter(blockId: string | null, role: TextRole = 'body'): string {
      const block: Block = { id: uid('b'), type: 'text', text: { id: uid('t'), role, runs: [{ text: '' }] } }
      return this.insertAfter(blockId, block)
    },
    addList(blockId: string | null, ordered: boolean): string {
      return this.insertAfter(blockId, { id: uid('b'), type: 'list', ordered, items: [[{ text: '' }]] })
    },
    addTable(blockId: string | null, columns = 3, bodyRows = 2): string {
      const header = Array.from({ length: columns }, (_, i) => (i === 0 ? 'p' : i === columns - 1 ? 'result' : 'q'))
      const rows = Array.from({ length: bodyRows }, () => Array.from({ length: columns }, () => ''))
      return this.insertAfter(blockId, { id: uid('b'), type: 'table', header, rows })
    },
    addCallouts(blockId: string | null, boxes: CalloutBox[], caption?: string): string {
      return this.insertAfter(blockId, { id: uid('b'), type: 'callouts', boxes, caption })
    },
    addDiagram(blockId: string | null, block: Extract<Block, { type: 'diagram' }>): string {
      return this.insertAfter(blockId, { ...block, id: uid('b') })
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
    removePage(pageIndex: number) {
      if (this.doc.pages.length <= 1) return
      this.doc.pages.splice(pageIndex, 1)
      this.doc.pages.forEach((p, i) => (p.index = i))
      this.setActivePage(Math.min(this.activePageIndex, this.doc.pages.length - 1))
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
    },
    reset() {
      this.doc = blankDocument()
      this.activePageIndex = 0
      this.selectedBlockId = null
    },
  },
})
