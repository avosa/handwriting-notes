// Meeting mode: capture a conversation by voice, keep a live transcript on screen as it is spoken,
// and when it ends turn it into notes on the page — a short summary and a task list of the actions
// agreed. The transcription is on-device (the browser's speech recogniser); only the final summary
// uses the writer's chosen AI (the on-device model when it is on, otherwise their key), so a
// meeting can be captured with no account and no server.
import { ref } from 'vue'
import type { Block, TextRun } from '@/types'
import { useDocument } from '@/store/document'
import { uid } from '@/util/id'
import { completeText, hasAnyAi } from '@/ai/complete'
import { stripDashes } from '@/ai/noteLint'
import { recognitionCtor, type SpeechRecognition } from './useDictation'

type Phase = 'idle' | 'recording' | 'summarising'

const MEETING_SYSTEM = `You turn a raw meeting transcript into clean notes. Reply in exactly this shape and nothing else:
SUMMARY
- a short bullet for each main point or decision
ACTIONS
- one line per task someone agreed to do, starting with the owner if named
Keep bullets terse. If there are no clear actions, write "- none" under ACTIONS. Do not add any other text.`

// Split the model's reply into its summary points and action items. Tolerant of stray blank lines,
// bullet characters, and casing so a slightly-off reply still lands as notes.
function parseMeeting(text: string): { summary: string[]; actions: string[] } {
  const summary: string[] = []
  const actions: string[] = []
  let section: 'summary' | 'actions' | null = null
  for (const raw of stripDashes(text).split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (/^summary\b/i.test(line)) {
      section = 'summary'
      continue
    }
    if (/^actions?\b/i.test(line)) {
      section = 'actions'
      continue
    }
    const point = line.replace(/^[-*•\d.)\s]+/, '').trim()
    if (!point || /^none$/i.test(point)) continue
    if (section === 'actions') actions.push(point)
    else if (section === 'summary') summary.push(point)
  }
  return { summary, actions }
}

function paragraph(role: 'heading' | 'subheading' | 'body', text: string): Block {
  return { id: uid('b'), type: 'text', text: { id: uid('t'), role, runs: [{ text }] } }
}
function bullets(items: string[], task: boolean): Block {
  const runs: TextRun[][] = items.map((t) => [{ text: t }])
  return {
    id: uid('b'),
    type: 'list',
    ordered: false,
    items: runs,
    ...(task ? { checked: items.map(() => false) } : {}),
  }
}

function meetingHeading(): string {
  const now = new Date()
  const when = now.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return `Meeting notes · ${when}`
}

export function useMeeting() {
  const documentStore = useDocument()
  const phase = ref<Phase>('idle')
  const supported = recognitionCtor() !== null
  const error = ref<string | null>(null)
  const needsAi = ref(false)
  // The words settled so far, and the words still being recognised, shown together as a live
  // transcript while the meeting runs.
  const transcript = ref('')
  const interim = ref('')
  const elapsed = ref(0)

  let recognition: SpeechRecognition | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let startedAt = 0

  function tick(): void {
    elapsed.value = Math.floor((Date.now() - startedAt) / 1000)
  }

  function start(): void {
    const Ctor = recognitionCtor()
    if (!Ctor || phase.value !== 'idle') return
    error.value = null
    needsAi.value = false
    transcript.value = ''
    interim.value = ''
    elapsed.value = 0
    recognition = new Ctor()
    recognition.lang = navigator.language || 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      let live = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          const segment = result[0].transcript.trim()
          if (segment) transcript.value = transcript.value ? `${transcript.value} ${segment}` : segment
        } else {
          live += result[0].transcript
        }
      }
      interim.value = live.trim()
    }
    // A meeting can fall quiet; the recogniser stops itself on a long silence. Start it again so the
    // capture keeps running until the writer ends it themselves.
    recognition.onend = () => {
      if (phase.value === 'recording') {
        try {
          recognition?.start()
        } catch {
          // Already running, or torn down — the state below stays consistent.
        }
      }
    }
    recognition.onerror = () => {
      // A transient error (a silent gap) is recovered by onend restarting; nothing to surface.
    }
    try {
      recognition.start()
      phase.value = 'recording'
      startedAt = Date.now()
      timer = setInterval(tick, 1000)
    } catch {
      error.value = 'Could not start recording. Check microphone access.'
    }
  }

  // Drop the recogniser without turning it back on. Used both when finishing and when cancelling.
  function teardown(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    phase.value = 'idle'
    if (recognition) {
      try {
        recognition.stop()
      } catch {
        // Stopping a recogniser that already ended is harmless.
      }
      recognition = null
    }
  }

  // End the meeting, fold the last interim words in, summarise the transcript, and lay the summary
  // and action items onto the page. Returns false (with a reason) when there is nothing to write or
  // no AI is connected, so the caller can prompt for a key.
  async function finish(): Promise<boolean> {
    if (phase.value !== 'recording') return false
    if (interim.value) {
      transcript.value = transcript.value ? `${transcript.value} ${interim.value}` : interim.value
      interim.value = ''
    }
    teardown()
    const text = transcript.value.trim()
    if (!text) {
      error.value = 'Nothing was captured to summarise.'
      return false
    }
    if (!(await hasAnyAi())) {
      needsAi.value = true
      return false
    }
    phase.value = 'summarising'
    error.value = null
    try {
      const reply = await completeText(MEETING_SYSTEM, text, { maxTokens: 700 })
      const { summary, actions } = parseMeeting(reply)
      const blocks: Block[] = [paragraph('heading', meetingHeading())]
      if (summary.length) blocks.push(bullets(summary, false))
      else blocks.push(paragraph('body', text))
      if (actions.length) {
        blocks.push(paragraph('subheading', 'Action items'))
        blocks.push(bullets(actions, true))
      }
      let lastId: string | null = null
      for (const block of blocks) lastId = documentStore.insertAfter(lastId, block)
      if (lastId) documentStore.select(lastId)
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'The meeting could not be summarised.'
      return false
    } finally {
      phase.value = 'idle'
    }
  }

  // Abandon the meeting without writing anything.
  function cancel(): void {
    teardown()
    transcript.value = ''
    interim.value = ''
    elapsed.value = 0
    error.value = null
  }

  return { phase, supported, error, needsAi, transcript, interim, elapsed, start, finish, cancel }
}
