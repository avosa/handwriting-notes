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
import { loadApiKey } from '@/store/persistence'
import { useDocument } from '@/store/document'
import { useSettings } from '@/store/settings'
import { getHandwriting } from '@/handwriting/registry'

// The pace the words appear at: a few characters every short tick, quick but slow enough to
// watch the writing happen and see the tools being used along the way.
const TYPE_CHARS_PER_TICK = 4
const TYPE_TICK_MS = 14
const FIGURE_BEAT_MS = 160
// A diagram draws its strokes and sets its labels down over this long, so the pump holds on
// it and the next line waits until the figure has been drawn.
const DIAGRAM_DRAW_MS = 1700
// The beat where the AI reaches for a tool and presses it before using it, long enough for
// the ghost cursor to glide over and the button to react.
const TOOL_BEAT_MS = 440

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

type DocStore = ReturnType<typeof useDocument>

// Reveal a paragraph's words a few characters at a time, then settle on the finished runs.
async function typeRuns(store: DocStore, blockId: string, full: TextRun[], signal: AbortSignal) {
  const total = runLength(full)
  for (let n = TYPE_CHARS_PER_TICK; n < total; n += TYPE_CHARS_PER_TICK) {
    if (signal.aborted) break
    store.setRuns(blockId, slicedRuns(full, n))
    await sleep(TYPE_TICK_MS)
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
      await sleep(TYPE_TICK_MS)
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
  await sleep(TOOL_BEAT_MS)
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
    if (!signal.aborted) await sleep(block.type === 'diagram' ? DIAGRAM_DRAW_MS : FIGURE_BEAT_MS)
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

const REWRITE_SYSTEM =
  'Rewrite the one line of notes the user gives, following their instruction. Reply with only the rewritten line, no quotes and no preamble. Never use a hyphen or dash as punctuation.'

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

  async function generate(instruction: string, attachments: Attachment[], context?: string): Promise<boolean> {
    error.value = null
    const provider = getProvider(settings.activeProvider)
    const key = await loadApiKey(provider.id)
    if (!key) {
      error.value = `Add your ${provider.vendor} API key first, using the key button.`
      return false
    }

    generating.value = true
    phase.value = 'thinking'
    controller = new AbortController()
    const signal = controller.signal
    // When working on the current note, begin at the line the writer chose so a section is
    // written in place; a brand new note simply fills from its first line.
    const pageIndex = documentStore.beginAiPage(Boolean(context))
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
      const prompt = context ? `Here are my current notes:\n\n${context}\n\n---\n\n${instruction}` : instruction
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

  return { generating, phase, providerName, error, generate, stop, rewriteLine, refining }
}
