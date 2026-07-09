// Gemini, from Google, reached through its own API rather than the OpenAI compatibility
// layer, because only the native API accepts PDFs and documents inline. It reads images,
// PDFs, and office files, streams its reply as text deltas, and answers a single prompt for
// a line rewrite. The writer's key goes in the request header, never the URL.
import { geminiParts } from './geminiContent'
import { describeHttpError } from './errors'
import { sseData } from './sse'
import type { ChatRequest, Provider, Reads } from './types'

const READS: Reads = { images: true, pdf: true, docs: true }
const MODEL = import.meta.env.VITE_GEMINI_MODEL ?? 'gemini-flash-latest'
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

function headers(key: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-goog-api-key': key }
}

interface GeminiReply {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

function textOf(reply: GeminiReply): string {
  return reply.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

export const gemini: Provider = {
  id: 'gemini',
  name: 'Gemini',
  vendor: 'Google',
  keyPlaceholder: 'AIza...',
  keyPrefix: 'AIza',
  consoleUrl: 'https://aistudio.google.com/app/apikey',
  consoleLabel: 'aistudio.google.com',
  steps: ['Open aistudio.google.com → Get API key.', 'Create a key and copy it.', 'Paste it below.'],
  reads: READS,

  async *stream(request: ChatRequest, key: string, signal: AbortSignal): AsyncGenerator<string> {
    const parts = [{ text: request.prompt }, ...(await geminiParts(request.attachments, READS))]
    const response = await fetch(`${BASE}/${MODEL}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      signal,
      headers: headers(key),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: request.maxTokens },
      }),
    })
    if (!response.ok || !response.body) {
      throw new Error(describeHttpError('Gemini', response.status, await response.text()))
    }
    for await (const payload of sseData(response)) {
      if (payload === '[DONE]') continue
      let parsed: GeminiReply
      try {
        parsed = JSON.parse(payload) as GeminiReply
      } catch {
        continue
      }
      const text = textOf(parsed)
      if (text) yield text
    }
  },

  async complete(system: string, user: string, key: string, maxTokens: number): Promise<string> {
    const response = await fetch(`${BASE}/${MODEL}:generateContent`, {
      method: 'POST',
      headers: headers(key),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    })
    if (!response.ok) {
      throw new Error(describeHttpError('Gemini', response.status, await response.text()))
    }
    return textOf((await response.json()) as GeminiReply).trim()
  },
}
