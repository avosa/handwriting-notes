// Turns attachments into the content blocks the Anthropic API accepts. Images and
// PDFs go inline as base64. Raw video is not model readable, so a video contributes
// its pasted transcript as text and, where the browser can decode it, a few extracted
// keyframes sent as images. Everything runs in the browser; nothing is uploaded to us.
import type { Attachment } from '@/types'
import { getBlob } from '@/store/persistence'

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Grab a few evenly spaced frames from a video as JPEG data, decoded in the browser. */
async function extractKeyframes(blob: Blob, count = 4): Promise<string[]> {
  const url = URL.createObjectURL(blob)
  try {
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('This video could not be decoded for frames.'))
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.min(video.videoWidth, 768)
    canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight)
    const context = canvas.getContext('2d')
    if (!context) return []
    const frames: string[] = []
    for (let i = 1; i <= count; i++) {
      const time = (video.duration * i) / (count + 1)
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve()
        video.currentTime = time
      })
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      frames.push(canvas.toDataURL('image/jpeg', 0.7).split(',')[1])
    }
    return frames
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function encodeAttachment(attachment: Attachment): Promise<ContentBlock[]> {
  const blob = await getBlob(attachment.blobRef)
  if (!blob) return []

  if (attachment.kind === 'image') {
    return [{ type: 'image', source: { type: 'base64', media_type: attachment.mime, data: await blobToBase64(blob) } }]
  }

  if (attachment.kind === 'document' && attachment.mime === 'application/pdf') {
    return [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await blobToBase64(blob) } },
    ]
  }

  if (attachment.kind === 'document') {
    const text = await blob.text()
    return [{ type: 'text', text: `Attached document "${attachment.name}":\n${text}` }]
  }

  // Video: pasted transcript plus whatever frames the browser can decode.
  const blocks: ContentBlock[] = []
  if (attachment.transcript?.trim()) {
    blocks.push({ type: 'text', text: `Transcript of video "${attachment.name}":\n${attachment.transcript}` })
  }
  try {
    const frames = await extractKeyframes(blob)
    for (const data of frames) {
      blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })
    }
  } catch {
    // A codec the browser cannot open just contributes its transcript.
  }
  if (blocks.length === 0) {
    blocks.push({ type: 'text', text: `A video "${attachment.name}" was attached but could not be read.` })
  }
  return blocks
}

export async function encodeAttachments(attachments: Attachment[]): Promise<ContentBlock[]> {
  const groups = await Promise.all(attachments.map(encodeAttachment))
  return groups.flat()
}
