// A paragraph split across a page boundary is held as two blocks — a head and a continuation —
// so pagination can flow the tail onto the next sheet. That split is a display concern of the
// live pages, not of the words themselves, so every exporter rejoins them first: a note written
// out should read as whole paragraphs, and each exporter lays out its own pages anyway.
import type { Block, NoteDocument } from '@/types'

export function joinSplitParagraphs(doc: NoteDocument): NoteDocument {
  let prev: Extract<Block, { type: 'text' }> | null = null
  const pages = doc.pages.map((page) => {
    const blocks: Block[] = []
    for (const b of page.blocks) {
      if (b.type === 'text' && b.text.splitContinues && prev) {
        prev.text.runs = [...prev.text.runs, ...b.text.runs].filter((r) => r.text.length)
        if (!prev.text.runs.length) prev.text.runs = [{ text: '' }]
        continue
      }
      const copy = b.type === 'text' ? { ...b, text: { ...b.text, runs: [...b.text.runs] } } : b
      blocks.push(copy)
      prev = copy.type === 'text' ? copy : null
    }
    return { ...page, blocks }
  })
  return { ...doc, pages }
}
