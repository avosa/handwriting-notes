// Manus, reached from the browser with the writer's own key. Manus runs a task rather than
// streaming a chat: task.create opens a task, then it is polled until it settles and its
// written reply is read back, so the notes arrive together after a short wait instead of word
// by word. The key travels in Manus's own header, and pressing stop abandons the poll.
//
// Manus answers in typed events on a task's message list rather than a single reply body:
// task.detail carries the task's status, and task.listMessages carries the assistant's words
// and any error (a spent quota shows up there while the task sits waiting).
import { describeHttpError } from './errors'
import { getBlob } from '@/store/persistence'
import { blobToBase64 } from '@/ai/attachmentEncoding'
import type { Attachment } from '@/types'
import type { ChatRequest, Provider } from './types'

const BASE = 'https://api.manus.ai/v2'
// Which Manus agent answers; kept as a setting so the profile can be tuned without a rebuild.
const PROFILE = import.meta.env.VITE_MANUS_PROFILE ?? 'manus-1.6'
const POLL_MS = 1500
const MAX_WAIT_MS = 240000

// A task that has settled: 'stopped' is Manus's word for finished; 'error' is a failure, and
// 'waiting' means it has paused for input it cannot get from here, so it is not left to hang.
const DONE = ['stopped', 'completed', 'succeeded', 'success', 'finished']
const FAILED = ['error', 'failed', 'cancelled', 'canceled']

// Manus reads the key from its own header rather than a bearer token.
function headers(key: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-manus-api-key': key }
}

type Content = string | { text?: string }[]
export interface ManusMessage {
  type?: string
  assistant_message?: { content?: Content }
  error_message?: { content?: string; error_type?: string }
}

// The reply text of a task, joined from its assistant messages in order. Exported so the
// parsing can be checked on its own without a live task.
export function manusText(messages: ManusMessage[]): string {
  const parts: string[] = []
  for (const message of messages) {
    if (message.type !== 'assistant_message') continue
    const content = message.assistant_message?.content
    if (typeof content === 'string') parts.push(content)
    else if (Array.isArray(content)) for (const p of content) if (typeof p.text === 'string') parts.push(p.text)
  }
  return parts.join('').trim()
}

// The first error a task reported, if any, so a spent quota or a refusal is surfaced in the
// writer's own words rather than left to look like an empty reply.
export function manusError(messages: ManusMessage[]): string | null {
  const failed = messages.find((m) => m.type === 'error_message')
  return failed?.error_message?.content ?? null
}

