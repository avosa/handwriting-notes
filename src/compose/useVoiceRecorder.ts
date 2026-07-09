// Records a spoken note in the browser and, where the browser can, transcribes it live
// as it is spoken. Two things run at once off the same microphone: a MediaRecorder that
// captures the audio to a blob, and the Web Speech recogniser that turns speech into
// text. An analyser feeds a running amplitude so the waveform moves with the voice.
// Nothing leaves the device except, if the browser's recogniser is cloud backed, the
// speech it sends for recognition — the audio blob itself stays local.
import { ref } from 'vue'

export type RecorderStatus = 'idle' | 'recording' | 'locked' | 'paused'

export interface Recording {
  blob: Blob
  mime: string
  durationMs: number
  transcript: string
}

// The Web Speech API is not in the DOM typings, so the shape we use is declared here.
interface SpeechRecognitionAlternative {
  transcript: string
}
interface SpeechRecognitionResult {
  isFinal: boolean
  0: SpeechRecognitionAlternative
}
interface SpeechRecognitionEvent {
  resultIndex: number
  results: { length: number; [index: number]: SpeechRecognitionResult }
}
interface SpeechRecognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type SpeechRecognitionCtor = new () => SpeechRecognition

function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function pickMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type
  }
  return undefined
}

const MAX_LEVELS = 56

export function useVoiceRecorder() {
  const status = ref<RecorderStatus>('idle')
  const elapsedMs = ref(0)
  const levels = ref<number[]>([])
  const transcript = ref('')
  const canTranscribe = speechRecognitionCtor() !== null
  const supported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

  let stream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let frame = 0
  let startedAt = 0
  let accumulatedMs = 0
  let recognition: SpeechRecognition | null = null
  let finalText = ''
  let recognizing = false

  function sample() {
    if (status.value === 'recording' || status.value === 'locked') {
      elapsedMs.value = accumulatedMs + (performance.now() - startedAt)
    }
    if (analyser) {
      const buffer = new Uint8Array(analyser.fftSize)
      analyser.getByteTimeDomainData(buffer)
      let sum = 0
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buffer.length)
      levels.value = [...levels.value, Math.min(1, rms * 2.4)].slice(-MAX_LEVELS)
    }
    frame = requestAnimationFrame(sample)
  }

  function beginRecognition() {
    const Ctor = speechRecognitionCtor()
    if (!Ctor) return
    recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'
    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) finalText += result[0].transcript
        else interim += result[0].transcript
      }
      transcript.value = (finalText + interim).trim()
    }
    // The recogniser stops itself on a long pause; keep it going while we still record.
    recognition.onend = () => {
      recognizing = false
      if (status.value === 'recording' || status.value === 'locked') startListening()
    }
    recognition.onerror = () => {}
    startListening()
  }
  function startListening() {
    if (!recognition || recognizing) return
    try {
      recognition.start()
      recognizing = true
    } catch {
      // start() throws if it is already running; that is fine.
    }
  }

  async function start(): Promise<boolean> {
    if (!supported || status.value !== 'idle') return false
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return false
    }
    chunks = []
    const mime = pickMimeType()
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.start(100)

    audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)

    finalText = ''
    transcript.value = ''
    accumulatedMs = 0
    elapsedMs.value = 0
    levels.value = []
    startedAt = performance.now()
    status.value = 'recording'
    beginRecognition()
    frame = requestAnimationFrame(sample)
    return true
  }

  function lock() {
    if (status.value === 'recording') status.value = 'locked'
  }

  function pause() {
    if (status.value !== 'recording' && status.value !== 'locked') return
    accumulatedMs += performance.now() - startedAt
    recorder?.pause()
    recognition?.stop()
    status.value = 'paused'
  }

  function resume() {
    if (status.value !== 'paused') return
    recorder?.resume()
    startedAt = performance.now()
    status.value = 'locked'
    startListening()
  }

  function teardown() {
    cancelAnimationFrame(frame)
    stream?.getTracks().forEach((track) => track.stop())
    void audioCtx?.close()
    stream = null
    recorder = null
    analyser = null
    audioCtx = null
    recognition = null
    recognizing = false
  }

  async function stop(): Promise<Recording | null> {
    if (status.value === 'idle' || !recorder) {
      teardown()
      status.value = 'idle'
      return null
    }
    if (status.value !== 'paused') accumulatedMs += performance.now() - startedAt
    const mime = recorder.mimeType || 'audio/webm'
    const blob = await new Promise<Blob>((resolve) => {
      recorder!.onstop = () => resolve(new Blob(chunks, { type: mime }))
      if (recorder!.state !== 'inactive') recorder!.stop()
      else resolve(new Blob(chunks, { type: mime }))
    })
    recognition?.stop()
    const durationMs = accumulatedMs
    const text = transcript.value.trim()
    teardown()
    status.value = 'idle'
    elapsedMs.value = 0
    levels.value = []
    transcript.value = ''
    return blob.size ? { blob, mime, durationMs, transcript: text } : null
  }

  function cancel() {
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    recognition?.abort()
    teardown()
    status.value = 'idle'
    elapsedMs.value = 0
    levels.value = []
    transcript.value = ''
    finalText = ''
  }

  return { status, elapsedMs, levels, transcript, supported, canTranscribe, start, lock, pause, resume, stop, cancel }
}
