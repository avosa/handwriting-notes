// The core tools every skin and agent gets for free: reading and listing notes, changing blocks,
// tagging, semantic retrieval, and generation. Each wraps machinery that already exists (the
// document and library stores, the on-device index, the AI providers) behind one uniform,
// permission-checked surface, so a new vertical or an agent talks to these rather than to the
// internals.
import type { Block, NoteDocument } from '@/types'
import { useDocument } from '@/store/document'
import { useLibrary } from '@/store/library'
import { registerTool } from './tools'

// The plain words of a block, across the kinds that carry text, so a reader gets something useful
// without the kernel depending on the rendering layer.
function blockText(block: Block): string {
  switch (block.type) {
    case 'text':
      return block.text.runs.map((r) => r.text).join('')
    case 'list':
      return block.items.map((i) => i.map((r) => r.text).join('')).join(' ')
    case 'table':
      return [block.header.join(' '), ...block.rows.map((row) => row.join(' '))].join(' ')
    case 'quote':
      return block.runs.map((r) => r.text).join('')
    case 'code':
      return block.text
    case 'math':
      return block.latex
    case 'toggle':
      return `${block.summary.map((r) => r.text).join('')} ${block.details}`
    default:
      return ''
  }
}

function findBlock(doc: NoteDocument, blockId: string): Block | undefined {
  for (const page of doc.pages) {
    const block = page.blocks.find((b) => b.id === blockId)
    if (block) return block
  }
  return undefined
}

interface BlockView {
  id: string
  type: Block['type']
  text: string
}
function blockViews(doc: NoteDocument): BlockView[] {
  return doc.pages.flatMap((page) => page.blocks.map((b) => ({ id: b.id, type: b.type, text: blockText(b) })))
}

// --- Reads -------------------------------------------------------------------------------------

registerTool({
  name: 'note.read',
  description: 'Read the open note: its id, title, and blocks as plain text.',
  capability: 'read',
  resource: () => ({ kind: 'note' }),
  input: {},
  run: () => {
    const doc = useDocument().doc
    return { id: doc.id, title: doc.title, blocks: blockViews(doc) }
  },
})

registerTool({
  name: 'note.list',
  description: 'List the notes in the library, newest first, as id, title, and last-edited time.',
  capability: 'read',
  resource: () => ({ kind: 'corpus' }),
  input: {},
  run: () => useLibrary().recent.map((e) => ({ id: e.id, title: e.title, updatedAt: e.updatedAt })),
})

registerTool({
  name: 'block.list',
  description: 'List the blocks of the open note as id, kind, and plain text.',
  capability: 'read',
  resource: () => ({ kind: 'note' }),
  input: {},
  run: () => blockViews(useDocument().doc),
})

// --- Writes ------------------------------------------------------------------------------------

registerTool<{ title: string }, { ok: true }>({
  name: 'note.rename',
  description: 'Set the title of the open note.',
  capability: 'write',
  resource: () => ({ kind: 'note' }),
  input: { title: 'The new title.' },
  run: ({ title }) => {
    useDocument().setTitle(title)
    return { ok: true }
  },
})

registerTool<{ tag: string }, { ok: true }>({
  name: 'note.tag',
  description: 'Add or remove a tag on the open note.',
  capability: 'write',
  resource: () => ({ kind: 'note' }),
  input: { tag: 'The tag to toggle.' },
  run: ({ tag }) => {
    const library = useLibrary()
    library.toggleTag(library.currentId, tag)
    return { ok: true }
  },
})

registerTool<{ blockId: string; text: string }, { ok: boolean }>({
  name: 'block.update',
  description: "Replace a text block's words with new plain text, keeping its role.",
  capability: 'write',
  resource: ({ blockId }) => ({ kind: 'block', blockId }),
  input: { blockId: 'Which block to change.', text: 'The new plain text.' },
  run: ({ blockId, text }) => {
    const documentStore = useDocument()
    const block = findBlock(documentStore.doc, blockId)
    if (!block || block.type !== 'text') return { ok: false }
    documentStore.updateBlock(blockId, { text: { ...block.text, runs: [{ text }] } })
    return { ok: true }
  },
})

registerTool<{ blockId: string }, { ok: true }>({
  name: 'block.remove',
  description: 'Remove a block from the open note.',
  capability: 'delete',
  resource: ({ blockId }) => ({ kind: 'block', blockId }),
  input: { blockId: 'Which block to remove.' },
  run: ({ blockId }) => {
    useDocument().removeBlock(blockId)
    return { ok: true }
  },
})

// --- Retrieval ---------------------------------------------------------------------------------

registerTool<{ query: string; k?: number }, { noteId: string; title: string; text: string; score: number }[]>({
  name: 'search',
  description: 'Find the notes most relevant to a query by meaning, on-device.',
  capability: 'retrieve',
  resource: () => ({ kind: 'corpus' }),
  input: { query: 'What to search for.', k: 'How many results (optional).' },
  run: async ({ query, k }) => {
    const { indexAll, searchNotes } = await import('@/ai/embeddings/semanticIndex')
    const library = useLibrary()
    await indexAll()
    const live = new Set(library.recent.map((e) => e.id))
    const titleOf = (id: string) => library.entries.find((e) => e.id === id)?.title || 'Untitled'
    return (await searchNotes(query, k ?? 10))
      .filter((h) => live.has(h.noteId))
      .map((h) => ({ noteId: h.noteId, title: titleOf(h.noteId), text: h.text, score: h.score }))
  },
})

registerTool<{ noteId?: string; k?: number }, { noteId: string; score: number }[]>({
  name: 'note.related',
  description: 'Find the notes most similar in meaning to a note (the open one by default).',
  capability: 'retrieve',
  resource: ({ noteId }) => ({ kind: 'note', noteId }),
  input: { noteId: 'Which note (optional; defaults to the open note).', k: 'How many (optional).' },
  run: async ({ noteId, k }) => {
    const { relatedNotes } = await import('@/ai/embeddings/semanticIndex')
    const id = noteId ?? useDocument().doc.id
    return relatedNotes(id, k ?? 6)
  },
})

// --- Generation --------------------------------------------------------------------------------

registerTool<{ prompt: string; system?: string }, { text: string }>({
  name: 'generate',
  description: 'Generate text from a prompt, on-device where possible, else the connected provider.',
  capability: 'generate',
  resource: () => ({ kind: 'corpus' }),
  input: { prompt: 'The instruction or question.', system: 'Optional guidance for the model.' },
  run: async ({ prompt, system }) => {
    const settings = (await import('@/store/settings')).useSettings()
    const sys = system ?? 'You are a concise, helpful assistant.'
    const { webgpuAvailable, localStream } = await import('@/ai/local/localLlm')
    if (settings.localAiEnabled && webgpuAvailable()) {
      const { modelById } = await import('@/ai/local/localModels')
      let text = ''
      for await (const delta of localStream(modelById(settings.localModelId).mlcId, sys, prompt, 1000)) text += delta
      return { text }
    }
    const { getProvider } = await import('@/ai/providers')
    const { loadApiKey } = await import('@/store/persistence')
    const provider = getProvider(settings.activeProvider)
    const key = await loadApiKey(provider.id)
    if (!key) throw new Error('No AI is configured: connect a key or turn on on-device AI.')
    return { text: await provider.complete(sys, prompt, key, 1000) }
  },
})
