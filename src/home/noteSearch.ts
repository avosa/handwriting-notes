// A small local search over the whole library. Every note's words are read once into an index
// held in memory, so typing in the search box matches note contents, not only titles, with no
// server and no per-keystroke disk reads. The index is rebuilt when the library changes.
import { ref } from 'vue'
import { loadAllNotes } from '@/store/persistence'
import { toPlainText } from '@/export/toText'

// id -> the note's plain text, kept in original case so a snippet reads naturally.
const index = ref(new Map<string, string>())
const building = ref(false)

export async function buildSearchIndex(): Promise<void> {
  building.value = true
  try {
    const notes = await loadAllNotes()
    const next = new Map<string, string>()
    for (const note of notes) next.set(note.id, toPlainText(note))
    index.value = next
  } finally {
    building.value = false
  }
}

export function useNoteSearch() {
  // Whether a note's title or body contains every whitespace-separated term in the query, so a
  // multi-word search narrows rather than widens.
  function matches(id: string, title: string, query: string): boolean {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) return true
    const hay = `${title}\n${index.value.get(id) ?? ''}`.toLowerCase()
    return terms.every((t) => hay.includes(t))
  }

  // A short slice of the body around the first matched term, so a result shows why it matched.
  function snippet(id: string, query: string): string {
    const body = index.value.get(id) ?? ''
    const term = query.trim().toLowerCase().split(/\s+/).filter(Boolean)[0]
    if (!term) return body.slice(0, 90).trim()
    const at = body.toLowerCase().indexOf(term)
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
