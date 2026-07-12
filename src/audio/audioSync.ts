// Audio-synced ink. While a note records, every stroke drawn is stamped with the moment it was made,
// so later a tap on that stroke seeks the recording back to what was being said as it was written.
// The recording is captured on the device with the microphone and kept as an attachment blob; none
// of it leaves the browser. This module holds the shared recording state and the tap-to-seek signal
// so the drawing surface and the player stay in step.
import { reactive } from 'vue'
import { putBlob } from '@/store/persistence'

export const audioSync = reactive({
  recording: false,
  startedAt: 0,
  // Listen mode: a tap on the page seeks the audio to when the tapped stroke was drawn.
  listening: false,
  // Bumped with a time whenever a stamped stroke is tapped; the player watches it and seeks there.
  seekRequest: null as { ms: number; nonce: number } | null,
})

let mediaRecorder: MediaRecorder | null = null
let chunks: Blob[] = []
let stream: MediaStream | null = null

// Milliseconds since recording began, or null when not recording — the clock a stroke is stamped by.
export function recordingClock(): number | null {
  return audioSync.recording ? Date.now() - audioSync.startedAt : null
}

export function audioSupported(): boolean {
  return (
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
  )
}

export async function startRecording(): Promise<boolean> {
  if (audioSync.recording || !audioSupported()) return false
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    return false
  }
  chunks = []
  mediaRecorder = new MediaRecorder(stream)
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data)
  }
  mediaRecorder.start()
  audioSync.startedAt = Date.now()
  audioSync.recording = true
  return true
}

// Stop recording, save what was captured as a blob, and hand back its reference, or null if nothing
// was recorded.
export async function stopRecording(): Promise<{ blobRef: string; mime: string } | null> {
  const recorder = mediaRecorder
  if (!recorder) return null
  const captured = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
  })
  recorder.stop()
  audioSync.recording = false
  stream?.getTracks().forEach((track) => track.stop())
  const blob = await captured
  mediaRecorder = null
  stream = null
  chunks = []
  if (!blob.size) return null
  const { uid } = await import('@/util/id')
  const blobRef = `audio_${uid()}`
  await putBlob(blobRef, blob)
  return { blobRef, mime: blob.type }
}

// Ask the player to jump to a moment and play from there.
export function requestSeek(ms: number): void {
  audioSync.seekRequest = { ms, nonce: (audioSync.seekRequest?.nonce ?? 0) + 1 }
}
