// Writes the open note out as words rather than a picture: plain text for pasting anywhere,
// Markdown for a document that keeps its structure, and a self-contained HTML page. Each walks
// the same blocks and differs only in how a line is dressed, so the three never drift apart.
import type { Block, NoteDocument, Page, TextRun } from '@/types'

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

function blockLines(block: Block, d: Dress, kind: 'text' | 'md' | 'html'): string[] {
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
    const checked = block.checked
    if (kind === 'html') {
      const lis = block.items
        .map((it, i) => {
          const t = d.runs(it).trim()
          return t ? `<li><input type="checkbox" disabled${checked[i] ? ' checked' : ''}> ${t}</li>` : ''
        })
        .filter(Boolean)
        .join('')
      out.push(`<ul>${lis}</ul>`)
    } else {
      block.items.forEach((it, i) => {
        const t = d.runs(it).trim()
        if (t) out.push(`- [${checked[i] ? 'x' : ' '}] ${t}`)
      })
    }
  } else if (block.type === 'list') {
    const items = block.items.map((it) => d.runs(it).trim()).filter(Boolean)
    if (kind === 'html') {
      const tag = block.ordered ? 'ol' : 'ul'
      out.push(`<${tag}>${items.map((t) => `<li>${t}</li>`).join('')}</${tag}>`)
    } else {
      items.forEach((t, i) => out.push(block.ordered ? `${i + 1}. ${t}` : `- ${t}`))
    }
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
  return out
}

function pageLines(page: Page, d: Dress, kind: 'text' | 'md' | 'html'): string[] {
  const out: string[] = []
  for (const block of page.blocks) out.push(...blockLines(block, d, kind))
  for (const note of page.notes ?? []) {
    const text = d.runs(note.runs).trim()
    if (text) out.push(kind === 'html' ? `<p>${text}</p>` : text)
  }
  return out
}

export function toPlainText(doc: NoteDocument): string {
  const d = { runs: plain }
  const lines: string[] = []
  if (doc.title.trim()) lines.push(doc.title.trim(), '')
  for (const page of doc.pages) lines.push(...pageLines(page, d, 'text'))
  return (
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

export function toMarkdown(doc: NoteDocument): string {
  const d = { runs: markdownRuns }
  const lines: string[] = []
  if (doc.title.trim()) lines.push(`# ${doc.title.trim()}`, '')
  for (const page of doc.pages) lines.push(...pageLines(page, d, 'md'), '')
  return (
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

export function toHtml(doc: NoteDocument): string {
  const d = { runs: htmlRuns }
  const body: string[] = []
  for (const page of doc.pages) body.push(...pageLines(page, d, 'html'))
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
