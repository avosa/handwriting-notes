// Writes the open note out as words rather than a picture: plain text for pasting anywhere,
// Markdown for a document that keeps its structure, and a self-contained HTML page. Each walks
// the same blocks and differs only in how a line is dressed, so the three never drift apart.
import type { Block, NoteDocument, Page, TextRun } from '@/types'
import { joinSplitParagraphs } from './continuations'
import katex from 'katex'

// Render a formula to MathML, which browsers draw natively without the KaTeX stylesheet, so the
// exported HTML stays self-contained. A formula the engine cannot parse falls back to its source.
function mathToMml(latex: string): string {
  try {
    return katex.renderToString(latex, { displayMode: true, throwOnError: false, trust: false, output: 'mathml' })
  } catch {
    return `$$${latex}$$`
  }
}

function plain(runs: TextRun[]): string {
  return runs.map((r) => r.text).join('')
}

function markdownRuns(runs: TextRun[]): string {
  return runs
    .map((r) => {
      let t = r.text
      if (!t) return ''
      if (r.bold) t = `**${t}**`
      if (r.italic) t = `*${t}*`
      if (r.link) t = `[${t}](${r.link})`
      return t
    })
    .join('')
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}

function htmlRuns(runs: TextRun[]): string {
  return runs
    .map((r) => {
      let t = escapeHtml(r.text)
      if (!t) return ''
      if (r.bold) t = `<strong>${t}</strong>`
      if (r.italic) t = `<em>${t}</em>`
      if (r.underline) t = `<u>${t}</u>`
      return t
    })
    .join('')
}

type Dress = { runs: (r: TextRun[]) => string }

// One list item ready to write out: its text, how deep it nests, and, on a task list, its tick.
interface ListRow {
  text: string
  level: number
  done?: boolean
}
function listRows(block: Extract<Block, { type: 'list' }>, d: Dress): ListRow[] {
  return block.items
    .map((it, i) => ({ text: d.runs(it).trim(), level: block.levels?.[i] ?? 0, done: block.checked?.[i] }))
    .filter((r) => r.text)
}
// Nest the flat rows into <ul>/<ol> by depth. Depths only ever step in by one, so a row deeper
// than the level being built opens a child list under the item just written.
function nestedHtml(rows: ListRow[], ordered: boolean, task: boolean): string {
  let i = 0
  const build = (level: number): string => {
    const tag = task ? 'ul' : ordered ? 'ol' : 'ul'
    let html = `<${tag}${task ? ' class="task"' : ''}>`
    while (i < rows.length && rows[i].level >= level) {
      if (rows[i].level > level) {
        html += build(rows[i].level)
        continue
      }
      const row = rows[i]
      i += 1
      const box = task ? `<input type="checkbox" disabled${row.done ? ' checked' : ''}> ` : ''
      let li = `<li>${box}${row.text}`
      if (i < rows.length && rows[i].level > level) li += build(rows[i].level)
      html += `${li}</li>`
    }
    return `${html}</${tag}>`
  }
  return rows.length ? build(rows[0].level) : ''
}
// Plain-text and Markdown lines: each row indented two spaces per level, so the nesting reads
// and a Markdown reader rebuilds the tree. Ordered items number within their own level.
function nestedTextLines(rows: ListRow[], ordered: boolean, task: boolean): string[] {
  const counters: number[] = []
  return rows.map((row) => {
    const pad = '  '.repeat(row.level)
    counters[row.level] = (counters[row.level] ?? 0) + 1
    for (let d = row.level + 1; d < counters.length; d++) counters[d] = 0
    if (task) return `${pad}- [${row.done ? 'x' : ' '}] ${row.text}`
    return ordered ? `${pad}${counters[row.level]}. ${row.text}` : `${pad}- ${row.text}`
  })
}