// A sleep that gives up the moment the writer presses stop, so a long poll does not keep the
// request alive after it has been abandoned.
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function getJson(path: string, key: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/${path}`, { method: 'GET', signal, headers: headers(key) })
  if (!res.ok) throw new Error(describeHttpError('Manus', res.status, await res.text()))
  return (await res.json()) as Record<string, unknown>
}

// The message content Manus is sent: either a plain string, or, when there are attachments, an
// array of parts mixing the text with the files.
type ManusPart =
  | { type: 'text'; text: string }
  | { type: 'file'; file_data: string; filename: string; mime_type: string }
  | { type: 'voice'; file_data: string; filename: string; mime_type: string }

// Manus takes files inline as base64 up to 20 MB decoded; a base64 string is about a third
// larger than its bytes, so anything over ~15 MB of source is too big to inline here.
const MAX_INLINE_BYTES = 15 * 1024 * 1024

// Build the one message Manus receives: the guidance and prompt as text, then each attachment it
// can open — images, PDFs, and documents as files, a voice note as voice — inlined as base64.
// A file too large to inline, or a video, is described in a line (with its transcript when there
// is one) so the request still stands and the writer knows what was left out.
export async function buildContent(
  system: string,
  prompt: string,
  attachments: Attachment[],
): Promise<string | ManusPart[]> {
  const lead = system ? `${system}\n\n${prompt}` : prompt
  if (!attachments.length) return lead
  const parts: ManusPart[] = [{ type: 'text', text: lead }]
  for (const a of attachments) {
    const blob = await getBlob(a.blobRef)
    if (!blob) continue
    const note = (text: string) => parts.push({ type: 'text', text })
    const transcript = a.transcript?.trim()
    if (a.kind === 'video') {
      note(transcript ? `Transcript of video "${a.name}":\n${transcript}` : `A video "${a.name}" was attached.`)
      continue
    }
    if (blob.size > MAX_INLINE_BYTES) {
      note(
        transcript
          ? `Transcript of "${a.name}" (too large to attach in full):\n${transcript}`
          : `"${a.name}" was attached but is too large to send (over 15 MB).`,
      )
      continue
    }
    const file_data = `data:${a.mime};base64,${await blobToBase64(blob)}`
    if (a.kind === 'audio') parts.push({ type: 'voice', file_data, filename: a.name, mime_type: a.mime })
    else parts.push({ type: 'file', file_data, filename: a.name, mime_type: a.mime })
  }
  return parts.length > 1 ? parts : lead
}

// Open a task and wait for it to settle, then hand back its text. Both live writing and a
// single completion go through here, since Manus answers each the same way. Manus has no
// separate system channel, so the guidance rides at the top of the one message it is sent.
async function runTask(content: string | ManusPart[], key: string, signal: AbortSignal): Promise<string> {
  const created = await fetch(`${BASE}/task.create`, {
    method: 'POST',
    signal,
    headers: headers(key),
    body: JSON.stringify({ message: { content }, agent_profile: PROFILE }),
  })
  if (!created.ok) throw new Error(describeHttpError('Manus', created.status, await created.text()))
  const start = (await created.json()) as { ok?: boolean; task_id?: string; error?: { message?: string } }
  if (start.ok === false || start.error?.message) {
    throw new Error(start.error?.message ? `Manus: ${start.error.message}.` : 'Manus could not start the task.')
  }
  const id = start.task_id
  if (!id) throw new Error('Manus did not return a task to follow.')
  const q = `task_id=${encodeURIComponent(id)}`

  const deadline = Date.now() + MAX_WAIT_MS
  for (;;) {
    await abortableSleep(POLL_MS, signal)
    const [detail, list] = await Promise.all([
      getJson(`task.detail?${q}`, key, signal),
      getJson(`task.listMessages?${q}&order=asc&limit=100`, key, signal),
    ])
    const messages = (list.messages ?? []) as ManusMessage[]

    // A reported error ends the wait even while the task sits 'waiting', which is how a spent
    // quota shows up: the task never stops on its own, so the error is what to act on.
    const failure = manusError(messages)
    if (failure) throw new Error(`Manus: ${failure}.`)

    const status = ((detail.task as { status?: string } | undefined)?.status ?? '').toLowerCase()
    if (DONE.includes(status)) return manusText(messages)
    if (FAILED.includes(status)) throw new Error('Manus could not finish the task.')
    if (status === 'waiting') {
      const text = manusText(messages)
      if (text) return text
      throw new Error('Manus paused for input it cannot get here. Try rephrasing the request.')
    }
    if (Date.now() > deadline) throw new Error('Manus took too long to answer. Give it a moment and try again.')
  }
}

export const manus: Provider = {
  id: 'manus',
  name: 'Manus',
  vendor: 'Manus',
  keyPlaceholder: 'sk-...',
  keyPrefix: '',
  consoleUrl: 'https://manus.im/app?show_settings=integrations&app_name=api',
  consoleLabel: 'manus.im',
  steps: [
    'Open manus.im, then Settings → Integrations → API, and create a key.',
    "Copy the key. It's shown only once, and needs credits on your Manus plan to run.",
    'Paste it below.',
  ],
  reads: { images: true, pdf: true, docs: true },

  async *stream(request: ChatRequest, key: string, signal: AbortSignal): AsyncGenerator<string> {
    const content = await buildContent(request.system, request.prompt, request.attachments)
    const text = await runTask(content, key, signal)
    if (text) yield text
  },

  async complete(system: string, user: string, key: string): Promise<string> {
    return runTask(system ? `${system}\n\n${user}` : user, key, new AbortController().signal)
  },
}
