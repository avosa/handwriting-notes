// Wiki-style links between notes. A writer joins notes by typing the target's title in double
// brackets, like [[Cell biology]]. This module reads every note once, resolves those brackets
// to real notes by title, and answers the three questions the UI asks: what a note links out
// to, what links back to it, and the whole graph of connections for the map view.
import { ref } from 'vue'
import { loadAllNotes } from '@/store/persistence'
import { toPlainText } from '@/export/toText'

export interface GraphNode {
  id: string
  title: string
}
export interface GraphEdge {
  from: string
  to: string
}

interface Indexed {
  title: string
  /** Titles referenced by this note, as written inside the brackets, lowercased and trimmed. */
  targets: string[]
}

const LINK_RE = /\[\[([^[\]]+)]]/g

// Every [[title]] reference in a piece of text, normalised for matching. Exposed for tests.
export function parseWikiLinks(text: string): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  LINK_RE.lastIndex = 0
  while ((m = LINK_RE.exec(text))) {
    const name = m[1].trim().toLowerCase()
    if (name) out.push(name)
  }
  return out
}

// id -> the note's title and the links it makes.
const index = ref(new Map<string, Indexed>())
// A lowercased title -> note id, so a bracketed title resolves to the note it names.
const byTitle = ref(new Map<string, string>())

export async function buildLinkIndex(liveIds?: Set<string>): Promise<void> {
  const notes = await loadAllNotes()
  const next = new Map<string, Indexed>()
  const titles = new Map<string, string>()
  for (const note of notes) {
    if (liveIds && !liveIds.has(note.id)) continue
    const title = note.title.trim()
    const key = title.toLowerCase()
    if (key && !titles.has(key)) titles.set(key, note.id)
    next.set(note.id, { title, targets: parseWikiLinks(toPlainText(note)) })
  }
  index.value = next
  byTitle.value = titles
}

export function useLinkGraph() {
  // The notes a given note links out to, resolved to ids, de-duplicated, and never itself.
  function linksOut(id: string): GraphNode[] {
    const entry = index.value.get(id)
    if (!entry) return []
    const seen = new Set<string>()
    const out: GraphNode[] = []
    for (const name of entry.targets) {
      const target = byTitle.value.get(name)
      if (target && target !== id && !seen.has(target)) {
        seen.add(target)
        out.push({ id: target, title: index.value.get(target)?.title ?? name })
      }
    }
    return out
  }

  // The notes that link to a given note.
  function backlinks(id: string): GraphNode[] {
    const title = index.value.get(id)?.title.toLowerCase()
    if (!title) return []
    const out: GraphNode[] = []
    for (const [otherId, entry] of index.value) {
      if (otherId === id) continue
      if (entry.targets.includes(title)) out.push({ id: otherId, title: entry.title })
    }
    return out.sort((a, b) => a.title.localeCompare(b.title))
  }

  // The whole graph: a node per known note and an edge per resolved link. Only notes that take
  // part in at least one link are returned, so the map stays about connections.
  function graph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const edges: GraphEdge[] = []
    const involved = new Set<string>()
    for (const id of index.value.keys()) {
      for (const target of linksOut(id)) {
        edges.push({ from: id, to: target.id })
        involved.add(id)
        involved.add(target.id)
      }
    }
    const nodes: GraphNode[] = [...involved].map((id) => ({ id, title: index.value.get(id)?.title ?? 'Untitled' }))
    return { nodes, edges }
  }

  return { linksOut, backlinks, graph }
}
