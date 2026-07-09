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

  it('writes into the blank first page instead of opening a second one', () => {
    const doc = useDocument()
    const pageIndex = doc.beginAiPage()
    expect(pageIndex).toBe(0)
    expect(doc.doc.pages).toHaveLength(1)
    expect(doc.doc.pages[0].blocks).toHaveLength(0)
    doc.appendAiBlock(0, { id: 'b1', type: 'text', text: { id: 't1', role: 'body', runs: [{ text: 'Hello' }] } })
    doc.endAi()
    // The note stays a single page and rests on the line just written.
    expect(doc.doc.pages).toHaveLength(1)
    expect(doc.selectedBlockId).toBe('b1')
  })

  it('continues on a fresh page when the current one already holds writing', () => {
    const doc = useDocument()
    doc.setRuns(doc.doc.pages[0].blocks[0].id, [{ text: 'Existing note' }])
    const pageIndex = doc.beginAiPage()
    expect(pageIndex).toBe(1)
    expect(doc.doc.pages).toHaveLength(2)
    doc.appendAiBlock(1, { id: 'b2', type: 'text', text: { id: 't2', role: 'body', runs: [{ text: 'More' }] } })
    doc.endAi()
    expect(doc.selectedBlockId).toBe('b2')
  })

  it('rewrites the note in place when revising, and undo restores the original', () => {
    const doc = useDocument()
    const first = doc.doc.pages[0].blocks[0].id
    doc.setRuns(first, [{ text: 'Original messy note' }])
    doc.addParagraphAfter(first, 'body')
    const plain = () =>
      doc.doc.pages
        .flatMap((p) => p.blocks)
        .map((b) => (b.type === 'text' ? b.text.runs.map((r) => r.text).join('') : ''))
        .join(' ')

    const pageIndex = doc.beginAiPage(true) // revise: clears the note for a full rewrite
    expect(pageIndex).toBe(0)
    expect(doc.doc.pages).toHaveLength(1)
    expect(doc.doc.pages[0].blocks).toHaveLength(0)
    doc.appendAiBlock(0, {
      id: 'r1',
      type: 'text',
      text: { id: 't', role: 'body', runs: [{ text: 'Corrected note' }] },
    })
    doc.endAi()
    // The corrected note replaced the original rather than being added after it.
    expect(plain()).toContain('Corrected note')
    expect(plain()).not.toContain('Original messy note')
    // One undo brings the original note back.
    doc.undo()
    expect(plain()).toContain('Original messy note')
  })

  it('restores a blank line when a run on the only page produced nothing', () => {
    const doc = useDocument()
    doc.beginAiPage()
    doc.endAi()
    expect(doc.doc.pages).toHaveLength(1)
    expect(doc.doc.pages[0].blocks).toHaveLength(1)
    expect(doc.doc.pages[0].blocks[0].type).toBe('text')
  })

  it('drops an empty continuation page a failed run left behind', () => {
    const doc = useDocument()
    doc.setRuns(doc.doc.pages[0].blocks[0].id, [{ text: 'Existing note' }])
    doc.beginAiPage()
    doc.endAi()
    expect(doc.doc.pages).toHaveLength(1)
    expect(doc.activePageIndex).toBe(0)
  })

  it('fills a stroke by id', () => {
    const doc = useDocument()
    doc.addStroke(0, { id: 's1', tool: 'fine', color: '#000', width: 1, points: [{ x: 0, y: 0, pressure: 1 }] })
    doc.fillStroke(0, 's1', '#4A72B0')
    expect(doc.doc.pages[0].strokes[0].fill).toBe('#4A72B0')
  })
})
