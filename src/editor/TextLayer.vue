<script setup lang="ts">
// The writing column: everything that flows down a page. Each block renders by type
// and edits in place. Paragraphs, lists, tables, callouts, and diagrams all sit on
// the same rule grid. Roles carry the sample look by default (blue title, red
// heading, navy body), and any of it can be recoloured or re-emphasised freely.
import { computed, nextTick, ref, watch, type CSSProperties } from 'vue'
import type { Block, Page, TextRole, TextRun } from '@/types'
import type { TextMetrics } from './alignment'
import { getHandwriting, bodyFontStack, headerFontStack } from '@/handwriting/registry'
import { plainText, type PasteGroup } from '@/ui/richText'
import { uid } from '@/util/id'
import { useDocument, lineKey } from '@/store/document'
import { useSettings } from '@/store/settings'
import { hashSeed } from '@/diagrams/wobble'
import EditableText from './EditableText.vue'
import TableBlock from './TableBlock.vue'
import CalloutsBlock from './CalloutsBlock.vue'
import ImageBlock from './ImageBlock.vue'
import Icon from '@/ui/Icon.vue'
import Diagram from '@/diagrams/Diagram.vue'

const props = defineProps<{
  page: Page
  pageIndex: number
  metrics: TextMetrics
  pxPerMm: number
  editable: boolean
}>()

const documentStore = useDocument()
const settings = useSettings()
const handwriting = computed(() => getHandwriting(settings.activeHandwritingId))

const lineHeightPx = computed(() => props.metrics.lineHeight * props.pxPerMm)
// Blocks lifted out to float are drawn by the free figure layer, so the flow skips them.
const flowBlocks = computed(() => props.page.blocks.filter((b) => !b.float))
// The line the AI is typing into right now, so a blinking caret can ride at its end and the
// writing plainly looks like someone is typing it.
function isWriting(blockId: string): boolean {
  return documentStore.generating && documentStore.writingBlockId === blockId
}
const columnStyle = computed<CSSProperties>(() => ({
  left: `${props.metrics.left * props.pxPerMm}px`,
  top: `${(props.metrics.firstBaseline - props.metrics.lineHeight) * props.pxPerMm}px`,
  width: `${props.metrics.width * props.pxPerMm}px`,
}))

function roleColor(role: TextRole): string {
  const p = handwriting.value.palette
  if (role === 'title') return p.title
  if (role === 'heading' || role === 'subheading') return p.heading
  return p.ink
}
function roleFont(role: TextRole): string {
  return role === 'title' || role === 'heading' ? headerFontStack(handwriting.value) : bodyFontStack(handwriting.value)
}
function defaultAlign(role: TextRole): 'left' | 'center' | 'justify' {
  return role === 'caption' || role === 'subtitle' ? 'center' : 'left'
}

function paragraphStyle(block: Extract<Block, { type: 'text' }>): CSSProperties {
  const t = block.text
  const leadRules = Math.round(props.metrics.roleLeadIn[t.role])
  return {
    fontFamily: roleFont(t.role),
    fontSize: `${props.metrics.fontSize[t.role] * props.pxPerMm * (block.scale ?? 1)}px`,
    lineHeight: `${lineHeightPx.value}px`,
    color: roleColor(t.role),
    textAlign: t.align ?? defaultAlign(t.role),
    marginTop: `${leadRules * lineHeightPx.value}px`,
    marginLeft: `${(t.indent ?? 0) * props.pxPerMm}px`,
  }
}
function listStyle(block: Extract<Block, { type: 'list' }>): CSSProperties {
  return {
    fontFamily: bodyFontStack(handwriting.value),
    fontSize: `${props.metrics.fontSize.body * props.pxPerMm * (block.scale ?? 1)}px`,
    lineHeight: `${lineHeightPx.value}px`,
    color: handwriting.value.palette.ink,
  }
}
function quoteStyle(): CSSProperties {
  return {
    fontFamily: bodyFontStack(handwriting.value),
    fontSize: `${props.metrics.fontSize.body * props.pxPerMm}px`,
    lineHeight: `${lineHeightPx.value}px`,
    color: handwriting.value.palette.ink,
  }
}
function captionStyle(): CSSProperties {
  return {
    fontFamily: bodyFontStack(handwriting.value),
    fontSize: `${props.metrics.fontSize.caption * props.pxPerMm}px`,
    lineHeight: `${lineHeightPx.value}px`,
    color: handwriting.value.palette.ink,
    textAlign: 'center',
  }
}

