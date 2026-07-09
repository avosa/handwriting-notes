import { describe, it, expect, vi } from 'vitest'

// Every provider reads the stored bytes; a small PDF stand in is enough to check the shape
// each one wraps it in.
vi.mock('@/store/persistence', () => ({
  getBlob: vi.fn(async () => ({
    type: 'application/pdf',
    arrayBuffer: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer,
    text: async () => '%PDF',
  })),
}))

import { geminiParts } from '@/ai/providers/geminiContent'
import { attachmentParts } from '@/ai/providers/content'
import { encodeAttachment } from '@/ai/attachmentEncoding'
import type { Attachment } from '@/types'

const pdf: Attachment = {
  id: 'a1',
  kind: 'document',
  name: 'notes.pdf',
  mime: 'application/pdf',
  size: 4,
  blobRef: 'b1',
}
const canRead = { images: true, pdf: true, docs: true }

describe('PDF is wrapped in the shape each vendor accepts', () => {
  it('Gemini sends the PDF as native inline data with its mime type', async () => {
    const parts = await geminiParts([pdf], canRead)
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ inlineData: { mimeType: 'application/pdf' } })
    expect('inlineData' in parts[0] && parts[0].inlineData.data.length > 0).toBe(true)
  })

  it('OpenAI-style providers send the PDF as a file part with a data url', async () => {
    const parts = await attachmentParts([pdf], canRead)
    expect(parts[0]).toMatchObject({ type: 'file', file: { filename: 'notes.pdf' } })
    expect(parts[0].type === 'file' && parts[0].file.file_data.startsWith('data:application/pdf;base64,')).toBe(true)
  })

  it('Claude sends the PDF as a native document block', async () => {
    const blocks = await encodeAttachment(pdf)
    expect(blocks[0]).toMatchObject({ type: 'document', source: { type: 'base64', media_type: 'application/pdf' } })
  })

  it('a model that cannot read PDFs notes it instead of sending raw bytes', async () => {
    const g = await geminiParts([pdf], { images: true, pdf: false, docs: false })
    expect(g[0]).toMatchObject({ text: expect.stringContaining('cannot read PDFs') })
    const o = await attachmentParts([pdf], { images: true, pdf: false, docs: false })
    expect(o[0].type).toBe('text')
  })
})
