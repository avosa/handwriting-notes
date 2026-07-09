// Attachments, reduced to the neutral parts an OpenAI-style chat expects. What each part
// becomes depends on what the chosen model can read: images go inline where a model has
// vision, PDFs and office documents go as file parts where a model can open them, plain
// text is always inlined as text, and anything a model cannot take is noted in a line so
// the request still stands and the writer knows why.
import type { Attachment } from '@/types'
import { getBlob } from '@/store/persistence'
import { blobToBase64 } from '@/ai/attachmentEncoding'
import type { Reads } from './types'

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }

// Files whose bytes are readable as text and so can be inlined for any model.
function isPlainText(attachment: Attachment): boolean {
  if (attachment.mime.startsWith('text/')) return true
  return /\.(txt|md|markdown|csv|tsv|json|xml|html?|ya?ml|log|rtf)$/i.test(attachment.name)
}

async function dataUrl(blob: Blob, mime: string): Promise<string> {
  return `data:${mime};base64,${await blobToBase64(blob)}`
}

export async function attachmentParts(attachments: Attachment[], reads: Reads): Promise<ContentPart[]> {
  const parts: ContentPart[] = []
  for (const attachment of attachments) {
    const blob = await getBlob(attachment.blobRef)
    if (!blob) continue

    if (attachment.kind === 'image') {
      if (reads.images) parts.push({ type: 'image_url', image_url: { url: await dataUrl(blob, attachment.mime) } })
      else
        parts.push({
          type: 'text',
          text: `An image "${attachment.name}" was attached, but this model cannot read images.`,
        })
      continue
    }

    if (attachment.kind === 'document') {
      if (isPlainText(attachment)) {
        parts.push({ type: 'text', text: `Attached document "${attachment.name}":\n${await blob.text()}` })
      } else if (attachment.mime === 'application/pdf') {
        if (reads.pdf)
          parts.push({
            type: 'file',
            file: { filename: attachment.name, file_data: await dataUrl(blob, 'application/pdf') },
          })
        else
          parts.push({
            type: 'text',
            text: `A PDF "${attachment.name}" was attached, but this model cannot read PDFs.`,
          })
      } else if (reads.docs) {
        parts.push({
          type: 'file',
          file: { filename: attachment.name, file_data: await dataUrl(blob, attachment.mime) },
        })
      } else {
        parts.push({
          type: 'text',
          text: `A document "${attachment.name}" was attached, but this model cannot read that format.`,
        })
      }
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
