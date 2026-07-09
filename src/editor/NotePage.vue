<script setup lang="ts">
// One page of the note: the ruled sheet at the bottom, the writing and figures over
// it, and the ink canvas on top. The page grows downward as it fills so writing is
// never blocked by a page edge; it never shrinks below a full sheet. Every layer
// shares one pixels-per-millimetre scale, so the ruling, the writing, the figures,
// and the ink all line up exactly.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Page } from '@/types'
import { getPreset, ruleYsForHeight } from '@/paper/sheetSpec'
import { textMetrics } from './alignment'
import { useDocument } from '@/store/document'
import Sheet from '@/paper/Sheet.vue'
import TextLayer from './TextLayer.vue'
import FreeFigureLayer from './FreeFigureLayer.vue'
import FreeTextLayer from './FreeTextLayer.vue'
import InkLayer from './InkLayer.vue'

const props = defineProps<{
  page: Page
  pageIndex: number
  widthPx: number
  mode: 'write' | 'draw'
}>()

const documentStore = useDocument()

// Clicking or tapping a blank part of the page starts writing right there, snapped to
// the nearest ruled line, so a writer can annotate a figure or jot in a margin instead
// of being confined to the flowing column.
function onPageClick(event: MouseEvent) {
  if (props.mode !== 'write') return
  const rect = root.value?.getBoundingClientRect()
  if (!rect) return
  const p = preset.value
  // Remember exactly where the writer pointed, on this page, so the next figure inserted
  // from the toolbar drops right here instead of jumping to the top of page one.
  const rawX = (event.clientX - rect.left) / pxPerMm.value
  const clickYMm = (event.clientY - rect.top) / pxPerMm.value
  documentStore.setLastPoint(props.pageIndex, rawX, clickYMm)

  const target = event.target as HTMLElement
  if (target.closest('.editable, .cell')) return
  const xMm = Math.min(Math.max(rawX, p.text.left), p.text.right - 6)
  const rules = ruleYsForHeight(p, heightMm.value)
  const line = rules.reduce((best, y) => (Math.abs(y - clickYMm) < Math.abs(best - clickYMm) ? y : best), rules[0])
  documentStore.addNote(props.pageIndex, xMm, line)
}

const preset = computed(() => getPreset(props.page.presetId))
const pxPerMm = computed(() => props.widthPx / preset.value.width)
const metrics = computed(() => textMetrics(preset.value))

const root = ref<HTMLElement | null>(null)
const contentBottomPx = ref(0)
let observer: ResizeObserver | null = null

function measure() {
  const layer = root.value?.querySelector('.text-layer') as HTMLElement | null
  if (layer) contentBottomPx.value = layer.offsetTop + layer.scrollHeight
}

// Grow the page to the next whole rule below the writing, never past a full sheet up.
const heightMm = computed(() => {
  const contentMm = contentBottomPx.value / pxPerMm.value + 16
  const p = preset.value
  const grown = p.rule.topGap + Math.ceil(Math.max(0, contentMm - p.rule.topGap) / p.rule.spacing) * p.rule.spacing
  return Math.max(p.height, grown)
})
const heightPx = computed(() => heightMm.value * pxPerMm.value)

onMounted(() => {
  observer = new ResizeObserver(measure)
  const layer = root.value?.querySelector('.text-layer')
  if (layer) observer.observe(layer)
  measure()
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div
    ref="root"
    class="note-page"
    :class="{ writable: mode === 'write' }"
    :style="{ width: `${widthPx}px`, height: `${heightPx}px` }"
    @click="onPageClick"
  >
    <Sheet class="layer" :preset-id="page.presetId" :height-mm="heightMm" />
    <TextLayer
      :page="page"
      :page-index="pageIndex"
      :metrics="metrics"
      :px-per-mm="pxPerMm"
      :editable="mode === 'write'"
    />
    <!-- Figures lifted out of the flow float here, over the page, draggable in write mode. -->
    <FreeFigureLayer
      :page="page"
      :page-index="pageIndex"
      :metrics="metrics"
      :px-per-mm="pxPerMm"
      :mode="mode"
      :page-width-mm="preset.width"
      :page-height-mm="heightMm"
    />
    <!-- Free notes stay on the page in both modes: the ink canvas sits above them, so a
         stroke can cross a jotted note just as it can cross the flowing text. In draw
         mode the canvas takes the pointer, so the notes are shown but not editable. -->
    <FreeTextLayer
      :page="page"
      :page-index="pageIndex"
      :metrics="metrics"
      :px-per-mm="pxPerMm"
      :draw-mode="mode === 'draw'"
    />
    <InkLayer
      class="layer"
      :page="page"
      :page-index="pageIndex"
      :width-mm="preset.width"
      :height-mm="heightMm"
      :px-per-mm="pxPerMm"
      :active="mode === 'draw'"
    />
  </div>
</template>

<style scoped>
.note-page.writable {
  cursor: text;
}
.note-page {
  position: relative;
  flex-shrink: 0;
  background: #fff;
  box-shadow: 0 6px 30px rgba(51, 51, 76, 0.16);
  border-radius: 3px;
  overflow: hidden;
  transition: height 0.12s ease;
}
.layer {
  position: absolute;
  inset: 0;
}
</style>