// Focus follows content the writer creates: after adding a line, focus lands on it.
const editables = ref(new Map<string, InstanceType<typeof EditableText>>())
function bindEditable(key: string) {
  return (el: unknown) => {
    if (el) editables.value.set(key, el as InstanceType<typeof EditableText>)
    else editables.value.delete(key)
  }
}
// The line to move the caret into next, and where along it the caret should sit, so a merge
// can drop the caret at the join between the two lines it made one.
const pendingFocus = ref<{ key: string; offset?: number } | null>(null)
watch(pendingFocus, async (target) => {
  if (!target) return
  await nextTick()
  editables.value.get(target.key)?.focus(target.offset)
  pendingFocus.value = null
})

// Join two lines of runs into one, dropping the empty placeholders so the seam is clean.
function mergeRuns(a: TextRun[], b: TextRun[]): TextRun[] {
  const runs = [...a, ...b].filter((r) => r.text.length)
  return runs.length ? runs : [{ text: '' }]
}

// A block inserted from the tool bar asks the editor to place the caret in it.
watch(
  () => documentStore.pendingFocusId,
  async (id) => {
    if (!id) return
    await nextTick()
    const target = editables.value.get(`text:${id}`) ?? editables.value.get(`list:${id}:0`)
    if (target) {
      target.focus(documentStore.pendingFocusOffset ?? undefined)
      documentStore.clearPendingFocus()
      return
    }
    // A code block edits in a textarea rather than a contenteditable, so it is focused by
    // reaching for its element directly; clearing the request either way avoids a stale ask
    // grabbing a later line.
    const area = document.querySelector(`.code-slot[data-block-id="${CSS.escape(id)}"] .code-text`)
    if (area instanceof HTMLTextAreaElement) area.focus()
    if (editables.value.get(`text:${id}`) || area) documentStore.clearPendingFocus()
  },
)

function onFocusBlock(blockId: string, item: number | null = null) {
  documentStore.select(blockId)
  // The caret resting on a line makes it the anchor a later shift-click extends from, and
  // ends any line selection that was showing since the writer is now typing again.
  documentStore.setLineAnchor(blockId, item)
  documentStore.clearLineSelection()
}
// Shift-clicking a line selects every line from the anchor to it. The click is swallowed so
// the caret does not jump and the anchor stays put, letting the writer sweep a whole span.
function onLineMouseDown(blockId: string, item: number | null, event: MouseEvent) {
  if (!event.shiftKey) return
  event.preventDefault()
  window.getSelection()?.removeAllRanges()
  // Let the line go: while it is focused it holds its own DOM and would not repaint when a
  // bar action rewrites its runs, so blurring lets every selected line show the change at once.
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  documentStore.selectLineRange(props.pageIndex, { blockId, item })
}
// The selected lines as a set of keys, so each line can ask in one lookup whether it is lit.
const selectedLineKeys = computed(
  () => new Set((documentStore.lineSelection?.refs ?? []).map((r) => lineKey(r.blockId, r.item))),
)

