import { describe, it, expect } from 'vitest'
import { parseGeneratedNotes } from '@/ai/noteSchema'

describe('parseGeneratedNotes', () => {
  it('adopts a well formed reply into blocks with ids', () => {
    const reply = JSON.stringify({
      title: 'Fractions',
      pages: [
        [
          { type: 'text', role: 'title', content: 'Fractions' },
          { type: 'text', role: 'body', content: 'A fraction is a part of a whole.', align: 'justify' },
          {
            type: 'diagram',
            heightRules: 8,
            spec: {
              kind: 'venn-disjoint',
              universeLabel: 'U',
              left: { label: 'A', color: '#000' },
              right: { label: 'B', color: '#111' },
              caption: 'apart',
            },
          },
        ],
      ],
    })
    const { title, pages } = parseGeneratedNotes(reply)
    expect(title).toBe('Fractions')
    expect(pages[0]).toHaveLength(3)
    expect(pages[0][0].id).toBeTruthy()
  })

  it('drops malformed blocks but keeps the good ones', () => {
    const reply = JSON.stringify({
      pages: [
        [
          { type: 'text', role: 'body', content: 'kept' },
          { type: 'text', role: 'nonsense', content: 'x' },
          { junk: true },
        ],
      ],
    })
    const { pages } = parseGeneratedNotes(reply)
    expect(pages[0]).toHaveLength(1)
  })

  it('finds the JSON even with stray text around it', () => {
    const reply = 'Here you go:\n{"pages":[[{"type":"text","role":"body","content":"hi"}]]}\nHope that helps'
    expect(parseGeneratedNotes(reply).pages[0]).toHaveLength(1)
  })

  it('strips dashes from generated prose', () => {
    const reply = JSON.stringify({ pages: [[{ type: 'text', role: 'body', content: 'a — b' }]] })
    const block = parseGeneratedNotes(reply).pages[0][0]
    expect(block.type === 'text' && block.text.content).toBe('a, b')
  })

  it('rejects a reply with no pages', () => {
    expect(() => parseGeneratedNotes('{"pages":[]}')).toThrow()
  })
})
