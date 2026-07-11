// Chat with your notes, grounded in the local semantic index. A question is embedded on-device,
// the most relevant blocks are retrieved from the user's own corpus, and only those blocks are
// handed to the model as the source of truth — so the answer is about the user's material, cited
// back to their notes, rather than a generic chatbot guess. Retrieval is fully local; only the
// final completion uses the connected provider (and will use the on-device model once that lands).
import { ref } from 'vue'
import { getProvider } from '@/ai/providers'
import { loadApiKey } from '@/store/persistence'
import { useSettings } from '@/store/settings'
import { useLibrary } from '@/store/library'
import { indexAll, searchBlocks } from '@/ai/embeddings/semanticIndex'

export interface ChatSource {
  n: number
  noteId: string
  title: string
  text: string
  score: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  sources?: ChatSource[]
  streaming?: boolean
}

// The answer is bound to the retrieved notes: cite them, and admit when they do not cover the
// question instead of inventing an answer. This is what makes it more trustworthy than a generic
// chatbot on the user's own material.
const RAG_SYSTEM = `You are a study assistant that answers strictly from the user's own notes, provided below as a numbered list.
Rules:
- Use ONLY those notes as your source of truth. Do not add outside facts.
- Cite the notes you drew on inline with their numbers in square brackets, like [1] or [2][3].
- If the notes do not contain enough to answer, say so plainly (for example: "Your notes don't cover this yet") rather than guessing.
- Be clear and concise, and answer in the user's own terms.`

// How many blocks of context to ground each answer on. Enough to be useful, few enough to keep
// the prompt tight and the citations legible.
const TOP_K = 8

export function useNotesChat() {
  const settings = useSettings()
  const library = useLibrary()

  const messages = ref<ChatMessage[]>([])
  const busy = ref(false)
  const error = ref<string | null>(null)
  const needsKey = ref(false)

  let controller: AbortController | null = null

  function reset(): void {
    messages.value = []
    error.value = null
  }
  function stop(): void {
    controller?.abort()
  }

  async function ask(question: string): Promise<void> {
    const q = question.trim()
    if (!q || busy.value) return
    error.value = null
    needsKey.value = false

    const provider = getProvider(settings.activeProvider)
    const key = await loadApiKey(provider.id)
    if (!key) {
      needsKey.value = true
      return
    }

    messages.value.push({ role: 'user', text: q })
    const idx = messages.value.push({ role: 'assistant', text: '', sources: [], streaming: true }) - 1
    busy.value = true

    try {
      // Warm and refresh the local index (downloads the model once), then retrieve from the
      // live library only — trashed and archived notes never ground an answer.
      await indexAll()
      const liveIds = new Set(library.recent.map((e) => e.id))
      const hits = (await searchBlocks(q, TOP_K * 3)).filter((h) => liveIds.has(h.noteId)).slice(0, TOP_K)
      const titleOf = (id: string) => library.entries.find((e) => e.id === id)?.title || 'Untitled'
      const sources: ChatSource[] = hits.map((h, i) => ({
        n: i + 1,
        noteId: h.noteId,
        title: titleOf(h.noteId),
        text: h.text,
        score: h.score,
      }))
      messages.value[idx].sources = sources

      if (!sources.length) {
        messages.value[idx].text =
          "I couldn't find anything about that in your notes yet. Write a note on it and ask again."
        return
      }

      const context = sources.map((s) => `[${s.n}] (${s.title}) ${s.text}`).join('\n')
      const prompt = `MY NOTES:\n${context}\n\nQUESTION: ${q}`
      controller = new AbortController()
      const request = { system: RAG_SYSTEM, prompt, attachments: [], maxTokens: 1000 }
      for await (const delta of provider.stream(request, key, controller.signal)) {
        messages.value[idx].text += delta
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        error.value = `Could not get an answer from ${provider.name}. Check your key and connection.`
      }
    } finally {
      messages.value[idx].streaming = false
      busy.value = false
      controller = null
    }
  }

  return { messages, busy, error, needsKey, ask, stop, reset }
}
