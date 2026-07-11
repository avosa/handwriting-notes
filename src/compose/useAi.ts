// Turns an instruction and its attachments into note pages by calling the writer's chosen
// AI provider straight from the browser and streaming the reply back. The key is the
// user's own, read from local storage, and sent only to that provider. As the reply
// streams in, finished blocks are placed one at a time on the page the writer is on, and
// their words are typed out at a steady, quick pace so the notes are seen being written
// rather than appearing all at once. A single line can also be rewritten in place.
import { ref, computed } from 'vue'
import type { Attachment, Block, TextRun } from '@/types'
import { BlockStreamer } from '@/ai/blockStreamer'
import { stripDashes } from '@/ai/noteLint'
import { systemPrompt } from '@/ai/systemPrompt'
import { getProvider } from '@/ai/providers'
import { parseEdits, isEditReply, type EditOp } from '@/ai/editOps'
import { commonPrefixLength } from '@/util/textDiff'
import { prefersReducedMotion } from '@/util/motion'
import { plainText } from '@/ui/richText'
import { toPlainText } from '@/export/toText'
import { uid } from '@/util/id'
import { loadApiKey } from '@/store/persistence'
import { useDocument } from '@/store/document'
import { useSettings } from '@/store/settings'
import { getHandwriting } from '@/handwriting/registry'

// The pace the words appear at: a few characters every short tick, quick but slow enough to
// watch the writing happen and see the tools being used along the way.
const TYPE_CHARS_PER_TICK = 6
const TYPE_TICK_MS = 9
const FIGURE_BEAT_MS = 110
// A diagram draws its strokes and sets its labels down over this long, so the pump holds on
// it and the next line waits until the figure has been drawn.
const DIAGRAM_DRAW_MS = 1100
// The beat where the AI reaches for a tool and presses it before using it, long enough for
// the ghost cursor to glide over and the button to react.
const TOOL_BEAT_MS = 300

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// A writing beat that a reader who wants little motion does not wait through: the words still
// arrive, just without the drawn-out reveal. The queue poll keeps its real delay so waiting on
// the stream never becomes a busy spin.
function beat(ms: number): Promise<void> {
  return sleep(prefersReducedMotion() ? 0 : ms)
}

// The special line roles a person would reach for the role control to set; plain body text
// is just typed, so the tool is only shown when it actually changes.
const ROLE_TOOLS = new Set(['title', 'subtitle', 'heading', 'subheading', 'caption'])

// The first n characters of a set of runs, keeping each run's emphasis and colour so the
// growing prefix looks exactly like the finished line will. Exported for testing.
export function slicedRuns(runs: TextRun[], n: number): TextRun[] {
  const out: TextRun[] = []
  let remaining = n
  for (const run of runs) {
    if (remaining <= 0) break
    if (run.text.length <= remaining) {
      out.push(run)
      remaining -= run.text.length
    } else {
      out.push({ ...run, text: run.text.slice(0, remaining) })
      remaining = 0
    }
  }
  return out.length ? out : [{ text: '' }]
}

function runLength(runs: TextRun[]): number {
  return runs.reduce((sum, r) => sum + r.text.length, 0)
}

