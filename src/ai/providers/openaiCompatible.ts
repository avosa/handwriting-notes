// The chat shape OpenAI defined and others adopted: a bearer key, a system message, a
// user message whose content is a list of parts, and a stream whose deltas carry the
// reply text. DeepSeek speaks the same protocol, so both are built from this one factory
// with their own endpoint, model, and whether they can see images.
import { attachmentParts, type ContentPart } from './content'
import { describeHttpError } from './errors'
import { sseData } from './sse'
import type { ChatRequest, Provider, Reads } from './types'

interface Config {
  id: Provider['id']
  name: string
  vendor: string
  keyPlaceholder: string
  keyPrefix: string
  consoleUrl: string
  consoleLabel: string
  steps: string[]
  reads: Reads
  endpoint: string
  model: string
}

interface StreamChunk {
  choices?: { delta?: { content?: string } }[]
}
interface Completion {
  choices?: { message?: { content?: string } }[]
}

export function openAiCompatible(config: Config): Provider {
  async function userContent(request: ChatRequest): Promise<ContentPart[]> {
    const parts = await attachmentParts(request.attachments, config.reads)
    return [{ type: 'text', text: request.prompt }, ...parts]
  }
  function headers(key: string): Record<string, string> {
    return { 'content-type': 'application/json', authorization: `Bearer ${key}` }
  }

  return {
    id: config.id,
    name: config.name,
    vendor: config.vendor,
    keyPlaceholder: config.keyPlaceholder,
    keyPrefix: config.keyPrefix,
    consoleUrl: config.consoleUrl,
    consoleLabel: config.consoleLabel,
    steps: config.steps,
    reads: config.reads,

    async *stream(request: ChatRequest, key: string, signal: AbortSignal): AsyncGenerator<string> {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        signal,
        headers: headers(key),
        body: JSON.stringify({
          model: config.model,
          stream: true,
          max_tokens: request.maxTokens,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: await userContent(request) },
          ],
        }),
      })
      if (!response.ok || !response.body) {
        throw new Error(describeHttpError(config.name, response.status, await response.text()))
      }
      for await (const payload of sseData(response)) {
        if (payload === '[DONE]') continue
        let parsed: StreamChunk
        try {
          parsed = JSON.parse(payload) as StreamChunk
        } catch {
          continue
        }
        const text = parsed.choices?.[0]?.delta?.content
        if (text) yield text
      }
    },

    async complete(system: string, user: string, key: string, maxTokens: number): Promise<string> {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify({
          model: config.model,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
      if (!response.ok) {
        throw new Error(describeHttpError(config.name, response.status, await response.text()))
      }
      const data = (await response.json()) as Completion
      return (data.choices?.[0]?.message?.content ?? '').trim()
    },
  }
}
