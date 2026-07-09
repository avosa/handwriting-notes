// Flattens the open note into plain text so Claude can work on what the writer already
// has: polishing it, continuing it, or summarising it. Only the words are sent, laid
// out simply, and the whole thing is capped so a long note stays a reasonable prompt.
import type { NoteDocument, TextRun } from '@/types'

const MAX_CHARS = 6000

function runsText(runs: TextRun[]): string {
  return runs.map((r) => r.text).join('')
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
