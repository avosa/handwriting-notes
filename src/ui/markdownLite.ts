// A tiny, safe Markdown reader for AI answers. It turns the plain Markdown a model returns into a
// small structured tree the chat renders with real elements (no innerHTML, so nothing in an
// answer can inject markup). It covers what models actually emit: headings, bullet and numbered
// lists, paragraphs, and inline bold / italic / code — plus [n] citations, which become chips.

export interface Span {
  kind: 'text' | 'bold' | 'italic' | 'code' | 'cite'
  text: string
  /** The citation number, when kind is 'cite'. */
  n?: number
}

export interface Block {
  kind: 'p' | 'h' | 'ul' | 'ol'
  /** Heading level 1..6, for an 'h' block. */
  level?: number
  /** Inline content for 'p' and 'h'. */
  spans?: Span[]
  /** One span list per item, for 'ul' and 'ol'. */
  items?: Span[][]
}

const HEADING = /^(#{1,6})\s+(.*)$/
const BULLET = /^\s*[-*]\s+(.*)$/
const NUMBERED = /^\s*\d+\.\s+(.*)$/
// Bold, then code, then italic (star or underscore), then a [n] citation. Bold is matched before
// italic so **x** is not read as two italics.
const INLINE = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\*([^*\n]+)\*)|(_([^_\n]+)_)|(\[(\d+)\])/g

// Break a line of text into typed inline spans.
export function parseInline(text: string): Span[] {
  const spans: Span[] = []
  let last = 0
  let m: RegExpExecArray | null
  INLINE.lastIndex = 0
  while ((m = INLINE.exec(text))) {
    if (m.index > last) spans.push({ kind: 'text', text: text.slice(last, m.index) })
    if (m[2] !== undefined) spans.push({ kind: 'bold', text: m[2] })
    else if (m[4] !== undefined) spans.push({ kind: 'code', text: m[4] })
    else if (m[6] !== undefined) spans.push({ kind: 'italic', text: m[6] })
    else if (m[8] !== undefined) spans.push({ kind: 'italic', text: m[8] })
    else if (m[10] !== undefined) spans.push({ kind: 'cite', text: m[10], n: Number(m[10]) })
    last = m.index + m[0].length
  }
  if (last < text.length) spans.push({ kind: 'text', text: text.slice(last) })
  return spans.length ? spans : [{ kind: 'text', text }]
}

// Break an answer into blocks: headings, lists, and paragraphs.
export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r/g, '').split('\n')
  const blocks: Block[] = []
  let i = 0
  const special = (l: string) => HEADING.test(l) || BULLET.test(l) || NUMBERED.test(l)
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const h = HEADING.exec(line)
    if (h) {
      blocks.push({ kind: 'h', level: h[1].length, spans: parseInline(h[2]) })
      i++
      continue
    }
    if (BULLET.test(line)) {
      const items: Span[][] = []
      while (i < lines.length && BULLET.test(lines[i])) {
        items.push(parseInline(BULLET.exec(lines[i])![1]))
        i++
      }
      blocks.push({ kind: 'ul', items })
      continue
    }
    if (NUMBERED.test(line)) {
      const items: Span[][] = []
      while (i < lines.length && NUMBERED.test(lines[i])) {
        items.push(parseInline(NUMBERED.exec(lines[i])![1]))
        i++
      }
      blocks.push({ kind: 'ol', items })
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !special(lines[i])) {
      para.push(lines[i])
      i++
    }
    blocks.push({ kind: 'p', spans: parseInline(para.join(' ')) })
  }
  return blocks
}