function onParagraphEnter(block: Extract<Block, { type: 'text' }>, after: TextRun[]) {
  const nextRole = block.text.role === 'body' || block.text.role === 'caption' ? block.text.role : 'body'
  const id = documentStore.addParagraphAfter(block.id, nextRole)
  documentStore.setRuns(id, after)
  // Focus the new line at once so fast typing never loses a keystroke, then, only if it landed
  // past the foot of the page, carry it onto the next sheet and follow the caret over.
  pendingFocus.value = { key: `text:${id}` }
  flowToNextPage(id)
}
// A little room left at the foot of a page, so writing stops short of the edge like real paper.
const PAGE_FOOT_MM = 12
// After a line is added to a page, carry whatever no longer fits onto the next sheet, then keep
// the caret on the line that was just written. This works whether the new line is at the bottom
// of a full page or inserted into the middle of one, so a page never grows past a single sheet.
function flowToNextPage(caretId: string) {
  void nextTick(() => {
    const caretEl = document.querySelector(`[data-block-id="${CSS.escape(caretId)}"]`) as HTMLElement | null
    const pageEl = caretEl?.closest('.note-page') as HTMLElement | null
    if (!pageEl) return
    const limit = pageEl.clientHeight - (PAGE_FOOT_MM * pageEl.clientWidth) / 210
    const top = pageEl.getBoundingClientRect().top
    const blocks = Array.from(pageEl.querySelectorAll('.text-layer > [data-block-id]')) as HTMLElement[]
    // Never move a lone first block, so a block taller than a page cannot loop off it forever.
    for (let j = 1; j < blocks.length; j++) {
      if (blocks[j].getBoundingClientRect().bottom - top > limit) {
        documentStore.movePageTail(blocks[j].getAttribute('data-block-id')!)
        // Focus the caret line directly once the layout has re-rendered, rather than through
        // the shared focus request, which would not fire again for a line already asked for.
        void nextTick(() => focusBlockCaret(caretId, 0))
        return
      }
    }
  })
}
// Pull content up to fill pages, one block per frame, until no leading block of a later page
// fits on the page above it. Run once after a page is joined up, so the whole page flows back
// rather than only its first line, and empty pages left behind close up.
function flowUp(guard = 0) {
  if (guard > 80) return
  void nextTick(() => {
    const pages = Array.from(document.querySelectorAll('.note-page')) as HTMLElement[]
    for (let i = 0; i < pages.length - 1; i++) {
      const prevEl = pages[i]
      const curEl = pages[i + 1]
      const pxPerMm = prevEl.clientWidth / 210
      const limit = prevEl.clientHeight - PAGE_FOOT_MM * pxPerMm
      const prevBlocks = Array.from(prevEl.querySelectorAll('.text-layer > [data-block-id]')) as HTMLElement[]
      const prevTop = prevEl.getBoundingClientRect().top
      const prevBottom = prevBlocks.length
        ? prevBlocks[prevBlocks.length - 1].getBoundingClientRect().bottom - prevTop
        : 0
      const first = curEl.querySelector('.text-layer > [data-block-id]') as HTMLElement | null
      if (first && prevBottom + first.getBoundingClientRect().height <= limit) {
        documentStore.pullFirstBlockUp(i + 1)
        flowUp(guard + 1)
        return
      }
    }
  })
}
// Put the caret at a character offset within a block's editable, wherever the block now lives.
function focusBlockCaret(id: string, offset: number) {
  const el = document.querySelector(`[data-block-id="${CSS.escape(id)}"]`) as HTMLElement | null
  const editable = (el?.classList.contains('editable') ? el : el?.querySelector('.editable')) as HTMLElement | null
  if (!editable) return
  editable.focus()
  const selection = window.getSelection()
  const range = document.createRange()
  let remaining = offset
  const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const length = (node.textContent ?? '').split('​').join('').length
    if (remaining <= length) {
      range.setStart(node, Math.min(remaining, node.textContent?.length ?? 0))
      range.collapse(true)
      selection?.removeAllRanges()
      selection?.addRange(range)
      return
    }
    remaining -= length
    node = walker.nextNode()
  }
  range.selectNodeContents(editable)
  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
}
// Each pasted line becomes its own paragraph after this one, so a copied block of lines lands
// as a run of paragraphs rather than a wall of text in one.
function onParagraphPasteLines(block: Extract<Block, { type: 'text' }>, lines: string[]) {
  let afterId = block.id
  for (const line of lines) {
    afterId = documentStore.addParagraphAfter(afterId, 'body')
    documentStore.setRuns(afterId, [{ text: line }])
  }
  pendingFocus.value = { key: `text:${afterId}` }
  // Paste can drop many lines at once and overrun the page; flow the overflow onto the next.
  flowPageRepeatedly(afterId)
}
// Paste and other bulk changes can push several lines off a page at once, so the overflow is
// flowed onto the next page again and again until the page fits within a single sheet.
function flowPageRepeatedly(caretId: string, guard = 0) {
  if (guard > 40) return
  void nextTick(() => {
    const caretEl = document.querySelector(`[data-block-id="${CSS.escape(caretId)}"]`) as HTMLElement | null
    const pageEl = caretEl?.closest('.note-page') as HTMLElement | null
    if (!pageEl) return
    const limit = pageEl.clientHeight - (PAGE_FOOT_MM * pageEl.clientWidth) / 210
    const top = pageEl.getBoundingClientRect().top
    const blocks = Array.from(pageEl.querySelectorAll('.text-layer > [data-block-id]')) as HTMLElement[]
    for (let j = 1; j < blocks.length; j++) {
      if (blocks[j].getBoundingClientRect().bottom - top > limit) {
        documentStore.movePageTail(blocks[j].getAttribute('data-block-id')!)
        void nextTick(() => {
          focusBlockCaret(caretId, 0)
          flowPageRepeatedly(caretId, guard + 1)
        })
        return
      }
    }
  })
}
// Lay a pasted block out by its sections: a lone line becomes a red heading, a run of lines
// becomes a numbered list under it, numbering restarting for each list, so a copied set of
// answers lands the way it was written.
function insertStructure(afterBlockId: string, groups: PasteGroup[], ordered: boolean): string {
  let afterId = afterBlockId
  for (const group of groups) {
    if (group.heading !== undefined) {
      const heading: Block = {
        id: uid('b'),
        type: 'text',
        text: { id: uid('t'), role: 'heading', runs: [{ text: group.heading }] },
      }
      documentStore.insertAfter(afterId, heading)
      afterId = heading.id
    } else if (group.items) {
      const list: Block = { id: uid('b'), type: 'list', ordered, items: group.items.map((line) => [{ text: line }]) }
      documentStore.insertAfter(afterId, list)
      afterId = list.id
    }
  }
  return afterId
}
function onParagraphPasteStructure(block: Extract<Block, { type: 'text' }>, groups: PasteGroup[]) {
  const lastId = insertStructure(block.id, groups, true)
  if (plainText(block.text.runs).trim() === '') documentStore.removeBlock(block.id)
  documentStore.requestFocus(lastId)
}
// Append `runs` onto the end of the line above `blockId`, whatever kind of line it is: a
// paragraph, or the last bullet of a list. The caret target is returned at the seam. Null
// means there is no line above to join, or the block above is a figure that holds no words.
function joinOntoLineAbove(blockId: string, runs: TextRun[]): { key: string; offset: number } | null {
  const page = props.page
  const index = page.blocks.findIndex((b) => b.id === blockId)
  if (index <= 0) return null
  const prev = page.blocks[index - 1]
  if (prev.type === 'text') {
    const offset = plainText(prev.text.runs).length
    documentStore.setRuns(prev.id, mergeRuns(prev.text.runs, runs))
    return { key: `text:${prev.id}`, offset }
  }
  if (prev.type === 'list') {
    const last = prev.items.length - 1
    const offset = plainText(prev.items[last]).length
    prev.items[last] = mergeRuns(prev.items[last], runs)
    documentStore.touch()
    return { key: `list:${prev.id}:${last}`, offset }
  }
  return null
}

