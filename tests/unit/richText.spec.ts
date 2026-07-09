import { describe, it, expect } from 'vitest'
import { runsToHtml, htmlToRuns, plainText } from '@/ui/richText'

function parse(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

describe('rich text runs', () => {
  it('renders marks as tags and inline styles', () => {
    const html = runsToHtml([{ text: 'plain ' }, { text: 'bold', bold: true }, { text: ' red', color: '#ff0000' }])
    expect(html).toContain('<b>bold</b>')
    expect(html).toContain('color:#ff0000')
  })

  it('reads emphasis back out of the DOM', () => {
    const runs = htmlToRuns(parse('<b>hi</b> there'))
    expect(runs[0]).toMatchObject({ text: 'hi', bold: true })
    expect(runs[1]).toMatchObject({ text: ' there' })
  })

  it('round-trips a coloured underlined run', () => {
    const original = [{ text: 'note', underline: true, color: 'rgb(41, 41, 126)' }]
    const runs = htmlToRuns(parse(runsToHtml(original)))
    expect(runs[0].underline).toBe(true)
    expect(plainText(runs)).toBe('note')
  })

  it('never returns an empty list', () => {
    expect(htmlToRuns(parse(''))).toEqual([{ text: '' }])
  })
})
