// Turns an instruction and its attachments into note pages by calling the Anthropic
// API straight from the browser and streaming the reply back. The key is the user's
// own, read from local storage, and sent only to Anthropic with the header that
// authorises direct browser use. As the reply streams in, finished blocks are placed
// on a new page one at a time, so Claude is seen writing the notes in real time.
import { ref } from 'vue'
import type { Attachment } from '@/types'
import { encodeAttachments, type ContentBlock } from '@/ai/attachmentEncoding'
import { BlockStreamer } from '@/ai/blockStreamer'
import { systemPrompt } from '@/ai/systemPrompt'
import { loadApiKey } from '@/store/persistence'
import { useDocument } from '@/store/document'
import { useSettings } from '@/store/settings'
import { getHandwriting } from '@/handwriting/registry'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
const DEFAULT_MODEL = import.meta.env.VITE_ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

let controller: AbortController | null = null

export function useClaude() {
  const documentStore = useDocument()
  const settings = useSettings()
  const generating = ref(false)
  const error = ref<string | null>(null)

  function stop() {
    controller?.abort()
  }

  async function generate(instruction: string, attachments: Attachment[]): Promise<boolean> {
    error.value = null
    const key = await loadApiKey()
    if (!key) {
      error.value = 'Add your Anthropic API key first, using the key button.'
      return false
    }

    generating.value = true
    controller = new AbortController()
    const pageIndex = documentStore.beginAiPage()
    const streamer = new BlockStreamer()
    let wroteAnything = false

    try {
      const palette = getHandwriting(settings.activeHandwritingId).palette
      const content: ContentBlock[] = [{ type: 'text', text: instruction }, ...(await encodeAttachments(attachments))]

      const response = await fetch(ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: 8000,
          stream: true,
          system: systemPrompt(palette),
          messages: [{ role: 'user', content }],
        }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`Anthropic returned ${response.status}. ${(await response.text()).slice(0, 200)}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let sse = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        sse += decoder.decode(value, { stream: true })
        let split
        while ((split = sse.indexOf('\n\n')) !== -1) {
          const event = sse.slice(0, split)
          sse = sse.slice(split + 2)
          const dataLine = event.split('\n').find((l) => l.startsWith('data:'))
          if (!dataLine) continue
          const payload = dataLine.slice(5).trim()
          if (payload === '[DONE]') continue
          let parsed: { type?: string; delta?: { type?: string; text?: string } }
          try {
            parsed = JSON.parse(payload)
          } catch {
            continue
          }
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            for (const block of streamer.push(parsed.delta.text ?? '')) {
              documentStore.appendAiBlock(pageIndex, block)
              wroteAnything = true
            }
          }
        }
      }

      if (streamer.title) documentStore.doc.title = streamer.title
      if (!wroteAnything) throw new Error('Claude did not return any notes to write.')
      return true
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return wroteAnything
      error.value = e instanceof Error ? e.message : 'The notes could not be generated.'
      return false
    } finally {
      documentStore.endAi()
      generating.value = false
      controller = null
    }
  }

  return { generating, error, generate, stop }
}
