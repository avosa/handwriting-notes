// Turns an instruction and its attachments into note pages by calling the writer's chosen
// AI provider straight from the browser and streaming the reply back. The key is the
// user's own, read from local storage, and sent only to that provider. As the reply
// streams in, finished blocks are placed on a new page one at a time, so the notes are
// seen being written in real time. A single line can also be rewritten in place.
import { ref } from 'vue'
import type { Attachment } from '@/types'
import { BlockStreamer } from '@/ai/blockStreamer'
import { stripDashes } from '@/ai/noteLint'
import { systemPrompt } from '@/ai/systemPrompt'
import { getProvider } from '@/ai/providers'
import { loadApiKey } from '@/store/persistence'
import { useDocument } from '@/store/document'
import { useSettings } from '@/store/settings'
import { getHandwriting } from '@/handwriting/registry'

const REWRITE_SYSTEM =
  'Rewrite the one line of notes the user gives, following their instruction. Reply with only the rewritten line, no quotes and no preamble. Never use a hyphen or dash as punctuation.'

let controller: AbortController | null = null

export function useAi() {
  const documentStore = useDocument()
  const settings = useSettings()
  const generating = ref(false)
  const error = ref<string | null>(null)

  function stop() {
    controller?.abort()
  }

  async function generate(instruction: string, attachments: Attachment[], context?: string): Promise<boolean> {
    error.value = null
    const provider = getProvider(settings.activeProvider)
    const key = await loadApiKey(provider.id)
    if (!key) {
      error.value = `Add your ${provider.vendor} API key first, using the key button.`
      return false
    }

    generating.value = true
    controller = new AbortController()
    const pageIndex = documentStore.beginAiPage()
    const streamer = new BlockStreamer()
    let wroteAnything = false

    try {
      const palette = getHandwriting(settings.activeHandwritingId).palette
      const prompt = context ? `Here are my current notes:\n\n${context}\n\n---\n\n${instruction}` : instruction
      const request = { system: systemPrompt(palette), prompt, attachments, maxTokens: 8000 }
      for await (const text of provider.stream(request, key, controller.signal)) {
        for (const block of streamer.push(text)) {
          documentStore.appendAiBlock(pageIndex, block)
          wroteAnything = true
        }
      }
      if (streamer.title) documentStore.doc.title = streamer.title
      if (!wroteAnything) throw new Error(`${provider.name} did not return any notes to write.`)
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

  // Rewrite one line of notes; the caller drops the reply back into whichever line it came
  // from, so this works for a paragraph, a list item, a table cell, or a free note.
  const refining = ref(false)
  async function rewriteLine(original: string, instruction: string): Promise<string | null> {
    error.value = null
    if (!original.trim()) {
      error.value = 'Select a line with some words first.'
      return null
    }
    const provider = getProvider(settings.activeProvider)
    const key = await loadApiKey(provider.id)
    if (!key) {
      error.value = `Add your ${provider.vendor} API key first, using the key button.`
      return null
    }

    refining.value = true
    try {
      const text = await provider.complete(
        REWRITE_SYSTEM,
        `Instruction: ${instruction}\n\nLine: ${original}`,
        key,
        1000,
      )
      if (!text) throw new Error(`${provider.name} returned an empty line.`)
      return stripDashes(text)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'That line could not be rewritten.'
      return null
    } finally {
      refining.value = false
    }
  }

  return { generating, error, generate, stop, rewriteLine, refining }
}
