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
import { useDocument } from '@/store/document'
import { useAi } from './useAi'
import { indexAll, searchBlocks } from '@/ai/embeddings/semanticIndex'
import { webgpuAvailable, localStream } from '@/ai/local/localLlm'
import { modelById } from '@/ai/local/localModels'

// A quick, call-free guess at whether a message wants the note changed, used when there is no
// provider key to classify with (on-device only). Leans toward answering to avoid unwanted edits.
const EDIT_HINT =
  /\b(rewrite|re-write|edit|revise|add|insert|append|fix|correct|change|replace|make it|turn (it|this)|shorten|expand|elaborate|restructure|reword|rephrase|format|tidy|clean up|improve|update|delete|remove|bullet|summari[sz]e (it|this|the note))\b/i

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
  /** Set while the assistant is changing the note rather than answering, so the UI can say so. */
  mode?: 'edit'
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

// Routes a message to the right kind of help: changing the note, or answering about it. The chat
// can do everything "Write with AI" can — rewrite, add, restructure, tidy — as well as answer.
const ROUTE_SYSTEM = `You route a message from someone working on their OWN notes. Reply with exactly one word and nothing else:
EDIT — if they want you to change the note: rewrite, add, insert, fix, shorten, expand, restructure, reword, format, or otherwise modify it.
ASK — if they want an answer, explanation, summary to read, quiz, or a question answered.
Reply only EDIT or ASK.`

// How many blocks of context to ground each answer on. Enough to be useful, few enough to keep
// the prompt tight and the citations legible.
const TOP_K = 8

// A keyword-based grounding used when the on-device semantic index is unavailable, so the chat
// still answers from the notes. It scores each live note by how many of the query's words it
// contains and returns the best few, note by note.
async function keywordSources(q: string, liveIds: Set<string>, titleOf: (id: string) => string): Promise<ChatSource[]> {
  try {
    const { loadAllNotes } = await import('@/store/persistence')
    const { toPlainText } = await import('@/export/toText')
    const terms = q
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)
    if (!terms.length) return []
    const notes = (await loadAllNotes()).filter((n) => liveIds.has(n.id))
    const scored = notes
      .map((n) => {
        const text = toPlainText(n)
        const hay = `${n.title}\n${text}`.toLowerCase()
        const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0)
        return { id: n.id, text, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K)
    return scored.map((x, i) => ({
      n: i + 1,
      noteId: x.id,
      title: titleOf(x.id),
      text: x.text.slice(0, 500),
      score: x.score,
    }))
  } catch {
    return []
  }
}

