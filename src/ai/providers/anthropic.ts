// Claude, reached straight from the browser with the writer's own key. Streaming uses the
// message events where each text delta arrives on its own; a single completion reads the
// one text block back. Attachments keep the vendor's own inline encoding.
import { encodeAttachments } from '@/ai/attachmentEncoding'
import { describeHttpError } from './errors'
import { sseData } from './sse'
import type { ChatRequest, Provider } from './types'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
const MODEL = import.meta.env.VITE_ANTHROPIC_MODEL ?? 'claude-sonnet-5'

function headers(key: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

export const anthropic: Provider = {
  id: 'anthropic',
  name: 'Claude',
  vendor: 'Anthropic',
  keyPlaceholder: 'sk-ant-...',
  keyPrefix: 'sk-ant-',
  consoleUrl: 'https://console.anthropic.com/settings/keys',
  consoleLabel: 'console.anthropic.com',
  steps: [
    'Open console.anthropic.com → Settings → API keys.',
    "Create a key and copy it. It's shown only once.",
    'Paste it below.',
  ],
  reads: { images: true, pdf: true, docs: false },

  async *stream(request: ChatRequest, key: string, signal: AbortSignal): AsyncGenerator<string> {
    const content = [{ type: 'text', text: request.prompt }, ...(await encodeAttachments(request.attachments))]
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      signal,
      headers: headers(key),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: request.maxTokens,
        stream: true,
        system: request.system,
        messages: [{ role: 'user', content }],
      }),
    })
    if (!response.ok || !response.body) {
      throw new Error(describeHttpError('Claude', response.status, await response.text()))
    }
    for await (const payload of sseData(response)) {
      if (payload === '[DONE]') continue
      let parsed: { type?: string; delta?: { type?: string; text?: string } }
      try {
        parsed = JSON.parse(payload)
      } catch {
        continue
      }
      if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
        yield parsed.delta.text ?? ''
      }
    }
  },

  async complete(system: string, user: string, key: string, maxTokens: number): Promise<string> {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: headers(key),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!response.ok) throw new Error(describeHttpError('Claude', response.status, await response.text()))
    const data = (await response.json()) as { content: { type: string; text?: string }[] }
    return data.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim()
  },
}
