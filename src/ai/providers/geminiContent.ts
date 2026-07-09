// Attachments in the shape Gemini's own API takes. Gemini reads inline data by its media
// type, so images and PDFs go in as base64 with their mime type, plain text is inlined as
// text, and anything the model cannot open is noted in a line so the request still stands.
// This is the native form, not the OpenAI compatibility one, because that layer has no way
// to send a PDF.
import type { Attachment } from '@/types'
import { getBlob } from '@/store/persistence'
import { blobToBase64 } from '@/ai/attachmentEncoding'
import type { Reads } from './types'

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } }

function isPlainText(attachment: Attachment): boolean {
  if (attachment.mime.startsWith('text/')) return true
  return /\.(txt|md|markdown|csv|tsv|json|xml|html?|ya?ml|log|rtf)$/i.test(attachment.name)
}

export async function geminiParts(attachments: Attachment[], reads: Reads): Promise<GeminiPart[]> {
  const parts: GeminiPart[] = []
  for (const attachment of attachments) {
    const blob = await getBlob(attachment.blobRef)
    if (!blob) continue

    if (attachment.kind === 'image') {
      if (reads.images) parts.push({ inlineData: { mimeType: attachment.mime, data: await blobToBase64(blob) } })
      else parts.push({ text: `An image "${attachment.name}" was attached, but this model cannot read images.` })
      continue
    }

    if (attachment.kind === 'document') {
      if (isPlainText(attachment)) {
        parts.push({ text: `Attached document "${attachment.name}":\n${await blob.text()}` })
      } else if (attachment.mime === 'application/pdf') {
        if (reads.pdf) parts.push({ inlineData: { mimeType: 'application/pdf', data: await blobToBase64(blob) } })
        else parts.push({ text: `A PDF "${attachment.name}" was attached, but this model cannot read PDFs.` })
      } else if (reads.docs) {
        parts.push({ inlineData: { mimeType: attachment.mime, data: await blobToBase64(blob) } })
      } else {
        parts.push({ text: `A document "${attachment.name}" was attached, but this model cannot read that format.` })
      }
      continue
    }

    if (attachment.kind === 'audio') {
      const spoken = attachment.transcript?.trim()
      parts.push({
        text: spoken
          ? `Transcript of a spoken voice note:\n${spoken}`
          : 'A voice note was attached but could not be transcribed.',
      })
      continue
    }

    const transcript = attachment.transcript?.trim()
    parts.push({
      text: transcript
        ? `Transcript of video "${attachment.name}":\n${transcript}`
        : `A video "${attachment.name}" was attached.`,
    })
  }
  return parts
}
