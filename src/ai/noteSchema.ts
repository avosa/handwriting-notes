// Validates and adopts the model's JSON into the document's block types. The model
// returns blocks without ids; this assigns them and drops anything malformed so a bad
// field can never crash the page. Dashes in generated prose are cleaned here too.
import type { Block, CalloutBox, DiagramSpec, TextRole, TextRun } from '@/types'
import { uid } from '@/util/id'
import { stripDashes } from './noteLint'

interface GeneratedResult {
  title?: string
  pages: Block[][]
}

const ROLES: TextRole[] = ['title', 'subtitle', 'heading', 'subheading', 'body', 'caption']
const DIAGRAM_KINDS = new Set(['scene', 'venn-subset', 'venn-overlap', 'venn-disjoint', 'venn-three', 'triangle'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// A run may arrive as a plain string or as a marked object; normalise either, and
// clean dashes out of generated prose.
function adoptRuns(value: unknown): TextRun[] {
  if (typeof value === 'string') return [{ text: stripDashes(value) }]
  if (Array.isArray(value)) {
    const runs = value
      .filter(isRecord)
      .filter((r) => typeof r.text === 'string')
      .map((r) => ({
        text: stripDashes(r.text as string),
        ...(r.bold ? { bold: true } : {}),
        ...(r.italic ? { italic: true } : {}),
        ...(r.underline ? { underline: true } : {}),
        ...(typeof r.color === 'string' ? { color: r.color } : {}),
        ...(typeof r.highlight === 'string' ? { highlight: r.highlight } : {}),
      }))
    return runs.length ? runs : [{ text: '' }]
  }
  return [{ text: '' }]
}

export function adoptBlock(raw: unknown): Block | null {
  if (!isRecord(raw)) return null

  if (raw.type === 'text' && ROLES.includes(raw.role as TextRole)) {
    return {
      id: uid('b'),
      type: 'text',
      text: {
        id: uid('t'),
        role: raw.role as TextRole,
        runs: adoptRuns(raw.content ?? raw.runs ?? raw.text),
        align: raw.align === 'justify' || raw.align === 'center' ? raw.align : 'left',
      },
    }
  }
  if (raw.type === 'list' && Array.isArray(raw.items)) {
    return { id: uid('b'), type: 'list', ordered: raw.ordered === true, items: raw.items.map(adoptRuns) }
  }
  if (raw.type === 'table' && Array.isArray(raw.header) && Array.isArray(raw.rows)) {
    return {
      id: uid('b'),
      type: 'table',
      header: raw.header.map((h) => String(h)),
      rows: raw.rows.map((row) => (Array.isArray(row) ? row.map((c) => String(c)) : [])),
      caption: typeof raw.caption === 'string' ? raw.caption : undefined,
    }
  }
  if (raw.type === 'callouts' && Array.isArray(raw.boxes)) {
    const boxes: CalloutBox[] = raw.boxes.filter(isRecord).map((b) => ({
      color: typeof b.color === 'string' ? b.color : '#4A72B0',
      heading: adoptRuns(b.heading),
      items: Array.isArray(b.items) ? b.items.map(adoptRuns) : [[{ text: '' }]],
    }))
    return { id: uid('b'), type: 'callouts', boxes, caption: typeof raw.caption === 'string' ? raw.caption : undefined }
  }
  if (raw.type === 'diagram' && isRecord(raw.spec) && DIAGRAM_KINDS.has(raw.spec.kind as string)) {
    const height = typeof raw.heightRules === 'number' ? Math.round(raw.heightRules) : 9
    return {
      id: uid('b'),
      type: 'diagram',
      spec: raw.spec as unknown as DiagramSpec,
      heightRules: Math.max(4, Math.min(16, height)),
    }
  }
  return null
}

/** Pull the first JSON object out of a model reply that may hold stray text. */
function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw new Error('The reply held no JSON object.')
  return JSON.parse(text.slice(start, end + 1))
}

export function parseGeneratedNotes(reply: string): { title?: string; pages: Block[][] } {
  const parsed = extractJson(reply) as GeneratedResult
  if (!isRecord(parsed) || !Array.isArray(parsed.pages)) {
    throw new Error('The reply was not in the expected notes format.')
  }
  const pages = parsed.pages
    .map((page) => (Array.isArray(page) ? page.map(adoptBlock).filter((b): b is Block => b !== null) : []))
    .filter((page) => page.length > 0)
  if (pages.length === 0) throw new Error('The reply contained no usable note blocks.')
  return { title: typeof parsed.title === 'string' ? parsed.title : undefined, pages }
}