// Lift the JSON object out of a reply, ignoring any stray text around it.
function parseJson(raw: string): unknown {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

type DocStore = ReturnType<typeof useDocument>

// Reveal a paragraph's words a few characters at a time, then settle on the finished runs.
async function typeRuns(store: DocStore, blockId: string, full: TextRun[], signal: AbortSignal) {
  const total = runLength(full)
  for (let n = TYPE_CHARS_PER_TICK; n < total; n += TYPE_CHARS_PER_TICK) {
    if (signal.aborted) break
    store.setRuns(blockId, slicedRuns(full, n))
    await beat(TYPE_TICK_MS)
  }
  store.setRuns(blockId, full)
}

// Reveal a list item by item, each growing to its full text before the next begins.
async function typeList(store: DocStore, blockId: string, full: TextRun[][], signal: AbortSignal) {
  const shown: TextRun[][] = []
  for (let i = 0; i < full.length; i++) {
    const item = full[i]
    const total = runLength(item)
    shown.push([{ text: '' }])
    for (let n = TYPE_CHARS_PER_TICK; n < total; n += TYPE_CHARS_PER_TICK) {
      if (signal.aborted) break
      shown[i] = slicedRuns(item, n)
      store.setListItems(blockId, shown.slice())
      await beat(TYPE_TICK_MS)
    }
    shown[i] = item
    store.setListItems(blockId, shown.slice())
  }
}

// Reach for a tool and press it before using it: the ghost cursor glides to the matching
// control and it reacts, the way a person would pick a heading or open the insert menu.
async function useTool(store: DocStore, tool: string | null, signal: AbortSignal) {
  if (!tool || signal.aborted) return
  store.setAiTool(tool)
  await beat(TOOL_BEAT_MS)
}

// Place a block on the page, then type its words in. Paragraphs and lists are written out
// character by character; a figure lands whole after a short beat so it does not appear in
// the same instant as the line before it. `tool` is the control to press first, if any.
async function typeBlock(store: DocStore, pageIndex: number, block: Block, signal: AbortSignal, tool: string | null) {
  await useTool(store, tool, signal)
  if (block.type === 'text') {
    store.appendAiBlock(pageIndex, { ...block, text: { ...block.text, runs: [{ text: '' }] } })
    store.setAiTool(null)
    await typeRuns(store, block.id, block.text.runs, signal)
  } else if (block.type === 'list') {
    store.appendAiBlock(pageIndex, { ...block, items: [[{ text: '' }]] })
    store.setAiTool(null)
    await typeList(store, block.id, block.items, signal)
  } else {
    store.appendAiBlock(pageIndex, block)
    store.setAiTool(null)
    // A diagram is held on while it draws itself; a table or callout set lands after a beat.
    if (!signal.aborted) await beat(block.type === 'diagram' ? DIAGRAM_DRAW_MS : FIGURE_BEAT_MS)
  }
}

// The control a block calls for: a role only when it changes from the line before, a list or
// figure always, so the insert menu is seen being opened.
function toolFor(block: Block, prevRole: string): string | null {
  if (block.type === 'text')
    return block.text.role !== prevRole && ROLE_TOOLS.has(block.text.role) ? block.text.role : null
  if (block.type === 'list') return 'list'
  return block.type
}

// The pace the eraser rubs a line out at, from the first character that changed rather than
// the whole line, slow enough to watch the rubbing happen.
const ERASE_CHARS_PER_TICK = 4
const ERASE_TICK_MS = 16
// The beat where the AI picks up the eraser and brings it to the line before rubbing, so a
// correction reads as a deliberate act even when only a few characters are wrong.
const ERASE_BEAT_MS = 300

// Correct a line the way a person would: rub out from the first character that changed to the
// end, then write the corrected words back in their place. The unchanged start is left alone,
// so only what was wrong is erased. The ghost cursor holds the eraser while it rubs out and
// the pen while it writes.
async function eraseAndRewrite(
  store: DocStore,
  blockId: string,
  oldRuns: TextRun[],
  newRuns: TextRun[],
  signal: AbortSignal,
) {
  store.setWritingBlock(blockId)
  const oldText = plainText(oldRuns)
  const newText = plainText(newRuns)
  const keep = commonPrefixLength(oldText, newText)

  if (oldText.length > keep) {
    store.setAiTool('eraser')
    await beat(ERASE_BEAT_MS)
    for (let n = oldText.length - ERASE_CHARS_PER_TICK; n > keep; n -= ERASE_CHARS_PER_TICK) {
      if (signal.aborted) return
      store.setRuns(blockId, slicedRuns(oldRuns, n))
      await beat(ERASE_TICK_MS)
    }
    store.setRuns(blockId, slicedRuns(newRuns, keep))
  }

  store.setAiTool(null)
  if (newText.length > keep) {
    for (let n = keep + TYPE_CHARS_PER_TICK; n < newText.length; n += TYPE_CHARS_PER_TICK) {
      if (signal.aborted) return
      store.setRuns(blockId, slicedRuns(newRuns, n))
      await beat(TYPE_TICK_MS)
    }
  }
  store.setRuns(blockId, newRuns)
}

// Rub a whole block out before it is removed, so a deletion is seen happening rather than the
// line just vanishing.
async function eraseBlock(store: DocStore, blockId: string, block: Block, signal: AbortSignal) {
  store.setWritingBlock(blockId)
  store.setAiTool('eraser')
  await beat(ERASE_BEAT_MS)
  if (block.type === 'text') {
    const runs = block.text.runs
    const total = runLength(runs)
    for (let n = total; n > 0; n -= ERASE_CHARS_PER_TICK) {
      if (signal.aborted) return
      store.setRuns(blockId, slicedRuns(runs, Math.max(0, n)))
      await beat(ERASE_TICK_MS)
    }
  } else if (!signal.aborted) {
    await beat(FIGURE_BEAT_MS)
  }
  store.setAiTool(null)
}

// Write a fresh block into a chosen spot, typed in the same as any new line, so an added line
// reads as being written where it belongs.
async function typeInsertedBlock(store: DocStore, afterId: string, block: Block, signal: AbortSignal): Promise<string> {
  if (block.type === 'text') {
    const id = store.insertAfter(afterId, { ...block, id: uid('b'), text: { ...block.text, runs: [{ text: '' }] } })
    store.setWritingBlock(id)
    await typeRuns(store, id, block.text.runs, signal)
    return id
  }
  if (block.type === 'list') {
    const id = store.insertAfter(afterId, { ...block, id: uid('b'), items: [[{ text: '' }]] })
    store.setWritingBlock(id)
    await typeList(store, id, block.items, signal)
    return id
  }
  const id = store.insertAfter(afterId, { ...block, id: uid('b') })
  store.setWritingBlock(id)
  if (!signal.aborted) await beat(block.type === 'diagram' ? DIAGRAM_DRAW_MS : FIGURE_BEAT_MS)
  return id
}

// Act out each correction the model asked for, on the exact line it named, leaving every
// other line untouched.
async function applyEdits(store: DocStore, edits: EditOp[], signal: AbortSignal) {
  for (const edit of edits) {
    if (signal.aborted) return
    if (edit.op === 'replace') {
      const loc = store.locate(edit.id)
      if (loc?.block.type === 'text') await eraseAndRewrite(store, edit.id, loc.block.text.runs, edit.runs, signal)
    } else if (edit.op === 'delete') {
      const loc = store.locate(edit.id)
      if (loc) {
        await eraseBlock(store, edit.id, loc.block, signal)
        store.removeBlock(edit.id)
      }
    } else if (edit.op === 'insertAfter') {
      let afterId = edit.id
      for (const block of edit.blocks) {
        if (signal.aborted) return
        afterId = await typeInsertedBlock(store, afterId, block, signal)
      }
    }
  }
}

const REWRITE_SYSTEM =
  'Rewrite the one line of notes the user gives, following their instruction. Reply with only the rewritten line, no quotes and no preamble. Never use a hyphen or dash as punctuation.'
const SUMMARY_SYSTEM =
  'Summarise the notes the user gives into 3 to 6 short bullet points capturing the key ideas. Reply with only the points, each on its own line starting with "- ", no heading and no preamble. Never use a hyphen or dash as punctuation within a point.'
const TITLE_SYSTEM =
  'Give a short, specific title of 3 to 6 words for the notes the user gives. Reply with only the title: no quotes, no preamble, no trailing punctuation.'

// A failed fetch throws a TypeError with no useful text; the provider's own errors already
// read well, so only the bare network case needs dressing up.
function reason(e: unknown, providerName: string, fallback: string): string {
  if (e instanceof TypeError) {
    return `Could not reach ${providerName}. Check your connection; some providers also block requests made straight from a browser.`
  }
  return e instanceof Error ? e.message : fallback
}

let controller: AbortController | null = null

export function useAi() {
  const documentStore = useDocument()
  const settings = useSettings()
  const generating = ref(false)
  const error = ref<string | null>(null)
  // 'thinking' while the reply is being worked out, 'writing' once words reach the paper, so
  // the status can read like a person who thinks first and then puts pen to page.
  const phase = ref<'thinking' | 'writing' | null>(null)
  const providerName = computed(() => getProvider(settings.activeProvider).name)

  function stop() {
    controller?.abort()
  }

  // Work on the note that is open: correct the lines that need it in place and add any new
  // ones where they belong, acting each change out so it is seen being made and never wiping
  // what is already there. The whole reply is read before anything moves, so a change only
  // lands once the model has decided all of them.
  async function reviseNote(
    instruction: string,
    attachments: Attachment[],
    context: string,
    provider: ReturnType<typeof getProvider>,
    key: string,
  ): Promise<boolean> {
    generating.value = true
    phase.value = 'thinking'
    controller = new AbortController()
    const signal = controller.signal
    documentStore.beginAiEdit()
    try {
      const palette = getHandwriting(settings.activeHandwritingId).palette
      const prompt = `Work on my current notes below. Each editable line is tagged with its id in square brackets. Reply with ONLY a JSON object of edits, no prose:\n{ "edits": [ Edit, ... ] }\nAn Edit is one of:\n{ "op": "replace", "id": string, "content": Run[] | string }   // rewrite that one line, keeping what is right\n{ "op": "delete", "id": string }                               // remove that line\n{ "op": "insertAfter", "id": string, "blocks": Block[] }        // add new lines after that one\nChange only what I ask. To clear a stray highlight, replace the line with the same words and no highlight. Do not touch lines that are already correct.\n\nMY CURRENT NOTES:\n\n${context}\n\n---\n\nMY INSTRUCTION:\n\n${instruction}`
      const request = { system: systemPrompt(palette), prompt, attachments, maxTokens: 8000 }
      let raw = ''
      for await (const text of provider.stream(request, key, signal)) raw += text
      phase.value = 'writing'
      const parsed = parseJson(raw)
      if (!isEditReply(parsed)) throw new Error(`${provider.name} did not return any changes to make.`)
      const edits = parseEdits(parsed)
      if (!edits.length) throw new Error(`${provider.name} did not return any changes to make.`)
      await applyEdits(documentStore, edits, signal)
      return true
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return true
      error.value = reason(e, provider.name, 'The notes could not be changed.')
      return false
    } finally {
      documentStore.endAi()
      generating.value = false
      phase.value = null
      controller = null
    }
  }

  async function generate(instruction: string, attachments: Attachment[], context?: string): Promise<boolean> {
    error.value = null
    const provider = getProvider(settings.activeProvider)
    const key = await loadApiKey(provider.id)
    if (!key) {
      error.value = `Add your ${provider.vendor} API key first, using the key button.`
      return false
    }

    // Working on the current note goes through the editor, which corrects lines in place and
    // adds new ones without disturbing the rest. A brand new note streams straight onto a page.
    if (context) return reviseNote(instruction, attachments, context, provider, key)

    generating.value = true
    phase.value = 'thinking'
    controller = new AbortController()
    const signal = controller.signal
    // The writing is added to the note, never wiping what is already there: a blank note
    // fills from its first line, and a note with content continues on a fresh sheet.
    const pageIndex = documentStore.beginAiPage()
    const streamer = new BlockStreamer()
    let wroteAnything = false

    // Finished blocks wait in a queue and are typed onto the page by a pump that runs at its
    // own steady pace, so the writing reads the same whether the reply arrives in a rush or a
    // trickle. The pump keeps going until the reply is done and the queue has drained.
    const queue: Block[] = []
    let streamDone = false
    let prevRole = 'body'
    const pump = (async () => {
      for (;;) {
        const block = queue.shift()
        if (!block) {
          if (streamDone) return
          await sleep(TYPE_TICK_MS)
          continue
        }
        if (signal.aborted) return
        wroteAnything = true
        // The moment the first block reaches the page, the status turns from thinking to
        // writing; the badge shows that briefly and then clears out of the way.
        if (phase.value !== 'writing') phase.value = 'writing'
        const tool = toolFor(block, prevRole)
        if (block.type === 'text') prevRole = block.text.role
        await typeBlock(documentStore, pageIndex, block, signal, tool)
      }
    })()

    try {
      const palette = getHandwriting(settings.activeHandwritingId).palette
      const prompt = context
        ? `Here are my current notes. Build on them as I ask, adding new material that follows on from what is there. Do not repeat lines that already exist.\n\nMY CURRENT NOTES:\n\n${context}\n\n---\n\nMY INSTRUCTION:\n\n${instruction}`
        : instruction
      const request = { system: systemPrompt(palette), prompt, attachments, maxTokens: 8000 }
      for await (const text of provider.stream(request, key, signal)) {
        for (const block of streamer.push(text)) queue.push(block)
      }
      streamDone = true
      await pump
      if (streamer.title) documentStore.doc.title = streamer.title
      if (!wroteAnything) throw new Error(`${provider.name} did not return any notes to write.`)
      return true
    } catch (e) {
      streamDone = true
      await pump.catch(() => {})
      if (e instanceof DOMException && e.name === 'AbortError') return wroteAnything
      error.value = reason(e, provider.name, 'The notes could not be generated.')
      return false
    } finally {
      documentStore.endAi()
      generating.value = false
      phase.value = null
      controller = null
    }
  }

  // Rewrite one line of notes; the caller drops the reply back into whichever line it came
  // from, so this works for a paragraph, a list item, a table cell, or a free note.
  const refining = ref(false)
  async function rewriteLine(original: string, instruction: string): Promise<string | null> {
    error.value = null
    if (!original.trim()) {
      error.value = 'Select a line with some words first.'
      return null
    }
    const provider = getProvider(settings.activeProvider)
    const key = await loadApiKey(provider.id)
    if (!key) {
      error.value = `Add your ${provider.vendor} API key first, using the key button.`
      return null
    }

    refining.value = true
    try {
      const text = await provider.complete(
        REWRITE_SYSTEM,
        `Instruction: ${instruction}\n\nLine: ${original}`,
        key,
        1000,
      )
      if (!text) throw new Error(`${provider.name} returned an empty line.`)
      return stripDashes(text)
    } catch (e) {
      error.value = reason(e, provider.name, 'That line could not be rewritten.')
      return null
    } finally {
      refining.value = false
    }
  }

  // Fix one line the writer picked, in place, with the same eraser and pen a whole note
  // correction uses. Only a paragraph is animated this way; the caller drops other kinds of
  // line back in as before.
  async function refineBlock(blockId: string, instruction: string): Promise<boolean> {
    const loc = documentStore.locate(blockId)
    if (!loc || loc.block.type !== 'text') return false
    const oldRuns = loc.block.text.runs
    const newText = await rewriteLine(plainText(oldRuns), instruction)
    if (newText === null) return false
    controller = new AbortController()
    documentStore.beginAiEdit()
    try {
      await eraseAndRewrite(documentStore, blockId, oldRuns, [{ text: newText }], controller.signal)
      return true
    } finally {
      documentStore.endAi()
      controller = null
    }
  }

  // Summarise the open note into a few points and drop them in at the top under a Summary heading.
  async function summarizeNote(): Promise<boolean> {
    error.value = null
    const text = toPlainText(documentStore.doc).trim()
    if (!text) {
      error.value = 'Write some notes to summarise first.'
      return false
    }
    const provider = getProvider(settings.activeProvider)
    const key = await loadApiKey(provider.id)
    if (!key) {
      error.value = `Add your ${provider.vendor} API key first, using the key button.`
      return false
    }
    refining.value = true
    try {
      const out = await provider.complete(SUMMARY_SYSTEM, text, key, 800)
      if (!out?.trim()) throw new Error(`${provider.name} returned an empty summary.`)
      documentStore.prependSummary(stripDashes(out))
      return true
    } catch (e) {
      error.value = reason(e, provider.name, 'The note could not be summarised.')
      return false
    } finally {
      refining.value = false
    }
  }

  // Read the note and set a short, specific title from it.
  async function autoTitle(): Promise<boolean> {
    error.value = null
    const text = toPlainText(documentStore.doc).trim()
    if (!text) {
      error.value = 'Write some notes to title first.'
      return false
    }
    const provider = getProvider(settings.activeProvider)
    const key = await loadApiKey(provider.id)
    if (!key) {
      error.value = `Add your ${provider.vendor} API key first, using the key button.`
      return false
    }
    refining.value = true
    try {
      const out = await provider.complete(TITLE_SYSTEM, text, key, 60)
      const title = stripDashes(out ?? '')
        .trim()
        .replace(/^["']|["']$/g, '')
      if (!title) throw new Error(`${provider.name} returned an empty title.`)
      documentStore.setTitle(title)
      return true
    } catch (e) {
      error.value = reason(e, provider.name, 'A title could not be made.')
      return false
    } finally {
      refining.value = false
    }
  }

  return {
    generating,
    phase,
    providerName,
    error,
    generate,
    stop,
    rewriteLine,
    refineBlock,
    refining,
    summarizeNote,
    autoTitle,
  }
}
