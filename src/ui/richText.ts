// Converts between the stored runs of a paragraph and the HTML shown in an editable
// element. Editing happens in the browser's contenteditable; on every change the DOM
// is read back into runs so the document stays plain data the exporters can render.
import type { TextRun } from '@/types'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function plainText(runs: TextRun[]): string {
  return runs.map((r) => r.text).join('')
}

export function runsToHtml(runs: TextRun[]): string {
  if (runs.length === 0) return ''
  return runs
    .map((run) => {
      let html = escapeHtml(run.text) || '\u200B'
      if (run.underline) html = `<u>${html}</u>`
      if (run.italic) html = `<i>${html}</i>`
      if (run.bold) html = `<b>${html}</b>`
      const styles: string[] = []
      if (run.color) styles.push(`color:${run.color}`)
      if (run.highlight) styles.push(`background-color:${run.highlight}`)
      if (styles.length) html = `<span style="${styles.join(';')}">${html}</span>`
      if (run.link) html = `<a href="${escapeHtml(run.link)}" class="rt-link">${html}</a>`
      return html
    })
    .join('')
}

interface Marks {
  bold: boolean
  italic: boolean
  underline: boolean
  color?: string
  highlight?: string
  link?: string
}

function marksFor(node: Node, root: Node): Marks {
  const marks: Marks = { bold: false, italic: false, underline: false }
  let el: Node | null = node
  while (el && el !== root) {
    if (el.nodeType === 1) {
      const element = el as HTMLElement
      const tag = element.tagName
      if (tag === 'B' || tag === 'STRONG') marks.bold = true
      if (tag === 'I' || tag === 'EM') marks.italic = true
      if (tag === 'U') marks.underline = true
      if (tag === 'A' && !marks.link) {
        const href = element.getAttribute('href')
        if (href) marks.link = href
      }
      const weight = element.style.fontWeight
      if (weight === 'bold' || Number(weight) >= 600) marks.bold = true
      if (element.style.fontStyle === 'italic') marks.italic = true
      if (
        element.style.textDecorationLine?.includes('underline') ||
        element.style.textDecoration?.includes('underline')
      )
        marks.underline = true
      if (!marks.color && element.style.color) marks.color = element.style.color
      if (
        !marks.highlight &&
        element.style.backgroundColor &&
        element.style.backgroundColor !== 'transparent' &&
        !element.style.backgroundColor.includes('rgba(0, 0, 0, 0)')
      )
        marks.highlight = element.style.backgroundColor
    }
    el = el.parentNode
  }
  return marks
}

function sameMarks(a: TextRun, b: Marks): boolean {
  return (
    !!a.bold === b.bold &&
    !!a.italic === b.italic &&
    !!a.underline === b.underline &&
    (a.color ?? '') === (b.color ?? '') &&
    (a.highlight ?? '') === (b.highlight ?? '') &&
    (a.link ?? '') === (b.link ?? '')
  )
}

export function htmlToRuns(root: HTMLElement): TextRun[] {
  const runs: TextRun[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const text = (node.textContent ?? '').replace(/\u200B/g, '')
    if (text) {
      const marks = marksFor(node, root)
      const last = runs[runs.length - 1]
      if (last && sameMarks(last, marks)) {
        last.text += text
      } else {
        runs.push({
          text,
          ...(marks.bold ? { bold: true } : {}),
          ...(marks.italic ? { italic: true } : {}),
          ...(marks.underline ? { underline: true } : {}),
          ...(marks.color ? { color: marks.color } : {}),
          ...(marks.highlight ? { highlight: marks.highlight } : {}),
          ...(marks.link ? { link: marks.link } : {}),
        })
      }
    }
    node = walker.nextNode()
  }
  return runs.length ? runs : [{ text: '' }]
}

export function textRun(text: string, marks: Partial<TextRun> = {}): TextRun {
  return { text, ...marks }
}

