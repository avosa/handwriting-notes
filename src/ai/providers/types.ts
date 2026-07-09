// The shape every AI provider fills in. A provider knows how to reach one vendor's chat
// API from the browser with the writer's own key: how to stream a reply for live note
// writing, how to answer a single prompt for a line rewrite, and how to guide the writer
// to a key. The rest of the app talks to this interface and never to a specific vendor.
import type { Attachment, ProviderId } from '@/types'

export type { ProviderId }

export interface ChatRequest {
  system: string
  prompt: string
  attachments: Attachment[]
  maxTokens: number
}

export interface Provider {
  id: ProviderId
  /** Product name the writer knows: Claude, ChatGPT, DeepSeek. */
  name: string
  /** Company behind it: Anthropic, OpenAI, DeepSeek. */
  vendor: string
  /** What a key looks like, to hint the field. */
  keyPlaceholder: string
  /** The prefix a valid key starts with, for a gentle check. */
  keyPrefix: string
  /** Where to create a key. */
  consoleUrl: string
  /** Short, ordered steps to obtain a key. */
  steps: string[]
  /** Whether images in attachments can be sent to this vendor. */
  supportsImages: boolean

  /** Stream the reply as plain text deltas. Rejects with a readable error on failure. */
  stream(request: ChatRequest, key: string, signal: AbortSignal): AsyncGenerator<string>
  /** Answer a single prompt and return the plain text reply. */
  complete(system: string, user: string, key: string, maxTokens: number): Promise<string>
}
