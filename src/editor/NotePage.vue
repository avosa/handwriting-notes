<script setup lang="ts">
// One page of the note: the ruled sheet at the bottom, the writing and diagrams over
// it aligned to the rules, and the ink canvas on top. The page holds a fixed A4
// aspect and derives one pixels-per-millimetre scale that every layer shares, so the
// sheet, the writing, the drawings, and the ink all line up exactly.
import { computed } from 'vue'
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
const heightPx = computed(() => preset.value.height * pxPerMm.value)
const metrics = computed(() => textMetrics(preset.value))

const pageStyle = computed(() => ({
  width: `${props.widthPx}px`,
  height: `${heightPx.value}px`,
}))
</script>

<template>
  <div class="note-page" :style="pageStyle">
    <Sheet class="layer" :preset-id="page.presetId" />
    <TextLayer :page="page" :metrics="metrics" :px-per-mm="pxPerMm" :editable="mode === 'write'" />
    <InkLayer
      class="layer"
      :page="page"
      :page-index="pageIndex"
      :width-mm="preset.width"
      :height-mm="preset.height"
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
  box-shadow: 0 4px 20px rgba(51, 51, 76, 0.16);
  border-radius: 2px;
  overflow: hidden;
}
.layer {
  position: absolute;
  inset: 0;
}
</style>
