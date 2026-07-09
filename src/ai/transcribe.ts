// Transcribes a recorded voice note on the device, as a fallback for when the live
// recogniser is missing or hears nothing. A small Whisper model runs in the browser
// through ONNX; it downloads once from the model hub and the browser caches it, so no
// server and no key are ever involved. The recording is decoded to the 16 kHz mono
// signal the model expects before it is handed over.
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

let recognizer: Promise<AutomaticSpeechRecognitionPipeline> | null = null

// Loaded lazily and only when needed, so the model code stays out of the initial bundle.
function load(): Promise<AutomaticSpeechRecognitionPipeline> {
  return import('@huggingface/transformers').then(({ pipeline }) =>
    pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', { dtype: 'q8' }),
  )
}

async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const bytes = await blob.arrayBuffer()
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(bytes)
    const length = decoded.length
    const mono = new Float32Array(length)
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const data = decoded.getChannelData(channel)
      for (let i = 0; i < length; i++) mono[i] += data[i] / decoded.numberOfChannels
    }
    const targetRate = 16000
    if (decoded.sampleRate === targetRate) return mono
    const ratio = decoded.sampleRate / targetRate
    const outLength = Math.floor(length / ratio)
    const resampled = new Float32Array(outLength)
    for (let i = 0; i < outLength; i++) resampled[i] = mono[Math.floor(i * ratio)]
    return resampled
  } finally {
    void context.close()
  }
}

export async function transcribeAudio(blob: Blob): Promise<string> {
  recognizer ??= load()
  const model = await recognizer
  const audio = await decodeToMono16k(blob)
  const result = (await model(audio)) as { text?: string } | { text?: string }[]
  const text = Array.isArray(result) ? result.map((part) => part.text ?? '').join(' ') : (result.text ?? '')
  return text.trim()
}
