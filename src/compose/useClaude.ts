// Turns an instruction and its attachments into note pages by calling the Anthropic
// API straight from the browser. The key is the user's own, read from local storage,
// and sent only to Anthropic with the header that authorises direct browser use. The
// reply is validated into blocks and appended to the document as new pages.
import { ref } from 'vue'
import type { Attachment } from '@/types'
import { encodeAttachments, type ContentBlock } from '@/ai/attachmentEncoding'
import { parseGeneratedNotes } from '@/ai/noteSchema'
import { systemPrompt } from '@/ai/systemPrompt'
import { loadApiKey } from '@/store/persistence'
import { useDocument } from '@/store/document'
import { useSettings } from '@/store/settings'
import { getHandwriting } from '@/handwriting/registry'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
const DEFAULT_MODEL = import.meta.env.VITE_ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

interface AnthropicTextBlock {
  type: string
  text?: string
}

export function useClaude() {
  const documentStore = useDocument()
  const settings = useSettings()
  const generating = ref(false)
  const error = ref<string | null>(null)

  async function generate(instruction: string, attachments: Attachment[]): Promise<boolean> {
    error.value = null
    const key = await loadApiKey()
    if (!key) {
      error.value = 'Add your Anthropic API key first, using the key button.'
      return false
    }

    generating.value = true
    try {
      const palette = getHandwriting(settings.activeHandwritingId).palette
      const content: ContentBlock[] = [{ type: 'text', text: instruction }, ...(await encodeAttachments(attachments))]

      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: 8000,
          system: systemPrompt(palette),
          messages: [{ role: 'user', content }],
        }),
      })

      if (!response.ok) {
        const detail = await response.text()
        throw new Error(`Anthropic returned ${response.status}. ${detail.slice(0, 200)}`)
      }

      const data = (await response.json()) as { content: AnthropicTextBlock[] }
      const reply = data.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('')

      const { title, pages } = parseGeneratedNotes(reply)
      if (title) documentStore.doc.title = title
      documentStore.appendGeneratedPages(pages)
      documentStore.setActivePage(documentStore.pageCount - pages.length)
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'The notes could not be generated.'
      return false
    } finally {
      generating.value = false
    }
  }

  return { generating, error, generate }
}
