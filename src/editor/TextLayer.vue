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
      target.focus()
      documentStore.clearPendingFocus()
    }
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
  pendingFocus.value = { key: `text:${id}` }
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

// Backspace at the start of a paragraph joins it onto the line above, be it another paragraph
// or a bullet, dropping the caret at the seam, so the words come up onto the previous line.
function onParagraphMergeBack(block: Extract<Block, { type: 'text' }>, runs: TextRun[]) {
  const target = joinOntoLineAbove(block.id, runs)
  if (target) {
    documentStore.removeBlock(block.id)
    pendingFocus.value = target
  } else if (plainText(runs).trim() === '' && props.page.blocks.findIndex((b) => b.id === block.id) > 0) {
    documentStore.removeBlock(block.id)
  }
}

function onListEnter(block: Extract<Block, { type: 'list' }>, itemIndex: number, after: TextRun[]) {
  // Enter on an empty bullet ends the list: the empty bullet is dropped and the writing
  // carries on as a normal paragraph after the list, so pressing enter twice escapes it.
  if (plainText(block.items[itemIndex]).trim() === '' && plainText(after).trim() === '') {
    block.items.splice(itemIndex, 1)
    const id = documentStore.addParagraphAfter(block.id, 'body')
    if (!block.items.length) documentStore.removeBlock(block.id)
    documentStore.touch()
    pendingFocus.value = { key: `text:${id}` }
    return
  }
  block.items.splice(itemIndex + 1, 0, after.length ? after : [{ text: '' }])
  documentStore.touch()
  pendingFocus.value = { key: `list:${block.id}:${itemIndex + 1}` }
}
// Each pasted line becomes the next bullet right after this one, so a copied list adopts our
// own numbering in order instead of arriving as a block on its own.
function onListPasteLines(block: Extract<Block, { type: 'list' }>, itemIndex: number, lines: string[]) {
  block.items.splice(itemIndex + 1, 0, ...lines.map((line) => [{ text: line }]))
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
    documentStore.touch()
    pendingFocus.value = { key: `list:${block.id}:${itemIndex - 1}`, offset: joinAt }
    return
  }
  const target = joinOntoLineAbove(block.id, runs)
  if (target) {
    block.items.splice(0, 1)
    if (!block.items.length) documentStore.removeBlock(block.id)
    else documentStore.touch()
    pendingFocus.value = target
    return
  }
  if (block.items.length === 1 && plainText(runs).trim() === '') documentStore.removeBlock(block.id)
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

// Drag the handle at a diagram's foot to make it taller or shorter, in whole ruled lines.
function startResize(blockId: string, fromRules: number, event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  const startY = event.clientY
  const perRule = lineHeightPx.value
  function onMove(move: PointerEvent) {
    documentStore.setDiagramHeight(blockId, fromRules + (move.clientY - startY) / perRule)
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
        <li v-for="(_, i) in block.items" :key="i">
          <span class="marker">{{ block.ordered ? `${i + 1}.` : '•' }}</span>
          <EditableText
            :ref="bindEditable(`list:${block.id}:${i}`)"
            v-model="block.items[i]"
            class="li-text"
            :class="{ 'line-selected': selectedLineKeys.has(lineKey(block.id, i)) }"
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
.table-slot,
.callouts-slot {
  padding: 6px 0;
}
.caption {
  margin-bottom: 2px;
}
.diagram-slot {
  position: relative;
  width: 100%;
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
