import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDocument } from '@/store/document'

describe('document store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('opens on one blank page with a single empty line', () => {
    const doc = useDocument()
    expect(doc.doc.pages).toHaveLength(1)
    expect(doc.doc.pages[0].blocks).toHaveLength(1)
    const first = doc.doc.pages[0].blocks[0]
    expect(first.type).toBe('text')
  })

  it('inserts a heading after a block and can retype its role', () => {
    const doc = useDocument()
    const firstId = doc.doc.pages[0].blocks[0].id
    const id = doc.addParagraphAfter(firstId, 'heading')
    const block = doc.locate(id)?.block
    expect(block?.type === 'text' && block.text.role).toBe('heading')
    doc.setRole(id, 'title')
    expect(doc.locate(id)?.block).toMatchObject({ text: { role: 'title' } })
  })

  it('breaks a page so the rest continues on a new one', () => {
    const doc = useDocument()
    const firstId = doc.doc.pages[0].blocks[0].id
    const second = doc.addParagraphAfter(firstId, 'body')
    doc.breakPageAt(firstId)
    expect(doc.doc.pages).toHaveLength(2)
    expect(doc.locate(second)?.pageIndex).toBe(1)
  })

  it('fills a stroke by id', () => {
    const doc = useDocument()
    doc.addStroke(0, { id: 's1', tool: 'fine', color: '#000', width: 1, points: [{ x: 0, y: 0, pressure: 1 }] })
    doc.fillStroke(0, 's1', '#4A72B0')
    expect(doc.doc.pages[0].strokes[0].fill).toBe('#4A72B0')
  })
})