// The emphasis, colour, and link of a run without its text, and whether two runs wear the
// same, so replaced text can inherit the formatting around it and merge cleanly into a run.
function formatOf(run: TextRun): Omit<TextRun, 'text'> {
  const marks: Omit<TextRun, 'text'> = {}
  if (run.bold) marks.bold = true
  if (run.italic) marks.italic = true
  if (run.underline) marks.underline = true
  if (run.color) marks.color = run.color
  if (run.highlight) marks.highlight = run.highlight
  if (run.link) marks.link = run.link
  return marks
}
function sameFormat(a: TextRun, b: TextRun): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    (a.color ?? '') === (b.color ?? '') &&
    (a.highlight ?? '') === (b.highlight ?? '') &&
    (a.link ?? '') === (b.link ?? '')
  )
}
// How many times a query appears in a line of runs, matched without regard to case.
export function countInRuns(runs: TextRun[], query: string): number {
  if (!query) return 0
  const haystack = plainText(runs).toLowerCase()
  const needle = query.toLowerCase()
  let count = 0
  let at = haystack.indexOf(needle)
  while (at !== -1) {
    count++
    at = haystack.indexOf(needle, at + needle.length)
  }
  return count
}
// Replace every case-insensitive occurrence of a query in a line of runs, giving the new text
// the formatting of the run it replaces so bold or coloured words keep their look around the
// edit. Returns the rewritten runs and how many were replaced.
export function replaceInRuns(runs: TextRun[], query: string, replacement: string): { runs: TextRun[]; count: number } {
  if (!query) return { runs, count: 0 }
  const text = plainText(runs)
  const lower = text.toLowerCase()
  const needle = query.toLowerCase()
  const owner: TextRun[] = []
  for (const run of runs) for (let i = 0; i < run.text.length; i++) owner.push(run)

  const chars: { ch: string; run: TextRun }[] = []
  let i = 0
  let count = 0
  while (i < text.length) {
    if (lower.startsWith(needle, i)) {
      const mark = owner[i] ?? runs[0] ?? { text: '' }
      for (const ch of replacement) chars.push({ ch, run: mark })
      i += query.length
      count++
    } else {
      chars.push({ ch: text[i], run: owner[i] ?? runs[0] ?? { text: '' } })
      i++
    }
  }
  if (!count) return { runs, count: 0 }

  const result: TextRun[] = []
  for (const { ch, run } of chars) {
    const last = result[result.length - 1]
    if (last && sameFormat(last, run)) last.text += ch
    else result.push({ text: ch, ...formatOf(run) })
  }
  return { runs: result.length ? result : [{ text: '' }], count }
}

// Split a line of runs at a character offset, keeping each run's emphasis, so pressing enter
// in the middle of a line carries the words after the caret onto the next line unchanged.
export function splitRuns(runs: TextRun[], offset: number): [TextRun[], TextRun[]] {
  const before: TextRun[] = []
  const after: TextRun[] = []
  let remaining = offset
  for (const run of runs) {
    if (remaining >= run.text.length) {
      before.push(run)
      remaining -= run.text.length
    } else if (remaining <= 0) {
      after.push(run)
    } else {
      before.push({ ...run, text: run.text.slice(0, remaining) })
      after.push({ ...run, text: run.text.slice(remaining) })
      remaining = 0
    }
  }
  return [before.length ? before : [{ text: '' }], after.length ? after : [{ text: '' }]]
}

// A leading list marker a copy brought along: a number, a letter, or a bullet glyph.
const LIST_MARKER = /^\s*(?:\d+[.)]|[a-zA-Z][.)]|[-*•·▪◦‣▸►–—])\s+/
function cleanLine(line: string): string {
  return line.replace(LIST_MARKER, '').trim()
}

// Turn pasted text into clean lines: one per line, with any marker and surrounding whitespace
// stripped, so what lands adopts the note's own formatting rather than the source's.
export function splitPasteText(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(cleanLine)
    .filter((line) => line.length > 0)
}

// A pasted block, grouped by the blank lines between its parts. A part on its own is a
// heading; a run of parts is a list.
export interface PasteGroup {
  heading?: string
  items?: string[]
}

// Read the shape out of a pasted block: sections separated by blank lines, where a lone line
// reads as a heading and a run of lines reads as a list. This lets a copied set of sections
// land as headings with our own bullets under each, numbering restarting per list.
export function parsePasteGroups(text: string): PasteGroup[] {
  const groups: PasteGroup[] = []
  for (const raw of text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/)) {
    const lines = raw
      .split('\n')
      .map(cleanLine)
      .filter((line) => line.length > 0)
    if (!lines.length) continue
    if (lines.length === 1) groups.push({ heading: lines[0] })
    else groups.push({ items: lines })
  }
  return groups
}
