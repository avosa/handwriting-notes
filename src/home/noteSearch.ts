// A small local search over the whole library. Every note's words are read once into an index
// held in memory, so typing in the search box matches note contents, not only titles, with no
// server and no per-keystroke disk reads. The index is rebuilt when the library changes.
import { ref } from 'vue'
import { loadAllNotes } from '@/store/persistence'
import { toPlainText } from '@/export/toText'
import { fuzzyHit } from '@/util/fuzzy'

interface Indexed {
  /** The note's plain text, kept in original case so a snippet reads naturally. */
  text: string
  /** The note's unique lowercased words, for typo-tolerant matching without re-tokenising. */
  tokens: string[]
}

// id -> the note's indexed text and vocabulary.
const index = ref(new Map<string, Indexed>())
const building = ref(false)

function tokenize(text: string): string[] {
  const seen = new Set<string>()
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (word) seen.add(word)
  }
  return [...seen]
}

export async function buildSearchIndex(): Promise<void> {
  building.value = true
  try {
    const notes = await loadAllNotes()
    const next = new Map<string, Indexed>()
    for (const note of notes) {
      const text = toPlainText(note)
      next.set(note.id, { text, tokens: tokenize(`${note.title}\n${text}`) })
    }
    index.value = next
  } finally {
    building.value = false
  }
}

export function useNoteSearch() {
  // Whether a note's title or body contains every whitespace-separated term in the query, so a
  // multi-word search narrows rather than widens. A term that is not found as a plain substring
  // falls back to a typo-tolerant match against the note's words, so a small mistype still hits.
  function matches(id: string, title: string, query: string): boolean {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) return true
    const entry = index.value.get(id)
    const hay = `${title}\n${entry?.text ?? ''}`.toLowerCase()
    const tokens = entry?.tokens ?? tokenize(title)
    return terms.every((t) => hay.includes(t) || fuzzyHit(tokens, t))
  }

  // A short slice of the body around the first matched term, so a result shows why it matched.
  // When the term was matched by tolerance rather than exactly, the nearest word is located so
  // the snippet still centres on the reason it matched.
  function snippet(id: string, query: string): string {
    const entry = index.value.get(id)
    const body = entry?.text ?? ''
    const term = query.trim().toLowerCase().split(/\s+/).filter(Boolean)[0]
    if (!term) return body.slice(0, 90).trim()
    let at = body.toLowerCase().indexOf(term)
    if (at === -1) at = fuzzyIndex(body, term)
    if (at === -1) return body.slice(0, 90).trim()
    const start = Math.max(0, at - 30)
    const raw = body
      .slice(start, at + term.length + 50)
      .replace(/\s+/g, ' ')
      .trim()
    return (start > 0 ? '…' : '') + raw + (at + term.length + 50 < body.length ? '…' : '')
  }

  return { matches, snippet, building }
}

// Where in the body the first word close enough to the term begins, or -1. Used only when an
// exact substring was not found, so the snippet can still land on the near-miss word.
function fuzzyIndex(body: string, term: string): number {
  const lower = body.toLowerCase()
  const re = /[\p{L}\p{N}]+/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(lower))) {
    if (fuzzyHit([m[0]], term)) return m.index
  }
  return -1
}
