// Live dictation onto the page: the words a writer speaks appear as text on the note as they are
// spoken, so a page can be filled by voice. Speech that has settled is committed into a paragraph;
// the words still being recognised trail after it, so the line grows in real time the way it does
// when typed. A finished sentence rolls onto a fresh line, so a spoken passage reads as paragraphs
// rather than one long run. It is offered only where the browser can recognise speech.
import { ref } from 'vue'
import { useDocument } from '@/store/document'
import { recognitionCtor, type SpeechRecognition } from './useDictation'

// A spoken line rolls onto the next once it ends on sentence punctuation, or once it grows past
// this many characters without one, so a long unpunctuated stretch still breaks into readable lines.
const LINE_BREAK_CHARS = 160

export function useLiveDictation() {
  const documentStore = useDocument()
  const listening = ref(false)
  const supported = recognitionCtor() !== null
  // The words still being recognised, shown live at the tail of the current line.
  const interim = ref('')

  let recognition: SpeechRecognition | null = null
  // The block the current spoken line is being written into, and the settled text already in it.
  let currentBlockId: string | null = null
  let committed = ''

  function ensureLine(): void {
    if (!currentBlockId) {
      currentBlockId = documentStore.addParagraphAfter(documentStore.selectedBlockId, 'body')
      committed = ''
    }
  }

  function writeLine(text: string): void {
    if (currentBlockId) documentStore.setRuns(currentBlockId, [{ text }])
  }

  function start(): void {
    const Ctor = recognitionCtor()
    if (!Ctor || listening.value) return
    recognition = new Ctor()
    recognition.lang = navigator.language || 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    ensureLine()
    recognition.onresult = (event) => {
      let live = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          const segment = result[0].transcript.trim()
          if (!segment) continue
          committed = committed ? `${committed} ${segment}` : segment
          writeLine(committed)
          // A finished sentence, or a line that has grown long, rolls onto a fresh paragraph so the
          // dictation reads as natural lines rather than one endless one.
          if (/[.!?]$/.test(segment) || committed.length > LINE_BREAK_CHARS) {
            currentBlockId = documentStore.addParagraphAfter(currentBlockId, 'body')
            committed = ''
          }
        } else {
          live += result[0].transcript
        }
      }
      interim.value = live.trim()
      if (interim.value) writeLine(committed ? `${committed} ${interim.value}` : interim.value)
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
      // start() throws only if it is already running; the listening state stays consistent.
    }
  }

  function stop(): void {
    try {
      recognition?.stop()
    } catch {
      // Stopping a recogniser that already ended is harmless.
    }
    listening.value = false
    // Settle the current line to just its committed words, dropping any trailing interim, and clear
    // away a line that never received a word so dictation leaves no empty paragraph behind.
    if (currentBlockId) {
      if (committed.trim()) writeLine(committed)
      else documentStore.removeBlock(currentBlockId)
    }
    currentBlockId = null
    committed = ''
    interim.value = ''
  }

  function toggle(): void {
    if (listening.value) stop()
    else start()
  }

  return { listening, supported, interim, start, stop, toggle }
}
