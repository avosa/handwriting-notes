// Live dictation for a text field: the browser's speech recognition turns speech into text as it
// is spoken and streams it back through a callback, so a writer can talk to their notes instead of
// typing. It is available where the browser supports speech recognition; elsewhere the mic is
// simply not offered.
import { ref } from 'vue'

interface SpeechAlternative {
  transcript: string
}
interface SpeechResult {
  isFinal: boolean
  0: SpeechAlternative
}
interface SpeechResultList {
  length: number
  [index: number]: SpeechResult
}
interface SpeechRecognitionEvent {
  resultIndex: number
  results: SpeechResultList
}
interface SpeechRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}
type SpeechRecognitionCtor = new () => SpeechRecognition

function recognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useDictation(onText: (text: string) => void) {
  const listening = ref(false)
  const supported = recognitionCtor() !== null
  let recognition: SpeechRecognition | null = null

  function start(): void {
    const Ctor = recognitionCtor()
    if (!Ctor || listening.value) return
    recognition = new Ctor()
    recognition.lang = navigator.language || 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    let settled = ''
    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) settled += result[0].transcript
        else interim += result[0].transcript
      }
      onText(`${settled}${interim}`.trim())
    }
    recognition.onend = () => {
      listening.value = false
    }
    recognition.onerror = () => {
      listening.value = false
    }
    try {
      recognition.start()
      listening.value = true
    } catch {
      // start() throws if already running; the listening state below stays consistent.
    }
  }

  function stop(): void {
    try {
      recognition?.stop()
    } catch {
      // Stopping a recogniser that already ended is harmless.
    }
    listening.value = false
  }

  function toggle(): void {
    if (listening.value) stop()
    else start()
  }

  return { listening, supported, start, stop, toggle }
}
