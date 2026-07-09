// The edits the model returns when it is correcting a note rather than adding to it. Each
// edit names a block by the id the note was shown with, so the app can act on exactly that
// line: rewrite its words, remove it, or place new writing after it. Anything malformed is
// dropped so a bad edit can never harm the note.
import type { Block, TextRun } from '@/types'
import { adoptBlock, adoptRuns } from './noteSchema'

export type EditOp =
  | { op: 'replace'; id: string; runs: TextRun[] }
  | { op: 'delete'; id: string }
  | { op: 'insertAfter'; id: string; blocks: Block[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// True when the reply is a set of edits (a correction) rather than whole pages (an addition).
export function isEditReply(raw: unknown): boolean {
  return isRecord(raw) && Array.isArray(raw.edits)
}

export function parseEdits(raw: unknown): EditOp[] {
  if (!isRecord(raw) || !Array.isArray(raw.edits)) return []
  const out: EditOp[] = []
  for (const entry of raw.edits) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue
    if (entry.op === 'replace') {
      out.push({ op: 'replace', id: entry.id, runs: adoptRuns(entry.content ?? entry.runs) })
    } else if (entry.op === 'delete') {
      out.push({ op: 'delete', id: entry.id })
    } else if (entry.op === 'insertAfter') {
      const raw = Array.isArray(entry.blocks) ? entry.blocks : [entry.block]
      const blocks = raw.map((b) => adoptBlock(b)).filter((b): b is Block => b !== null)
      if (blocks.length) out.push({ op: 'insertAfter', id: entry.id, blocks })
    }
  }
  return out
}