// Backspace at the start of a line whose block above holds no text — a divider, image, table,
// or code block — removes that block above, so the line moves up into its place the way a word
// processor deletes the object above on a backspace. The caret stays at the line's start.
// Returns true when there was such a block above to remove.
function removeFigureAbove(blockId: string, focusKey: string): boolean {
  const index = props.page.blocks.findIndex((b) => b.id === blockId)
  if (index <= 0) return false
  documentStore.removeBlock(props.page.blocks[index - 1].id)
  pendingFocus.value = { key: focusKey, offset: 0 }
  return true
}

// Backspace at the start of a paragraph joins it onto the line above, be it another paragraph
// or a bullet, dropping the caret at the seam, so the words come up onto the previous line.
function onParagraphMergeBack(block: Extract<Block, { type: 'text' }>, runs: TextRun[]) {
  const target = joinOntoLineAbove(block.id, runs)
  if (target) {
    documentStore.removeBlock(block.id)
    pendingFocus.value = target
    return
  }
  // A line with words sitting under a figure moves up by removing the figure above it.
  if (plainText(runs).trim() !== '' && removeFigureAbove(block.id, `text:${block.id}`)) return
  // The first line of a page: backspace here joins it onto the page above, and a page left
  // empty gives its space back. The caret rests where the two lines meet on the new page.
  const up = documentStore.mergeToPrevPageEnd(block.id, runs)
  if (up) {
    void nextTick(() => {
      focusBlockCaret(up.blockId, up.offset)
      // Then flow the rest of the joined page up to fill the space, the way removing a page
      // break in a word processor pulls the following content back onto the page above.
      flowUp()
    })
    return
  }
  // An empty line with nothing above it to join simply goes, giving its row back.
  if (plainText(runs).trim() === '' && props.page.blocks.findIndex((b) => b.id === block.id) > 0) {
    documentStore.removeBlock(block.id)
  }
}

