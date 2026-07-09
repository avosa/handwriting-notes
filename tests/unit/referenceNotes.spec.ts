import { describe, it, expect } from 'vitest'
import { referenceDocument } from '@/content/referenceNotes'
import { hasProseDash } from '@/ai/noteLint'
import { toScene } from '@/diagrams/diagramSpec'

describe('reference document', () => {
  const doc = referenceDocument()

  it('opens on the seven pages of the sample notes', () => {
    expect(doc.pages).toHaveLength(7)
    expect(doc.title).toContain('Sets and Venn Diagrams')
  })

  it('opens each page on a blue title', () => {
    for (const page of doc.pages) {
      const first = page.blocks.find((b) => b.type === 'text')
      expect(first && first.type === 'text' && first.text.role).toBe('title')
    }
  })

  it('carries the four kinds of hand-drawn figure the sample uses', () => {
    const specs = doc.pages.flatMap((p) => p.blocks.filter((b) => b.type === 'diagram').map((b) => b.spec))
    const kinds = new Set(specs.map((s) => s.kind))
    expect(kinds.has('venn-subset')).toBe(true)
    expect(kinds.has('venn-overlap')).toBe(true)
    expect(kinds.has('venn-disjoint')).toBe(true)
    expect(kinds.has('venn-three')).toBe(true)
    // Every diagram expands into drawable shapes.
    for (const spec of specs) {
      expect(toScene(spec).shapes.length).toBeGreaterThan(0)
    }
  })

  it('keeps prose free of dashes used as punctuation', () => {
    for (const page of doc.pages) {
      for (const block of page.blocks) {
        if (block.type === 'text') expect(hasProseDash(block.text.content)).toBe(false)
      }
    }
  })
})
