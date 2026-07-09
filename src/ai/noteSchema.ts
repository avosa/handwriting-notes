// Validates and adopts the model's JSON into the document's block types. The model
// returns blocks without ids; this assigns them and drops anything malformed so a bad
// field can never crash the page. Dashes in generated prose are cleaned here too.
import type { Block, DiagramSpec, TextRole } from '@/types'
import { uid } from '@/util/id'
import { stripDashes } from './noteLint'

interface GeneratedResult {
  title?: string
  pages: Block[][]
}

const ROLES: TextRole[] = ['title', 'heading', 'body']
const DIAGRAM_KINDS = new Set(['scene', 'venn-subset', 'venn-overlap', 'venn-disjoint', 'venn-three', 'triangle'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function adoptBlock(raw: unknown): Block | null {
  if (!isRecord(raw)) return null
  if (raw.type === 'text' && typeof raw.content === 'string' && ROLES.includes(raw.role as TextRole)) {
    return {
      id: uid('b'),
      type: 'text',
      text: {
        id: uid('t'),
        role: raw.role as TextRole,
        content: stripDashes(raw.content),
        align: raw.align === 'justify' ? 'justify' : 'left',
        color: typeof raw.color === 'string' ? raw.color : undefined,
        bold: raw.bold === true,
      },
    }
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
