import { describe, it, expect, vi } from 'vitest'

// A blob-like stand in; jsdom's Blob has no arrayBuffer(), which base64 encoding needs.
vi.mock('@/store/persistence', () => ({
  getBlob: vi.fn(async () => ({
    type: 'image/png',
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    text: async () => 'document text',
  })),
}))

import { providerList, getProvider } from '@/ai/providers'
import { attachmentParts } from '@/ai/providers/content'
import { sseData } from '@/ai/providers/sse'
import { describeHttpError } from '@/ai/providers/errors'
import type { Attachment } from '@/types'

describe('provider registry', () => {
  it('offers Claude, ChatGPT, Gemini, and DeepSeek, with Claude first', () => {
    expect(providerList.map((p) => p.name)).toEqual(['Claude', 'ChatGPT', 'Gemini', 'DeepSeek'])
  })
  it('marks which providers can see images', () => {
    const vision = Object.fromEntries(providerList.map((p) => [p.id, p.supportsImages]))
    expect(vision).toEqual({ anthropic: true, openai: true, gemini: true, deepseek: false })
  })
  it('resolves a known id and falls back to Claude for an unknown one', () => {
    expect(getProvider('openai').vendor).toBe('OpenAI')
    expect(getProvider('gemini').vendor).toBe('Google')
    expect(getProvider('deepseek').vendor).toBe('DeepSeek')
    expect(getProvider(undefined).id).toBe('anthropic')
    expect(getProvider('nope').id).toBe('anthropic')
  })
})

function image(): Attachment {
  return { id: 'i', kind: 'image', name: 'shot.png', mime: 'image/png', size: 5, blobRef: 'b' }
}
function voice(transcript?: string): Attachment {
  return { id: 'a', kind: 'audio', name: 'Voice note', mime: 'audio/webm', size: 5, blobRef: 'b', transcript }
}

describe('attachment parts for OpenAI-style providers', () => {
  it('sends an image inline when the model can see it', async () => {
    const parts = await attachmentParts([image()], true)
    expect(parts[0].type).toBe('image_url')
    expect(parts[0]).toMatchObject({ image_url: { url: expect.stringContaining('data:image/png;base64,') } })
  })
  it('notes an image as text when the model has no vision', async () => {
    const parts = await attachmentParts([image()], false)
    expect(parts[0].type).toBe('text')
    expect(parts[0]).toMatchObject({ text: expect.stringContaining('cannot read images') })
  })
  it('carries a voice note as its transcript', async () => {
    const parts = await attachmentParts([voice('take notes on sets')], false)
    expect(parts[0]).toEqual({ type: 'text', text: 'Transcript of a spoken voice note:\ntake notes on sets' })
  })
})

describe('http error messages', () => {
  it("reads a spent quota out of Gemini's array-shaped 429 and speaks plainly", () => {
    const body =
      '[{ "error": { "code": 429, "message": "You exceeded your current quota, please check your plan and billing details." } }]'
    const msg = describeHttpError('Gemini', 429, body)
    expect(msg).toContain('Gemini')
    expect(msg.toLowerCase()).toContain('quota')
    expect(msg).not.toContain('{')
  })
  it('points a refused key at the key button', () => {
    const msg = describeHttpError('ChatGPT', 401, '{"error":{"message":"Incorrect API key provided"}}')
    expect(msg).toContain('did not accept your key')
  })
  it('treats a server error as a passing outage', () => {
    expect(describeHttpError('Claude', 503, 'upstream error')).toContain('trouble right now')
  })
  it('surfaces a 400 detail without the JSON', () => {
    const msg = describeHttpError('DeepSeek', 400, '{"error":{"message":"model not found"}}')
    expect(msg).toContain('model not found')
    expect(msg).not.toContain('"error"')
  })
})

describe('sse reader', () => {
  it('yields the payload of each data line', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"n":1}\n\ndata: [DONE]\n\n'))
        controller.close()
      },
    })
    const out: string[] = []
    for await (const payload of sseData(new Response(body))) out.push(payload)
    expect(out).toEqual(['{"n":1}', '[DONE]'])
  })
})