function blockLines(block: Block, d: Dress, kind: 'text' | 'md' | 'html', comment?: string): string[] {
  const out: string[] = []
  if (block.type === 'text') {
    const text = d.runs(block.text.runs).trim()
    if (!text) return out
    const role = block.text.role
    if (kind === 'md') {
      if (role === 'title') out.push(`# ${text}`)
      else if (role === 'heading') out.push(`## ${text}`)
      else if (role === 'subheading') out.push(`### ${text}`)
      else out.push(text)
    } else if (kind === 'html') {
      const tag = role === 'title' ? 'h1' : role === 'heading' ? 'h2' : role === 'subheading' ? 'h3' : 'p'
      out.push(`<${tag}>${text}</${tag}>`)
    } else {
      out.push(text)
    }
  } else if (block.type === 'list' && block.checked) {
    const rows = listRows(block, d)
    if (kind === 'html') out.push(nestedHtml(rows, block.ordered, true))
    else out.push(...nestedTextLines(rows, block.ordered, true))
  } else if (block.type === 'list') {
    const rows = listRows(block, d)
    if (kind === 'html') out.push(nestedHtml(rows, block.ordered, false))
    else out.push(...nestedTextLines(rows, block.ordered, false))
  } else if (block.type === 'table') {
    if (kind === 'html') {
      const head = `<tr>${block.header.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`
      const rows = block.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')
      out.push(`<table>${head}${rows}</table>`)
    } else if (kind === 'md') {
      out.push(`| ${block.header.join(' | ')} |`)
      out.push(`| ${block.header.map(() => '---').join(' | ')} |`)
      for (const row of block.rows) out.push(`| ${row.join(' | ')} |`)
    } else {
      out.push(block.header.join('\t'))
      for (const row of block.rows) out.push(row.join('\t'))
    }
  } else if (block.type === 'quote') {
    const text = d.runs(block.runs).trim()
    if (text) out.push(kind === 'html' ? `<blockquote>${text}</blockquote>` : `> ${text}`)
  } else if (block.type === 'code') {
    const code = block.text
    if (kind === 'html') out.push(`<pre><code>${escapeHtml(code)}</code></pre>`)
    else if (kind === 'md') out.push('```', code, '```')
    else out.push(...code.split('\n').map((l) => `    ${l}`))
  } else if (block.type === 'math') {
    const latex = block.latex.trim()
    if (latex) {
      if (kind === 'html') out.push(`<p>${mathToMml(latex)}</p>`)
      else out.push(`$$${latex}$$`)
    }
  } else if (block.type === 'toggle') {
    // A collapsible section exports open, so its notes are never hidden in a saved copy.
    const summary = d.runs(block.summary).trim()
    const details = block.details
    if (kind === 'html') {
      const body = details ? `<p>${escapeHtml(details).replace(/\n/g, '<br />')}</p>` : ''
      out.push(`<details open><summary>${summary || 'Section'}</summary>${body}</details>`)
    } else if (kind === 'md') {
      if (summary) out.push(`**${summary}**`)
      if (details) out.push(details)
    } else {
      if (summary) out.push(summary)
      if (details) out.push(...details.split('\n').map((l) => `  ${l}`))
    }
  } else if (block.type === 'divider') {
    out.push(kind === 'html' ? '<hr />' : kind === 'md' ? '---' : '⎯⎯⎯⎯⎯⎯⎯⎯')
  } else if (block.type === 'image') {
    const label = block.alt?.trim() || 'image'
    out.push(kind === 'html' ? `<p><em>[${escapeHtml(label)}]</em></p>` : `[${label}]`)
  } else if (block.type === 'callouts') {
    for (const box of block.boxes) {
      const heading = d.runs(box.heading).trim()
      const items = box.items.map((it) => d.runs(it).trim()).filter(Boolean)
      if (kind === 'html') {
        out.push(
          `<blockquote><strong>${heading}</strong><ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul></blockquote>`,
        )
      } else if (kind === 'md') {
        if (heading) out.push(`> **${heading}**`)
        for (const t of items) out.push(`> ${t}`)
      } else {
        if (heading) out.push(heading)
        for (const t of items) out.push(`  ${t}`)
      }
    }
  }
  // The writer's own comment on this block travels with it as a marked aside.
  const note = comment?.trim()
  if (note) {
    if (kind === 'html') out.push(`<aside class="comment">💬 ${escapeHtml(note)}</aside>`)
    else if (kind === 'md') out.push(`> 💬 ${note}`)
    else out.push(`  💬 ${note}`)
  }
  return out
}

