<script setup lang="ts">
// One page of the note: the ruled sheet at the bottom, the writing and figures over
// it, and the ink canvas on top. The page grows downward as it fills so writing is
// never blocked by a page edge; it never shrinks below a full sheet. Every layer
// shares one pixels-per-millimetre scale, so the ruling, the writing, the figures,
// and the ink all line up exactly.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Page } from '@/types'
import { getPreset } from '@/paper/sheetSpec'
import { textMetrics } from './alignment'
import Sheet from '@/paper/Sheet.vue'
import TextLayer from './TextLayer.vue'
import InkLayer from './InkLayer.vue'

const props = defineProps<{
  page: Page
  pageIndex: number
  widthPx: number
  mode: 'write' | 'draw'
}>()

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
  <div ref="root" class="note-page" :style="{ width: `${widthPx}px`, height: `${heightPx}px` }">
    <Sheet class="layer" :preset-id="page.presetId" :height-mm="heightMm" />
    <TextLayer
      :page="page"
      :page-index="pageIndex"
      :metrics="metrics"
      :px-per-mm="pxPerMm"
      :editable="mode === 'write'"
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
