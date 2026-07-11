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

    // ASK: ground an answer in the retrieved notes. Retrieval runs on-device and is a separate
    // failure domain from the model call, so its errors are reported as retrieval errors — not
    // misattributed to the AI provider. The embedder times out rather than hanging forever.
    let sources: ChatSource[]
    try {
      await indexAll()
      const liveIds = new Set(library.recent.map((e) => e.id))
      const hits = (await searchBlocks(q, TOP_K * 3)).filter((h) => liveIds.has(h.noteId)).slice(0, TOP_K)
      const titleOf = (id: string) => library.entries.find((e) => e.id === id)?.title || 'Untitled'
      sources = hits.map((h, i) => ({
        n: i + 1,
        noteId: h.noteId,
        title: titleOf(h.noteId),
        text: h.text,
        score: h.score,
      }))
    } catch (e) {
      console.error('Notes chat: on-device retrieval failed', e)
      const reason = String(e instanceof Error ? e.message : e)
        .replace(/^Error:\s*/, '')
        .slice(0, 140)
      if (!signal.aborted) error.value = `Could not prepare on-device search: ${reason || 'unknown error'}.`
      return finish()
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
