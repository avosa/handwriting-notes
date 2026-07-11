// The local semantic index: it turns each note's blocks into on-device vectors and answers
// meaning-based searches over them. Everything here runs in the browser against IndexedDB —
// the corpus is indexed and searched without a single byte of note content leaving the device.
// This is the retrieval substrate the rest of the AI features stand on.
import { ref } from 'vue'
import type { Block, NoteDocument } from '@/types'
import { loadAllNotes, getAllVectors, putVector, deleteVector, deleteVectorsForNote } from '@/store/persistence'
import { embed, embedOne } from './embedder'

// How many blocks are embedded at a time, so a large library indexes in steady batches rather
// than one giant call that stalls the worker.
const BATCH = 16

export const indexing = ref(false)
export const indexedBlocks = ref(0)
export const totalBlocks = ref(0)

// The searchable text of one block, flattened across every block kind. A block with no words
// (a divider, a bare image) yields an empty string and is skipped.
export function blockText(block: Block): string {
  switch (block.type) {
    case 'text':
      return block.text.runs.map((r) => r.text).join('')
    case 'list':
      return block.items.map((item) => item.map((r) => r.text).join('')).join(' ')
    case 'table':
      return [block.header.join(' '), ...block.rows.map((row) => row.join(' ')), block.caption ?? ''].join(' ')
    case 'callouts':
      return block.boxes
        .map((b) =>
          [b.heading.map((r) => r.text).join(''), ...b.items.map((i) => i.map((r) => r.text).join(''))].join(' '),
        )
        .join(' ')
    case 'quote':
      return block.runs.map((r) => r.text).join('')
    case 'code':
      return block.text
    case 'math':
      return block.latex
    case 'toggle':
      return `${block.summary.map((r) => r.text).join('')} ${block.details}`
    case 'image':
      return block.alt ?? ''
    default:
      return ''
  }
}

// A tiny, fast, stable hash of a block's text, so an unchanged block is recognised and skipped
// on re-index rather than re-embedded.
function hashText(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

interface Unit {
  noteId: string
  blockId: string
  text: string
  hash: string
}

// Every embeddable unit of a note: one per block that carries words, plus the title as its own
// unit so a search can match a note by its heading alone.
function unitsOf(doc: NoteDocument): Unit[] {
  const units: Unit[] = []
  const title = doc.title.trim()
  if (title) units.push({ noteId: doc.id, blockId: '__title__', text: title, hash: hashText(title) })
  for (const page of doc.pages) {
    for (const block of page.blocks) {
      const text = blockText(block).trim()
      if (text) units.push({ noteId: doc.id, blockId: block.id, text, hash: hashText(text) })
    }
  }
  return units
}

// Bring one note's vectors in step with its current content: embed new or changed blocks, and
// drop vectors for blocks that are gone. Returns how many blocks were freshly embedded.
export async function indexNote(doc: NoteDocument): Promise<number> {
  const units = unitsOf(doc)
  const existing = new Map((await getAllVectors()).filter((v) => v.noteId === doc.id).map((v) => [v.blockId, v]))

  const stale = units.filter((u) => existing.get(u.blockId)?.hash !== u.hash)
  const liveIds = new Set(units.map((u) => u.blockId))
  // Drop vectors whose block no longer exists.
  for (const blockId of existing.keys()) {
    if (!liveIds.has(blockId)) await deleteVector(doc.id, blockId)
  }

  let embedded = 0
  for (let i = 0; i < stale.length; i += BATCH) {
    const batch = stale.slice(i, i + BATCH)
    const vectors = await embed(batch.map((u) => u.text))
    for (let j = 0; j < batch.length; j++) {
      const u = batch[j]
      await putVector({ noteId: u.noteId, blockId: u.blockId, text: u.text, hash: u.hash, vector: vectors[j] })
      embedded++
    }
  }
  return embedded
}

// Index (or refresh) the whole library, reporting progress so the UI can show a bar. Cheap on a
// second run because unchanged blocks are skipped by their hash.
export async function indexAll(): Promise<void> {
  if (indexing.value) return
  indexing.value = true
  try {
    const notes = await loadAllNotes()
    totalBlocks.value = notes.reduce((n, doc) => n + unitsOf(doc).length, 0)
    indexedBlocks.value = 0
    for (const doc of notes) {
      const units = unitsOf(doc)
      await indexNote(doc)
      indexedBlocks.value += units.length
    }
  } finally {
    indexing.value = false
  }
}

export async function removeNoteFromIndex(noteId: string): Promise<void> {
  await deleteVectorsForNote(noteId)
}

export interface SemanticHit {
  noteId: string
  blockId: string
  text: string
  score: number
}

function dot(a: number[], b: number[]): number {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

// The blocks most similar in meaning to a query, best first. Vectors are unit-length, so cosine
// similarity is a plain dot product. Brute force is ample at a student's scale; an approximate
// index can replace this if a library ever grows into the hundreds of thousands of blocks.
export async function searchBlocks(query: string, k = 20): Promise<SemanticHit[]> {
  const q = query.trim()
  if (!q) return []
  const qVec = await embedOne(q)
  const all = await getAllVectors()
  const scored = all.map((v) => ({ noteId: v.noteId, blockId: v.blockId, text: v.text, score: dot(qVec, v.vector) }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k)
}

// The most relevant notes for a query — the best-matching block per note — for a search list.
export async function searchNotes(query: string, k = 20): Promise<SemanticHit[]> {
  const hits = await searchBlocks(query, k * 4)
  const best = new Map<string, SemanticHit>()
  for (const hit of hits) {
    const prev = best.get(hit.noteId)
    if (!prev || hit.score > prev.score) best.set(hit.noteId, hit)
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, k)
}

// The centre of a set of unit vectors: their sum, renormalised. It represents a note as a whole
// so two notes can be compared by overall meaning rather than any single block.
function centroid(vectors: number[][]): number[] {
  const width = vectors[0]?.length ?? 0
  const c = new Array<number>(width).fill(0)
  for (const v of vectors) for (let i = 0; i < width; i++) c[i] += v[i]
  let mag = 0
  for (const x of c) mag += x * x
  mag = Math.sqrt(mag) || 1
  return c.map((x) => x / mag)
}

export interface RelatedNote {
  noteId: string
  score: number
}

// The notes closest in overall meaning to a given note — the engine behind "related notes" and
// semantic link suggestions. Compares note centroids, so it is about the whole note, not a word.
// Returns nothing until the note has been indexed (its blocks embedded).
export async function relatedNotes(noteId: string, k = 6): Promise<RelatedNote[]> {
  const byNote = new Map<string, number[][]>()
  for (const v of await getAllVectors()) {
    const list = byNote.get(v.noteId)
    if (list) list.push(v.vector)
    else byNote.set(v.noteId, [v.vector])
  }
  const mine = byNote.get(noteId)
  if (!mine || !mine.length) return []
  const cMine = centroid(mine)
  const out: RelatedNote[] = []
  for (const [id, vectors] of byNote) {
    if (id === noteId) continue
    out.push({ noteId: id, score: dot(cMine, centroid(vectors)) })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k)
}
