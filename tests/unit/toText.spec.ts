import { describe, it, expect } from 'vitest'
import { toPlainText, toMarkdown, toHtml } from '@/export/toText'
import type { NoteDocument } from '@/types'

function doc(): NoteDocument {
  return {
    id: 'd',
    title: 'Sets',
    createdAt: 0,
    updatedAt: 0,
    pages: [
      {
        id: 'p',
        index: 0,
        blocks: [
          { id: 't', type: 'text', text: { id: 'x', role: 'title', runs: [{ text: 'Sets' }] } },
          {
            id: 'b',
            type: 'text',
            text: { id: 'y', role: 'body', runs: [{ text: 'A set is ' }, { text: 'unordered', bold: true }] },
          },
          { id: 'l', type: 'list', ordered: true, items: [[{ text: 'one' }], [{ text: 'two' }]] },
          { id: 'tab', type: 'table', header: ['A', 'B'], rows: [['1', '2']] },
        ],
      },
    ],
  } as NoteDocument
}

describe('note text export', () => {
  it('writes Markdown with headings, emphasis, a list, and a table', () => {
    const md = toMarkdown(doc())
    expect(md).toContain('# Sets')
    expect(md).toContain('A set is **unordered**')
    expect(md).toContain('1. one')
    expect(md).toContain('| A | B |')
    expect(md).toContain('| --- | --- |')
  })

  it('writes plain text as words only, no markup', () => {
    const txt = toPlainText(doc())
    expect(txt).toContain('Sets')
    expect(txt).toContain('A set is unordered')
    expect(txt).not.toContain('**')
    expect(txt).not.toContain('#')
  })

  it('writes a self-contained HTML page with escaped, tagged content', () => {
    const html = toHtml(doc())
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<h1>Sets</h1>')
    expect(html).toContain('<strong>unordered</strong>')
    expect(html).toContain('<ol><li>one</li><li>two</li></ol>')
    expect(html).toContain('<th>A</th>')
  })

  it('writes a task list with its tick states', () => {
    const d = doc()
    d.pages[0].blocks.push({
      id: 'tl',
      type: 'list',
      ordered: false,
      items: [[{ text: 'buy milk' }], [{ text: 'call mum' }]],
      checked: [true, false],
    })
    const md = toMarkdown(d)
    expect(md).toContain('- [x] buy milk')
    expect(md).toContain('- [ ] call mum')
    const html = toHtml(d)
    expect(html).toContain('<input type="checkbox" disabled checked> buy milk')
    expect(html).toContain('<input type="checkbox" disabled> call mum')
  })

  it('writes a quote, a code block, and a divider in each format', () => {
    const d = doc()
    d.pages[0].blocks.push(
      { id: 'q', type: 'quote', runs: [{ text: 'to be' }] },
      { id: 'c', type: 'code', text: 'a\nb' },
      { id: 'hr', type: 'divider' },
    )
    const md = toMarkdown(d)
    expect(md).toContain('> to be')
    expect(md).toContain('```')
    expect(md).toContain('---')
    const html = toHtml(d)
    expect(html).toContain('<blockquote>to be</blockquote>')
    expect(html).toContain('<pre><code>a\nb</code></pre>')
    expect(html).toContain('<hr />')
  })

  it('escapes angle brackets so note text cannot inject markup', () => {
    const d = doc()
    d.pages[0].blocks[1] = { id: 'b', type: 'text', text: { id: 'y', role: 'body', runs: [{ text: '<script>x' }] } }
    expect(toHtml(d)).toContain('&lt;script&gt;x')
    expect(toHtml(d)).not.toContain('<script>x')
  })
})