export function useNotesChat() {
  const settings = useSettings()
  const library = useLibrary()
  const documentStore = useDocument()
  const { generate, error: aiError } = useAi()

  const messages = ref<ChatMessage[]>([])
  const busy = ref(false)
  const error = ref<string | null>(null)
  const needsKey = ref(false)

  let controller: AbortController | null = null

  function reset(): void {
    messages.value = []
    error.value = null
  }
  // Stop the current turn. It aborts the request and, crucially, releases the UI right away even
  // if a slow model download is still pending underneath — so the chat never gets stuck "thinking".
  function stop(): void {
    controller?.abort()
    const last = messages.value[messages.value.length - 1]
    if (last && last.role === 'assistant' && last.streaming) {
      last.streaming = false
      if (!last.text) last.text = 'Stopped.'
    }
    busy.value = false
  }

  async function ask(question: string): Promise<void> {
    const q = question.trim()
    if (!q || busy.value) return
    error.value = null
    needsKey.value = false

    const provider = getProvider(settings.activeProvider)
    const key = await loadApiKey(provider.id)
    // Prefer the on-device model when the writer has turned it on and the hardware can run it, so
    // answers are free and private. A connected key is the fallback; only when neither exists does
    // the chat ask for a key.
    const useLocal = !!settings.localAiEnabled && webgpuAvailable()
    const localMlcId = modelById(settings.localModelId).mlcId
    if (!key && !useLocal) {
      needsKey.value = true
      return
    }

    messages.value.push({ role: 'user', text: q })
    const idx = messages.value.push({ role: 'assistant', text: '', sources: [], streaming: true }) - 1
    busy.value = true
    controller = new AbortController()
    const signal = controller.signal
    // Release the UI once, whatever path we took, and never overwrite a message the writer stopped.
    const finish = () => {
      if (messages.value[idx]) messages.value[idx].streaming = false
      busy.value = false
      controller = null
    }

    // Decide whether the writer wants the note changed or a question answered, so the chat can act
    // as well as answer. With a key, a one-word model classification is used; on-device-only, a
    // quick keyword guess keeps it call-free. Both lean toward answering.
    let intent: 'edit' | 'ask' = 'ask'
    if (key) {
      try {
        const routed = await provider.complete(ROUTE_SYSTEM, q, key, 4)
        if (/edit/i.test(routed)) intent = 'edit'
      } catch {
        // Routing failure falls back to answering — never edit a note that was not clearly asked to change.
      }
    } else if (EDIT_HINT.test(q)) {
      intent = 'edit'
    }
    if (signal.aborted) return finish()

    // EDIT: hand off to the same engine "Write with AI" uses, so the chat can rewrite, add to, or
    // restructure the open note in place. Editing uses the connected key for now; on-device-only,
    // it is not offered yet, so the writer is told plainly.
    if (intent === 'edit') {
      messages.value[idx].mode = 'edit'
      if (!key) {
        messages.value[idx].text = 'Editing the note needs a connected AI key for now. On-device editing is coming.'
        return finish()
      }
      try {
        const { noteToAddressableText } = await import('@/ai/noteContext')
        const ok = await generate(q, [], noteToAddressableText(documentStore.doc))
        messages.value[idx].text = ok
          ? 'Done — I updated your note. You can see the change beside this chat.'
          : aiError.value || "I couldn't make that change. Check your key and try again."
      } catch (e) {
        console.error('Notes chat: note edit failed', e)
        messages.value[idx].text = "I couldn't make that change. Check your key and try again."
      }
      return finish()
    }

    // ASK: ground an answer in the retrieved notes. Retrieval prefers the on-device semantic index,
    // but if that is unavailable (a slow or failed model) it falls back to a keyword search over the
    // notes, so the chat keeps working rather than dead-ending. Either way the answer is grounded.
    const liveIds = new Set(library.recent.map((e) => e.id))
    const titleOf = (id: string) => library.entries.find((e) => e.id === id)?.title || 'Untitled'
    let sources: ChatSource[]
    try {
      await indexAll()
      const hits = (await searchBlocks(q, TOP_K * 3)).filter((h) => liveIds.has(h.noteId)).slice(0, TOP_K)
      sources = hits.map((h, i) => ({
        n: i + 1,
        noteId: h.noteId,
        title: titleOf(h.noteId),
        text: h.text,
        score: h.score,
      }))
    } catch (e) {
      console.error('Notes chat: semantic retrieval failed, falling back to keyword search', e)
      sources = await keywordSources(q, liveIds, titleOf)
    }
    if (signal.aborted) return finish()

    messages.value[idx].sources = sources
    if (!sources.length) {
      messages.value[idx].text =
        "I couldn't find anything about that in your notes yet. Write a note on it and ask again."
      return finish()
    }

    try {
      const context = sources.map((s) => `[${s.n}] (${s.title}) ${s.text}`).join('\n')
      const prompt = `MY NOTES:\n${context}\n\nQUESTION: ${q}`
      // On-device model when it is on; otherwise the connected provider. Both stream the same
      // grounded prompt, so the answer and its citations are identical either way.
      if (useLocal) {
        for await (const delta of localStream(localMlcId, RAG_SYSTEM, prompt, 1000, signal)) {
          messages.value[idx].text += delta
        }
      } else {
        const request = { system: RAG_SYSTEM, prompt, attachments: [], maxTokens: 1000 }
        for await (const delta of provider.stream(request, key!, signal)) {
          messages.value[idx].text += delta
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        console.error('Notes chat: generation failed', e)
        error.value = useLocal
          ? 'The on-device model could not answer. Try a smaller model in On-device AI, or connect a key.'
          : `Could not get an answer from ${provider.name}. Check your key and connection.`
      }
    } finally {
      finish()
    }
  }

  return { messages, busy, error, needsKey, ask, stop, reset }
}