function onListEnter(block: Extract<Block, { type: 'list' }>, itemIndex: number, after: TextRun[]) {
  // Enter on an empty bullet ends the list: the empty bullet is dropped and the writing
  // carries on as a normal paragraph after the list, so pressing enter twice escapes it.
  if (plainText(block.items[itemIndex]).trim() === '' && plainText(after).trim() === '') {
    block.items.splice(itemIndex, 1)
    block.checked?.splice(itemIndex, 1)
    const id = documentStore.addParagraphAfter(block.id, 'body')
    if (!block.items.length) documentStore.removeBlock(block.id)
    documentStore.touch()
    pendingFocus.value = { key: `text:${id}` }
    return
  }
  block.items.splice(itemIndex + 1, 0, after.length ? after : [{ text: '' }])
  block.checked?.splice(itemIndex + 1, 0, false)
  documentStore.touch()
  pendingFocus.value = { key: `list:${block.id}:${itemIndex + 1}` }
}
// Each pasted line becomes the next bullet right after this one, so a copied list adopts our
// own numbering in order instead of arriving as a block on its own.
function onListPasteLines(block: Extract<Block, { type: 'list' }>, itemIndex: number, lines: string[]) {
  block.items.splice(itemIndex + 1, 0, ...lines.map((line) => [{ text: line }]))
  block.checked?.splice(itemIndex + 1, 0, ...lines.map(() => false))
  documentStore.touch()
  pendingFocus.value = { key: `list:${block.id}:${itemIndex + lines.length}` }
}
// A block with several sections pasted into a bullet becomes headings and fresh numbered
// lists after this list, and the empty bullet it was dropped into is cleared away.
function onListPasteStructure(block: Extract<Block, { type: 'list' }>, itemIndex: number, groups: PasteGroup[]) {
  void itemIndex
  const lastId = insertStructure(block.id, groups, block.ordered)
  if (block.items.length === 1 && plainText(block.items[0]).trim() === '') documentStore.removeBlock(block.id)
  documentStore.requestFocus(lastId)
}
// Backspace at the start of a bullet joins it onto the line above: the bullet before it, or,
// for the first bullet, the paragraph or list that sits above the whole list. The caret rests
// at the seam.
function onListMergeBack(block: Extract<Block, { type: 'list' }>, itemIndex: number, runs: TextRun[]) {
  if (itemIndex > 0) {
    const joinAt = plainText(block.items[itemIndex - 1]).length
    block.items[itemIndex - 1] = mergeRuns(block.items[itemIndex - 1], runs)
    block.items.splice(itemIndex, 1)
    block.checked?.splice(itemIndex, 1)
    documentStore.touch()
    pendingFocus.value = { key: `list:${block.id}:${itemIndex - 1}`, offset: joinAt }
    return
  }
  const target = joinOntoLineAbove(block.id, runs)
  if (target) {
    block.items.splice(0, 1)
    block.checked?.splice(0, 1)
    if (!block.items.length) documentStore.removeBlock(block.id)
    else documentStore.touch()
    pendingFocus.value = target
    return
  }
  // A first bullet with words under a figure moves up by removing the figure above it.
  if (plainText(runs).trim() !== '' && removeFigureAbove(block.id, `list:${block.id}:0`)) return
  if (block.items.length === 1 && plainText(runs).trim() === '') documentStore.removeBlock(block.id)
}

