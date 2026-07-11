import { describe, it, expect, vi } from 'vitest'
import { manusText, manusError, manus, buildContent } from '@/ai/providers/manus'
import { getProvider, providerList } from '@/ai/providers'
import type { Attachment } from '@/types'

// A fake store: the blob's size is read from the ref (e.g. "big:20000000") so a test can force
// the too-large path without allocating real megabytes.
vi.mock('@/store/persistence', () => ({
  getBlob: async (ref: string) => ({ size: Number(ref.split(':')[1] ?? 10) }) as Blob,
}))
vi.mock('@/ai/attachmentEncoding', () => ({ blobToBase64: async () => 'QUJD' }))

function att(partial: Partial<Attachment>): Attachment {
  return { id: 'a', kind: 'image', name: 'f', mime: 'image/png', blobRef: 'small:10', ...partial } as Attachment
}

describe('manus provider', () => {
  it('is registered as a provider the writer can pick', () => {
    expect(providerList.map((p) => p.id)).toContain('manus')
    expect(getProvider('manus')).toBe(manus)
    expect(manus.name).toBe('Manus')
  })

  it("reads the assistant's reply out of a task's message events", () => {
    const text = manusText([
      { type: 'user_message' },
      { type: 'assistant_message', assistant_message: { content: 'First part. ' } },
      { type: 'assistant_message', assistant_message: { content: [{ text: 'Second part.' }] } },
    ])
    expect(text).toBe('First part. Second part.')
  })

  it('returns an empty string when a task has not spoken yet', () => {
    expect(manusText([{ type: 'user_message' }])).toBe('')
  })

  it('surfaces a reported error, such as a spent quota', () => {
    const messages = [
      { type: 'user_message' },
      {
        type: 'error_message',
        error_message: { content: "You don't have enough credits.", error_type: 'quota_limit' },
      },
    ]
    expect(manusError(messages)).toBe("You don't have enough credits.")
    expect(manusError([{ type: 'assistant_message', assistant_message: { content: 'hi' } }])).toBeNull()
  })

  it('sends a plain string when there is nothing attached', async () => {
    expect(await buildContent('Rules.', 'Write it.', [])).toBe('Rules.\n\nWrite it.')
  })

  it('inlines images, PDFs, documents, and a voice note as Manus parts', async () => {
    const content = await buildContent('Sys.', 'Prompt.', [
      att({ kind: 'image', name: 'shot.png', mime: 'image/png' }),
      att({ kind: 'document', name: 'notes.pdf', mime: 'application/pdf' }),
      att({ kind: 'audio', name: 'memo.m4a', mime: 'audio/mp4' }),
    ])
    expect(Array.isArray(content)).toBe(true)
    const parts = content as Exclude<typeof content, string>
    expect(parts[0]).toEqual({ type: 'text', text: 'Sys.\n\nPrompt.' })
    expect(parts[1]).toMatchObject({ type: 'file', filename: 'shot.png', mime_type: 'image/png' })
    expect(parts[1]).toHaveProperty('file_data', 'data:image/png;base64,QUJD')
    expect(parts[2]).toMatchObject({ type: 'file', filename: 'notes.pdf', mime_type: 'application/pdf' })
    expect(parts[3]).toMatchObject({ type: 'voice', filename: 'memo.m4a', mime_type: 'audio/mp4' })
  })

  it('falls back to a note for a file too large to inline, and for video uses its transcript', async () => {
    const content = await buildContent('', 'Prompt.', [
      att({ kind: 'document', name: 'huge.pdf', mime: 'application/pdf', blobRef: 'big:20000000' }),
      att({ kind: 'video', name: 'clip.mp4', mime: 'video/mp4', transcript: 'spoken words' }),
    ])
    const parts = content as Exclude<typeof content, string>
    expect(parts.every((p) => p.type === 'text')).toBe(true)
    expect(JSON.stringify(parts)).toContain('too large')
    expect(JSON.stringify(parts)).toContain('spoken words')
  })
})
