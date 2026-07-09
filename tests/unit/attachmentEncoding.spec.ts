import { describe, it, expect, vi } from 'vitest'

// The encoder reads the stored bytes; a voice note only needs a present blob to proceed
// to its transcript, so a tiny stand in is enough here.
vi.mock('@/store/persistence', () => ({
  getBlob: vi.fn(async () => new Blob(['audio'], { type: 'audio/webm' })),
}))

import { encodeAttachment } from '@/ai/attachmentEncoding'
import type { Attachment } from '@/types'

function voiceNote(transcript?: string): Attachment {
  return { id: 'a1', kind: 'audio', name: 'Voice note', mime: 'audio/webm', size: 5, blobRef: 'b1', transcript }
}

describe('attachmentEncoding for audio', () => {
  it('sends the spoken transcript as text', async () => {
    const blocks = await encodeAttachment(voiceNote('take notes on sets and subsets'))
    expect(blocks).toEqual([
      { type: 'text', text: 'Transcript of a spoken voice note:\ntake notes on sets and subsets' },
    ])
  })

  it('explains when a voice note could not be transcribed', async () => {
    const blocks = await encodeAttachment(voiceNote())
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('text')
    expect(blocks[0]).toMatchObject({ text: expect.stringContaining('could not be transcribed') })
  })
})
