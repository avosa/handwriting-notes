// The note document: pages, the blocks that flow down each page, and the ink strokes
// drawn over them. Opens on the reference notes so the app looks like the sample the
// moment it loads. Every mutation bumps updatedAt so persistence knows to save.
import { defineStore } from 'pinia'
import type { Block, NoteDocument, Stroke, TextBlock } from '@/types'
import { referenceDocument } from '@/content/referenceNotes'
import { defaultPresetId } from '@/paper/sheetSpec'
import { uid } from '@/util/id'

interface DocumentState {
  doc: NoteDocument
  activePageIndex: number
}

export const useDocument = defineStore('document', {
  state: (): DocumentState => ({
    doc: referenceDocument(),
    activePageIndex: 0,
  }),
  getters: {
    pageCount: (state) => state.doc.pages.length,
    activePage: (state) => state.doc.pages[state.activePageIndex] ?? state.doc.pages[0],
  },
  actions: {
    touch() {
      this.doc.updatedAt = Date.now()
    },
    setActivePage(index: number) {
      this.activePageIndex = Math.max(0, Math.min(index, this.doc.pages.length - 1))
    },
    addStroke(pageIndex: number, stroke: Stroke) {
      const page = this.doc.pages[pageIndex]
      if (!page) return
      page.strokes.push(stroke)
      this.touch()
    },
    eraseStrokes(pageIndex: number, ids: Set<string>) {
      const page = this.doc.pages[pageIndex]
      if (!page) return
      page.strokes = page.strokes.filter((s) => !ids.has(s.id))
      this.touch()
    },
    updateTextBlock(blockId: string, patch: Partial<TextBlock>) {
      for (const page of this.doc.pages) {
        const block = page.blocks.find((b) => b.id === blockId && b.type === 'text')
        if (block && block.type === 'text') {
          Object.assign(block.text, patch)
          this.touch()
          return
        }
      }
    },
    addBlankPage(): number {
      const index = this.doc.pages.length
      this.doc.pages.push({ id: uid('p'), index, presetId: defaultPresetId, blocks: [], strokes: [] })
      this.touch()
      return index
    },
    /** Flow a run of generated blocks onto new pages appended after the current ones. */
    appendGeneratedPages(pages: Block[][]) {
      for (const blocks of pages) {
        this.doc.pages.push({
          id: uid('p'),
          index: this.doc.pages.length,
          presetId: defaultPresetId,
          blocks,
          strokes: [],
        })
      }
      this.touch()
    },
    replaceDocument(doc: NoteDocument) {
      this.doc = doc
      this.activePageIndex = 0
    },
    resetToReference() {
      this.doc = referenceDocument()
      this.activePageIndex = 0
    },
    hydrate(doc: NoteDocument) {
      this.doc = doc
      this.activePageIndex = 0
    },
  },
})
