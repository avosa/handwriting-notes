import { describe, it, expect } from 'vitest'
import { markdownToBlocks, titleFromFilename } from '@/ingest/ingest'

describe('markdownToBlocks', () => {
  it('turns headings, paragraphs, and lists into note blocks', () => {
    const blocks = markdownToBlocks(`# Ancient Greece

Greece sits on a rocky peninsula.

- city states
- philosophy`)
    expect(blocks[0]).toMatchObject({ type: 'text', text: { role: 'heading' } })
    expect(blocks[0].type === 'text' && blocks[0].text.runs[0].text).toBe('Ancient Greece')
    expect(blocks[1]).toMatchObject({ type: 'text', text: { role: 'body' } })
    expect(blocks[2].type).toBe('list')
    expect(blocks[2].type === 'list' && blocks[2].items.length).toBe(2)
  })

  it('keeps bold and italic emphasis on imported runs', () => {
    const [block] = markdownToBlocks('This is **bold** and *soft*.')
    expect(block.type).toBe('text')
    if (block.type === 'text') {
      expect(block.text.runs.some((r) => r.text === 'bold' && r.bold)).toBe(true)
      expect(block.text.runs.some((r) => r.text === 'soft' && r.italic)).toBe(true)
    }
  })

  it('reads plain text as paragraphs', () => {
    const blocks = markdownToBlocks('First line.\n\nSecond paragraph.')
    expect(blocks).toHaveLength(2)
    expect(blocks.every((b) => b.type === 'text')).toBe(true)
  })
})

describe('titleFromFilename', () => {
  it('drops the extension and tidies separators', () => {
    expect(titleFromFilename('ancient_greece-notes.md')).toBe('ancient greece notes')
    expect(titleFromFilename('report.txt')).toBe('report')
    expect(titleFromFilename('.md')).toBe('Imported note')
  })
})
