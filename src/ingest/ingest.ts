// The ingestion seam: anything the writer brings in becomes blocks, then a note, then part of the
// searchable, chattable corpus. Every source — a pasted page, an imported Markdown or text file,
// and later a PDF, a doc, or an email — is a converter to blocks that lands on the same pipe, so a
// new format is a new adapter here and nothing else changes.
import type { Block, TextRun, TextRole } from '@/types'
import { parseMarkdown, type Span } from '@/ui/markdownLite'
import { useLibrary } from '@/store/library'
import { uid } from '@/util/id'

// Keep the emphasis a source carried (bold, italic); citations are dropped, and other spans become
// plain words.
function spansToRuns(spans: Span[]): TextRun[] {
  const runs = spans
    .filter((s) => s.kind !== 'cite')
    .map((s) => {
      const run: TextRun = { text: s.text }
      if (s.kind === 'bold') run.bold = true
      if (s.kind === 'italic') run.italic = true
      return run
    })
  return runs.length ? runs : [{ text: '' }]
}

function paragraph(role: TextRole, spans: Span[]): Block {
  return { id: uid('b'), type: 'text', text: { id: uid('t'), role, runs: spansToRuns(spans) } }
}

// Turn Markdown (or plain text, which the parser reads as paragraphs) into note blocks: headings
// become heading lines, paragraphs become body lines, and bullet or numbered lists become lists.
export function markdownToBlocks(source: string): Block[] {
  const blocks: Block[] = []
  for (const block of parseMarkdown(source)) {
    if (block.kind === 'h') {
      blocks.push(paragraph((block.level ?? 2) <= 1 ? 'heading' : 'subheading', block.spans ?? []))
    } else if (block.kind === 'p') {
      blocks.push(paragraph('body', block.spans ?? []))
    } else if (block.kind === 'ul' || block.kind === 'ol') {
      blocks.push({
        id: uid('b'),
        type: 'list',
        ordered: block.kind === 'ol',
        items: (block.items ?? []).map((item) => spansToRuns(item)),
      })
    }
  }
  return blocks
}

// Plain text and Markdown both flow through the Markdown reader, which treats blank-line-separated
// text as paragraphs, so a .txt and a .md import the same clean way.
export const textToBlocks = markdownToBlocks

// A friendly note title from a file name: drop the extension and tidy separators.
export function titleFromFilename(name: string): string {
  return (
    name
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim() || 'Imported note'
  )
}

// The whole pipe for text-like content: convert to blocks and open it as a new note. Returns the
// new note's id. Other sources (PDF, docx) become adapters that produce blocks and call the same
// library import.
export async function ingestTextDocument(title: string, source: string): Promise<string> {
  return useLibrary().importNote(title, markdownToBlocks(source))
}
