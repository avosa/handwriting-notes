// Attachments, reduced to the neutral parts an OpenAI-style chat expects: images inline
// where the vendor can see them, and everything else as text the model can read. Images
// are dropped to a short note for a vendor without vision so the request still stands.
import type { Attachment } from '@/types'
import { getBlob } from '@/store/persistence'
import { blobToBase64 } from '@/ai/attachmentEncoding'

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export async function attachmentParts(attachments: Attachment[], includeImages: boolean): Promise<ContentPart[]> {
  const parts: ContentPart[] = []
  for (const attachment of attachments) {
    const blob = await getBlob(attachment.blobRef)
    if (!blob) continue

    if (attachment.kind === 'image') {
      if (includeImages) {
        const data = await blobToBase64(blob)
        parts.push({ type: 'image_url', image_url: { url: `data:${attachment.mime};base64,${data}` } })
      } else {
        parts.push({
          type: 'text',
          text: `An image "${attachment.name}" was attached, but this model cannot read images.`,
        })
      }
      continue
    }

    if (attachment.kind === 'document' && attachment.mime !== 'application/pdf') {
      parts.push({ type: 'text', text: `Attached document "${attachment.name}":\n${await blob.text()}` })
      continue
    }
    if (attachment.kind === 'document') {
      parts.push({ type: 'text', text: `A PDF "${attachment.name}" was attached; only its name reached this model.` })
      continue
    }

    if (attachment.kind === 'audio') {
      const spoken = attachment.transcript?.trim()
      parts.push({
        type: 'text',
        text: spoken
          ? `Transcript of a spoken voice note:\n${spoken}`
          : 'A voice note was attached but could not be transcribed.',
      })
      continue
    }

    // Video
    const transcript = attachment.transcript?.trim()
    parts.push({
      type: 'text',
      text: transcript
        ? `Transcript of video "${attachment.name}":\n${transcript}`
        : `A video "${attachment.name}" was attached.`,
    })
  }
  return parts
}