// Enter at the end of a quote carries on as a normal paragraph after it, and any words past
// the caret move down with it, so a quote is left behind cleanly.
function onQuoteEnter(block: Extract<Block, { type: 'quote' }>, after: TextRun[]) {
  const id = documentStore.addParagraphAfter(block.id, 'body')
  documentStore.setRuns(id, after)
  pendingFocus.value = { key: `text:${id}` }
}
// Backspace at the start of a quote joins it onto the line above, or clears the quote away if
// it is empty, so it never traps the caret.
function onQuoteMergeBack(block: Extract<Block, { type: 'quote' }>, runs: TextRun[]) {
  const target = joinOntoLineAbove(block.id, runs)
  if (target) {
    documentStore.removeBlock(block.id)
    pendingFocus.value = target
    return
  }
  // A quote with words under a figure moves up by removing the figure above it.
  if (plainText(runs).trim() !== '' && removeFigureAbove(block.id, `text:${block.id}`)) return
  if (plainText(runs).trim() === '') documentStore.removeBlock(block.id)
}
// Save a code block as it is typed and grow the field to fit its lines, so all of the code
// stays in view without an inner scrollbar.
function onCodeInput(block: Extract<Block, { type: 'code' }>, event: Event) {
  const area = event.target as HTMLTextAreaElement
  documentStore.setCode(block.id, area.value)
  area.style.height = 'auto'
  area.style.height = `${area.scrollHeight}px`
}
// Tab indents inside a code block instead of leaving it, and backspace on an empty block
// removes it and drops the caret onto the line above, so a code block is never a dead end.
function onCodeKeydown(block: Extract<Block, { type: 'code' }>, event: KeyboardEvent) {
  const area = event.target as HTMLTextAreaElement
  if (event.key === 'Tab') {
    event.preventDefault()
    const at = area.selectionStart
    documentStore.setCode(block.id, `${area.value.slice(0, at)}  ${area.value.slice(area.selectionEnd)}`)
    void nextTick(() => {
      area.selectionStart = area.selectionEnd = at + 2
      area.style.height = 'auto'
      area.style.height = `${area.scrollHeight}px`
    })
  } else if (event.key === 'Backspace' && area.value === '') {
    event.preventDefault()
    const target = joinOntoLineAbove(block.id, [])
    const loc = documentStore.locate(block.id)
    if (target) {
      documentStore.removeBlock(block.id)
      pendingFocus.value = target
    } else if (loc && loc.blockIndex > 0) {
      documentStore.removeBlock(block.id)
    }
  }
}
// Grow a code field to fit its content as it mounts and whenever it changes, so a code block
// loaded from a note shows all its lines without an inner scrollbar.
function fit(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
const vAutoGrow = {
  mounted: (el: HTMLTextAreaElement) => fit(el),
  updated: (el: HTMLTextAreaElement) => fit(el),
}

// A gentle hint only where it helps: the empty document invites the first line, and a
// freshly inserted heading or title names itself. Plain body lines stay clean, so a
// new line after Enter never repeats a placeholder.
const ROLE_HINT: Partial<Record<TextRole, string>> = {
  title: 'Title',
  subtitle: 'Subtitle',
  heading: 'Heading',
  subheading: 'Subheading',
  caption: 'Caption',
}
function placeholderFor(block: Extract<Block, { type: 'text' }>, index: number): string {
  if (block.text.role !== 'body') return ROLE_HINT[block.text.role] ?? ''
  const pristine =
    props.pageIndex === 0 && index === 0 && documentStore.doc.pages.length === 1 && props.page.blocks.length === 1
  return pristine ? 'Start writing' : ''
}

function diagramFont() {
  return bodyFontStack(handwriting.value)
}
function updateRuns(blockId: string, runs: TextRun[]) {
  documentStore.setRuns(blockId, runs)
}

// Drag the handle at a figure's foot to make it taller or shorter, in whole ruled lines.
function startResize(blockId: string, fromRules: number, event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  const startY = event.clientY
  const perRule = lineHeightPx.value
  function onMove(move: PointerEvent) {
    documentStore.setFigureHeight(blockId, fromRules + (move.clientY - startY) / perRule)
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
</script>

<template>
  <div class="text-layer" :style="columnStyle">
    <template v-for="block in flowBlocks" :key="block.id">
      <EditableText
        v-if="block.type === 'text'"
        :ref="bindEditable(`text:${block.id}`)"
        :model-value="block.text.runs"
        class="paragraph"
        :class="{ writing: isWriting(block.id), 'line-selected': selectedLineKeys.has(lineKey(block.id, null)) }"
        :data-block-id="block.id"
        :style="paragraphStyle(block)"
        :placeholder="placeholderFor(block, page.blocks.indexOf(block))"
        split-lines
        @update:model-value="updateRuns(block.id, $event)"
        @mousedown="onLineMouseDown(block.id, null, $event)"
        @focus="onFocusBlock(block.id)"
        @enter="onParagraphEnter(block, $event)"
        @paste-lines="onParagraphPasteLines(block, $event)"
        @paste-structure="onParagraphPasteStructure(block, $event)"
        @merge-back="onParagraphMergeBack(block, $event)"
        @select-all-note="documentStore.selectWholeNote()"
      />

      <ol
        v-else-if="block.type === 'list'"
        class="list"
        :class="{ bullets: !block.ordered, writing: isWriting(block.id) }"
        :data-block-id="block.id"
        :style="listStyle(block)"
      >
        <li v-for="(_, i) in block.items" :key="i" :class="{ task: !!block.checked }">
          <button
            v-if="block.checked"
            class="check"
            :class="{ on: block.checked[i] }"
            :title="block.checked[i] ? 'Mark not done' : 'Mark done'"
            @click="documentStore.toggleListCheck(block.id, i)"
          >
            <Icon v-if="block.checked[i]" name="check" :size="13" />
          </button>
          <span v-else class="marker">{{ block.ordered ? `${i + 1}.` : '•' }}</span>
          <EditableText
            :ref="bindEditable(`list:${block.id}:${i}`)"
            v-model="block.items[i]"
            class="li-text"
            :class="{
              'line-selected': selectedLineKeys.has(lineKey(block.id, i)),
              done: block.checked && block.checked[i],
            }"
            placeholder="List item"
            split-lines
            @mousedown="onLineMouseDown(block.id, i, $event)"
            @focus="onFocusBlock(block.id, i)"
            @enter="onListEnter(block, i, $event)"
            @paste-lines="onListPasteLines(block, i, $event)"
            @paste-structure="onListPasteStructure(block, i, $event)"
            @merge-back="onListMergeBack(block, i, $event)"
            @select-all-note="documentStore.selectWholeNote()"
          />
        </li>
      </ol>

      <div v-else-if="block.type === 'table'" class="table-slot" :data-block-id="block.id">
        <div v-if="block.caption" class="caption" :style="captionStyle()">{{ block.caption }}</div>
        <TableBlock
          :block="block"
          :width-mm="metrics.width"
          :row-height-mm="metrics.lineHeight"
          :font-stack="bodyFontStack(handwriting)"
          :ink="handwriting.palette.ink"
          :scale="block.scale ?? 1"
          :editable="editable"
          @focus="onFocusBlock(block.id)"
        />
      </div>

      <div v-else-if="block.type === 'callouts'" class="callouts-slot" :data-block-id="block.id">
        <div v-if="block.caption" class="caption" :style="captionStyle()">{{ block.caption }}</div>
        <CalloutsBlock
          :block="block"
          :font-stack="bodyFontStack(handwriting)"
          :scale="block.scale ?? 1"
          :editable="editable"
          @focus="onFocusBlock(block.id)"
        />
      </div>

      <div
        v-else-if="block.type === 'diagram'"
        class="diagram-slot"
        :data-block-id="block.id"
        :style="{ height: `${block.heightRules * lineHeightPx}px` }"
        @click="onFocusBlock(block.id)"
      >
        <Diagram
          :spec="block.spec"
          :width-mm="metrics.width"
          :height-mm="block.heightRules * metrics.lineHeight"
          :font-stack="diagramFont()"
          :seed="hashSeed(block.id)"
          :scale="block.scale ?? 1"
          :editable="editable"
          :animate="isWriting(block.id)"
          @edit-label="(shapeIndex, text) => documentStore.setDiagramLabel(block.id, shapeIndex, text)"
        />
        <button
          v-if="editable"
          class="resize-handle"
          title="Drag to resize"
          @pointerdown="startResize(block.id, block.heightRules, $event)"
        >
          <span />
        </button>
      </div>

      <div
        v-else-if="block.type === 'image'"
        class="image-slot"
        :data-block-id="block.id"
        :style="{ height: `${block.heightRules * lineHeightPx}px` }"
        @click="onFocusBlock(block.id)"
      >
        <ImageBlock :blob-ref="block.blobRef" :alt="block.alt" />
        <button
          v-if="editable"
          class="figure-remove"
          title="Remove picture"
          @click.stop="documentStore.removeBlock(block.id)"
        >
          <Icon name="trash" :size="15" />
        </button>
        <button
          v-if="editable"
          class="resize-handle"
          title="Drag to resize"
          @pointerdown="startResize(block.id, block.heightRules, $event)"
        >
          <span />
        </button>
      </div>

      <blockquote v-else-if="block.type === 'quote'" class="quote-slot" :data-block-id="block.id" :style="quoteStyle()">
        <EditableText
          :ref="bindEditable(`text:${block.id}`)"
          v-model="block.runs"
          class="quote-text"
          placeholder="Quote"
          split-lines
          @focus="onFocusBlock(block.id)"
          @enter="onQuoteEnter(block, $event)"
          @merge-back="onQuoteMergeBack(block, $event)"
          @select-all-note="documentStore.selectWholeNote()"
        />
        <button
          v-if="editable"
          class="figure-remove"
          title="Remove quote"
          @click.stop="documentStore.removeBlock(block.id)"
        >
          <Icon name="trash" :size="15" />
        </button>
      </blockquote>

      <div v-else-if="block.type === 'code'" class="code-slot" :data-block-id="block.id">
        <textarea
          v-auto-grow
          class="code-text"
          :value="block.text"
          placeholder="Code"
          spellcheck="false"
          rows="1"
          @focus="onFocusBlock(block.id)"
          @input="onCodeInput(block, $event)"
          @keydown="onCodeKeydown(block, $event)"
        />
        <button
          v-if="editable"
          class="figure-remove"
          title="Remove code"
          @click.stop="documentStore.removeBlock(block.id)"
        >
          <Icon name="trash" :size="15" />
        </button>
      </div>

      <div
        v-else-if="block.type === 'divider'"
        class="divider-slot"
        :data-block-id="block.id"
        @click="onFocusBlock(block.id)"
      >
        <hr class="divider-line" />
        <button
          v-if="editable"
          class="figure-remove"
          title="Remove divider"
          @click.stop="documentStore.removeBlock(block.id)"
        >
          <Icon name="trash" :size="15" />
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.text-layer {
  position: absolute;
}
/* Each line eases in as it is placed, so a note settles onto the page gently and, while
   Claude writes, every fresh line is seen arriving. */
@keyframes line-in {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.paragraph,
.list,
.table-slot,
.callouts-slot,
.diagram-slot {
  animation: line-in 0.3s ease both;
}
.paragraph {
  cursor: text;
}
/* The typing caret: a slim ink bar that sits right after the last character the AI has
   written, so it moves along the line as the words appear and blinks like a real cursor.
   For a paragraph it follows the text end; for a list it rides the item being written. */
.paragraph.writing::after,
.list.writing li:last-child .li-text::after {
  content: '';
  display: inline-block;
  width: 0.09em;
  height: 1.05em;
  margin-left: 0.04em;
  vertical-align: text-bottom;
  background: currentColor;
  border-radius: 1px;
  animation: caret-blink 1s steps(1) infinite;
}
@keyframes caret-blink {
  0%,
  49% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.list li {
  display: flex;
  gap: 8px;
}
.list .marker {
  flex-shrink: 0;
  opacity: 0.85;
}
.list .li-text {
  flex: 1;
}
/* A checklist box: a small square that fills with a tick when the item is done, sitting on
   the rule beside the writing. The done line is struck through and dimmed. */
.list li.task {
  align-items: baseline;
}
.list .check {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  margin-top: 2px;
  padding: 0;
  border: 1.5px solid var(--accent, #4a72b0);
  border-radius: 4px;
  background: transparent;
  color: #fff;
  cursor: pointer;
}
.list .check.on {
  background: var(--accent, #4a72b0);
}
.list .li-text.done {
  text-decoration: line-through;
  opacity: 0.55;
}
/* A quote set apart by a coloured bar down its left edge, its words in the body hand. */
.quote-slot {
  position: relative;
  margin: 2px 0;
  padding-left: 14px;
  border-left: 3px solid var(--accent, #4a72b0);
}
.quote-text {
  font-style: italic;
  opacity: 0.9;
}
/* A block of code in a plain monospace face on a faint panel, its spacing kept exactly. */
.code-slot {
  position: relative;
  margin: 4px 0;
}
.code-text {
  display: block;
  width: 100%;
  box-sizing: border-box;
  resize: none;
  overflow: hidden;
  border: none;
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--accent-wash, rgba(74, 114, 176, 0.08));
  color: var(--ink, #33334c);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre;
  tab-size: 2;
}
.code-text:focus {
  outline: 2px solid var(--accent-wash-2, rgba(74, 114, 176, 0.2));
}
/* A rule across the writing column that parts one section from the next. */
.divider-slot {
  position: relative;
  padding: 8px 0;
}
.divider-line {
  border: none;
  border-top: 2px solid var(--hairline, rgba(51, 51, 76, 0.18));
  margin: 0;
}
.quote-slot:hover .figure-remove,
.code-slot:hover .figure-remove,
.divider-slot:hover .figure-remove {
  opacity: 1;
}
.table-slot,
.callouts-slot {
  padding: 6px 0;
}
.caption {
  margin-bottom: 2px;
}
.diagram-slot,
.image-slot {
  position: relative;
  width: 100%;
}
.image-slot:hover .resize-handle {
  opacity: 1;
}
/* A quiet remove button in the corner of a picture, shown only while it is pointed at. */
.figure-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 7px;
  color: #fff;
  background: rgba(31, 31, 40, 0.72);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.image-slot:hover .figure-remove {
  opacity: 1;
}
.figure-remove:hover {
  background: var(--danger, #b73b3a);
}
/* A quiet grip at the foot of a figure; it appears on hover and drags the height. */
.resize-handle {
  position: absolute;
  left: 50%;
  bottom: -6px;
  transform: translateX(-50%);
  display: grid;
  place-items: center;
  width: 46px;
  height: 16px;
  border: none;
  background: transparent;
  cursor: ns-resize;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.diagram-slot:hover .resize-handle {
  opacity: 1;
}
.resize-handle span {
  width: 34px;
  height: 4px;
  border-radius: 3px;
  background: var(--accent, #4a72b0);
  opacity: 0.55;
}
.resize-handle:hover span {
  opacity: 0.9;
}
</style>
