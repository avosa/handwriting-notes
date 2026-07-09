<script setup lang="ts">
// The writing column: everything that flows down a page. Each block renders by type
// and edits in place. Paragraphs, lists, tables, callouts, and diagrams all sit on
// the same rule grid. Roles carry the sample look by default (blue title, red
// heading, navy body), and any of it can be recoloured or re-emphasised freely.
import { computed, nextTick, ref, watch, type CSSProperties } from 'vue'
import type { Block, Page, TextRole, TextRun } from '@/types'
import type { TextMetrics } from './alignment'
import { getHandwriting, bodyFontStack, headerFontStack } from '@/handwriting/registry'
import { useDocument } from '@/store/document'
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
const pendingFocus = ref<string | null>(null)
watch(pendingFocus, async (key) => {
  if (!key) return
  await nextTick()
  editables.value.get(key)?.focus()
  pendingFocus.value = null
})

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

function onFocusBlock(blockId: string) {
  documentStore.select(blockId)
}

function onParagraphEnter(block: Extract<Block, { type: 'text' }>) {
  const nextRole = block.text.role === 'body' || block.text.role === 'caption' ? block.text.role : 'body'
  const id = documentStore.addParagraphAfter(block.id, nextRole)
  pendingFocus.value = `text:${id}`
}
function onParagraphBackspace(block: Extract<Block, { type: 'text' }>) {
  const page = props.page
  const index = page.blocks.findIndex((b) => b.id === block.id)
  if (page.blocks.length === 1 && props.pageIndex === 0) return
  const prev = page.blocks[index - 1]
  documentStore.removeBlock(block.id)
  if (prev && prev.type === 'text') pendingFocus.value = `text:${prev.id}`
}

function onListEnter(block: Extract<Block, { type: 'list' }>, itemIndex: number) {
  block.items.splice(itemIndex + 1, 0, [{ text: '' }])
  documentStore.touch()
  pendingFocus.value = `list:${block.id}:${itemIndex + 1}`
}
function onListBackspace(block: Extract<Block, { type: 'list' }>, itemIndex: number) {
  if (block.items.length === 1) {
    documentStore.removeBlock(block.id)
    return
  }
  block.items.splice(itemIndex, 1)
  documentStore.touch()
  pendingFocus.value = `list:${block.id}:${Math.max(0, itemIndex - 1)}`
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
        :style="paragraphStyle(block)"
        :placeholder="placeholderFor(block, page.blocks.indexOf(block))"
        @update:model-value="updateRuns(block.id, $event)"
        @focus="onFocusBlock(block.id)"
        @enter="onParagraphEnter(block)"
        @empty-backspace="onParagraphBackspace(block)"
        @select-all-note="documentStore.selectWholeNote()"
      />

      <ol v-else-if="block.type === 'list'" class="list" :class="{ bullets: !block.ordered }" :style="listStyle(block)">
        <li v-for="(_, i) in block.items" :key="i">
          <span class="marker">{{ block.ordered ? `${i + 1}.` : '•' }}</span>
          <EditableText
            :ref="bindEditable(`list:${block.id}:${i}`)"
            v-model="block.items[i]"
            class="li-text"
            placeholder="List item"
            @focus="onFocusBlock(block.id)"
            @enter="onListEnter(block, i)"
            @empty-backspace="onListBackspace(block, i)"
            @select-all-note="documentStore.selectWholeNote()"
          />
        </li>
      </ol>

      <div v-else-if="block.type === 'table'" class="table-slot">
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

      <div v-else-if="block.type === 'callouts'" class="callouts-slot">
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
