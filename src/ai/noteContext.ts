// Flattens the open note into plain text so the AI can work on what the writer already
// has: polishing it, continuing it, or summarising it. Only the words are sent, laid
// out simply, and the whole thing is capped so a long note stays a reasonable prompt.
import type { NoteDocument, TextRun } from '@/types'

const MAX_CHARS = 6000

function runsText(runs: TextRun[]): string {
  return runs.map((r) => r.text).join('')
}

// A tag that marks whether a span of text is highlighted, so the model can see a stray
// highlight it needs to clear and target the exact line carrying it.
function marks(runs: TextRun[]): string {
  const highlighted = runs.some((r) => r.highlight && r.text.trim())
  return highlighted ? ' {highlighted}' : ''
}

// The note laid out with each editable line labelled by its block id, so the model can point
// at exactly the line to correct. Used when working on a note, where a fix must land on a
// specific line rather than being written anew.
export function noteToAddressableText(doc: NoteDocument): string {
  const lines: string[] = []
  for (const page of doc.pages) {
    for (const block of page.blocks) {
      if (block.type === 'text') {
        const text = runsText(block.text.runs).trim()
        const role = block.text.role === 'body' ? '' : `${block.text.role}: `
        lines.push(`[${block.id}] ${role}${text}${marks(block.text.runs)}`)
      } else if (block.type === 'list') {
        const items = block.items.map((it) => runsText(it).trim()).filter(Boolean)
        lines.push(`[${block.id}] list: ${items.join(' | ')}`)
      } else if (block.type === 'table') {
        lines.push(`[${block.id}] table: ${block.caption ?? ''}`)
      } else if (block.type === 'callouts') {
        lines.push(`[${block.id}] callouts: ${block.caption ?? ''}`)
      } else if (block.type === 'diagram') {
        const spec = block.spec
        const caption = spec.kind !== 'scene' && 'caption' in spec ? spec.caption : ''
        lines.push(`[${block.id}] figure: ${caption}`)
      }
    }
  }
  const text = lines.join('\n')
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}…` : text
}

export function noteToText(doc: NoteDocument): string {
  const lines: string[] = []
  for (const page of doc.pages) {
    for (const block of page.blocks) {
      if (block.type === 'text') {
        const text = runsText(block.text.runs).trim()
        if (!text) continue
        if (block.text.role === 'title') lines.push(`# ${text}`)
        else if (block.text.role === 'heading') lines.push(`## ${text}`)
        else if (block.text.role === 'subheading') lines.push(`### ${text}`)
        else if (block.text.role === 'caption') lines.push(`(${text})`)
        else lines.push(text)
      } else if (block.type === 'list') {
        block.items.forEach((item, i) => {
          const text = runsText(item).trim()
          if (text) lines.push(block.ordered ? `${i + 1}. ${text}` : `- ${text}`)
        })
      } else if (block.type === 'table') {
        if (block.caption) lines.push(`(${block.caption})`)
        lines.push(block.header.join(' | '))
        for (const row of block.rows) lines.push(row.join(' | '))
      } else if (block.type === 'callouts') {
        if (block.caption) lines.push(`(${block.caption})`)
        for (const box of block.boxes) {
          lines.push(`[${runsText(box.heading)}] ${box.items.map(runsText).join('; ')}`)
        }
      } else if (block.type === 'quote') {
        const text = runsText(block.runs).trim()
        if (text) lines.push(`> ${text}`)
      } else if (block.type === 'code') {
        if (block.text.trim()) lines.push('```', block.text, '```')
      } else if (block.type === 'toggle') {
        const summary = runsText(block.summary).trim()
        if (summary) lines.push(summary)
        if (block.details.trim()) lines.push(block.details)
      } else if (block.type === 'diagram') {
        const spec = block.spec
        if (spec.kind !== 'scene' && 'caption' in spec && spec.caption) lines.push(`(figure: ${spec.caption})`)
      }
    }
    for (const note of page.notes ?? []) {
      const text = runsText(note.runs).trim()
      if (text) lines.push(text)
    }
  }
  const text = lines.join('\n')
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}…` : text
}