function pageLines(page: Page, d: Dress, kind: 'text' | 'md' | 'html', comments?: Record<string, string>): string[] {
  const out: string[] = []
  for (const block of page.blocks) out.push(...blockLines(block, d, kind, comments?.[block.id]))
  for (const note of page.notes ?? []) {
    const text = d.runs(note.runs).trim()
    if (text) out.push(kind === 'html' ? `<p>${text}</p>` : text)
  }
  return out
}

export function toPlainText(doc: NoteDocument): string {
  doc = joinSplitParagraphs(doc)
  const d = { runs: plain }
  const lines: string[] = []
  if (doc.title.trim()) lines.push(doc.title.trim(), '')
  for (const page of doc.pages) lines.push(...pageLines(page, d, 'text', doc.comments))
  return (
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

export function toMarkdown(doc: NoteDocument): string {
  doc = joinSplitParagraphs(doc)
  const d = { runs: markdownRuns }
  const lines: string[] = []
  if (doc.title.trim()) lines.push(`# ${doc.title.trim()}`, '')
  for (const page of doc.pages) lines.push(...pageLines(page, d, 'md', doc.comments), '')
  return (
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

export function toHtml(doc: NoteDocument): string {
  doc = joinSplitParagraphs(doc)
  const d = { runs: htmlRuns }
  const body: string[] = []
  for (const page of doc.pages) body.push(...pageLines(page, d, 'html', doc.comments))
  const title = escapeHtml(doc.title.trim() || 'Note')
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${title}</title>`,
    '<style>body{max-width:44rem;margin:2rem auto;padding:0 1rem;font:16px/1.6 system-ui,sans-serif}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}blockquote{border-left:3px solid #ccc;margin:1em 0;padding-left:1em}</style>',
    '</head>',
    '<body>',
    `<h1>${title}</h1>`,
    ...body,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

// The note as a fragment of clean, semantic HTML — the title heading then every block — for a
// reading view that shows the writing as plain typography instead of handwriting. Reuses the same
// block-to-HTML conversion as the full export, so every kind of block renders the same way here.
export function noteBodyHtml(doc: NoteDocument): string {
  doc = joinSplitParagraphs(doc)
  const d = { runs: htmlRuns }
  const title = escapeHtml(doc.title.trim() || 'Note')
  const body: string[] = [`<h1>${title}</h1>`]
  for (const page of doc.pages) body.push(...pageLines(page, d, 'html', doc.comments))
  return body.join('\n')
}

// Turn a note title into a safe file stem, so a saved file is named after the note without
// stray slashes or spaces tripping up the download.
export function fileStem(title: string): string {
  const stem = title
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return stem || 'note'
}

export type TextFormat = 'txt' | 'md' | 'html'

const RENDER: Record<TextFormat, { build: (doc: NoteDocument) => string; mime: string }> = {
  txt: { build: toPlainText, mime: 'text/plain' },
  md: { build: toMarkdown, mime: 'text/markdown' },
  html: { build: toHtml, mime: 'text/html' },
}

export function exportNoteAsText(doc: NoteDocument, format: TextFormat): void {
  const { build, mime } = RENDER[format]
  const blob = new Blob([build(doc)], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileStem(doc.title)}.${format}`
  link.click()
  URL.revokeObjectURL(url)
}
