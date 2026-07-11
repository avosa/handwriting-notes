import { describe, it, expect } from 'vitest'
import { runsToHtml, htmlToRuns, plainText, splitRuns, splitPasteText, parsePasteGroups } from '@/ui/richText'
import { safeUrl } from '@/editor/marks'

describe('links', () => {
  it('accepts web and mail addresses, adds https to a bare domain, and refuses the rest', () => {
    expect(safeUrl('example.com/x')).toBe('https://example.com/x')
    expect(safeUrl('https://a.co/y')).toBe('https://a.co/y')
    expect(safeUrl('mailto:a@b.com')).toBe('mailto:a@b.com')
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('  ')).toBeNull()
  })

  it('round-trips a link through html and back to a run', () => {
    const html = runsToHtml([{ text: 'docs', link: 'https://a.co/' }])
    expect(html).toContain('href="https://a.co/"')
    const host = document.createElement('div')
    host.innerHTML = html
    expect(htmlToRuns(host)[0].link).toBe('https://a.co/')
  })
})

describe('parsePasteGroups', () => {
  it('reads a pasted block as headings over numbered lists, restarting per section', () => {
    const groups = parsePasteGroups('ACROSS\n\n1. ONE\n2. TWO\n\nDOWN\n\n- A\n- B')
    expect(groups).toEqual([
      { heading: 'ACROSS' },
      { items: ['ONE', 'TWO'] },
      { heading: 'DOWN' },
      { items: ['A', 'B'] },
    ])
  })
})

describe('splitPasteText', () => {
  it('strips the markers and whitespace a copied list carried, one clean line each', () => {
    const text = '1. DERMATOLOGIST\n2. STICKS\n  3.  ADD  \n- LAMB\n• SINUSITIS'
    expect(splitPasteText(text)).toEqual(['DERMATOLOGIST', 'STICKS', 'ADD', 'LAMB', 'SINUSITIS'])
  })
  it('keeps a plain horizontal line as one clean item and drops blank lines', () => {
    expect(splitPasteText('  just one line  ')).toEqual(['just one line'])
    expect(splitPasteText('a\n\n\nb')).toEqual(['a', 'b'])
  })
})

describe('splitRuns', () => {
  it('splits a line at the caret, keeping emphasis on both sides', () => {
    const runs = [{ text: 'Derm', bold: true }, { text: 'atologist' }]
    const [before, after] = splitRuns(runs, 4)
    expect(before).toEqual([{ text: 'Derm', bold: true }])
    expect(after).toEqual([{ text: 'atologist' }])
    const [b2, a2] = splitRuns(runs, 5)
    expect(plainText(b2)).toBe('Derma')
    expect(plainText(a2)).toBe('tologist')
  })
  it('never returns an empty side as nothing', () => {
    expect(splitRuns([{ text: 'x' }], 0)).toEqual([[{ text: '' }], [{ text: 'x' }]])
    expect(splitRuns([{ text: 'x' }], 1)).toEqual([[{ text: 'x' }], [{ text: '' }]])
  })
})

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
