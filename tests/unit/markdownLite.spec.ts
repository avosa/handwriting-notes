import { describe, it, expect } from 'vitest'
import { parseInline, parseMarkdown } from '@/ui/markdownLite'

describe('parseInline', () => {
  it('splits bold, italic, code, and citations', () => {
    expect(parseInline('plain **bold** and *it* and `x` and [7] end')).toEqual([
      { kind: 'text', text: 'plain ' },
      { kind: 'bold', text: 'bold' },
      { kind: 'text', text: ' and ' },
      { kind: 'italic', text: 'it' },
      { kind: 'text', text: ' and ' },
      { kind: 'code', text: 'x' },
      { kind: 'text', text: ' and ' },
      { kind: 'cite', text: '7', n: 7 },
      { kind: 'text', text: ' end' },
    ])
  })

  it('does not read bold as two italics', () => {
    expect(parseInline('**Ancient Greece**')).toEqual([{ kind: 'bold', text: 'Ancient Greece' }])
  })
})

describe('parseMarkdown', () => {
  it('reads headings, paragraphs, and bullet lists (the shape a model returns)', () => {
    const src = `Based on your notes, here's what you have on **Ancient Greece**:

- **Foundations**: early civilizations [7] and geography [2]
- **Culture**: philosophy [5]`
    const blocks = parseMarkdown(src)
    expect(blocks[0].kind).toBe('p')
    expect(blocks[0].spans?.some((s) => s.kind === 'bold' && s.text === 'Ancient Greece')).toBe(true)
    expect(blocks[1].kind).toBe('ul')
    expect(blocks[1].items).toHaveLength(2)
    // A citation inside a list item is parsed as a chip.
    expect(blocks[1].items?.[0].some((s) => s.kind === 'cite' && s.n === 7)).toBe(true)
  })

  it('reads numbered lists', () => {
    const blocks = parseMarkdown('1. first\n2. second')
    expect(blocks[0].kind).toBe('ol')
    expect(blocks[0].items).toHaveLength(2)
  })
})
