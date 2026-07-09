<script setup lang="ts">
// The paper background, drawn as real SVG lines so every rule is identical at any
// zoom. It is never a CSS gradient, which rendered some lines crisp and others
// faint. Geometry comes from the preset; the height can grow past a single page so
// the paper fills whatever the writing needs while keeping the ruling uniform.
import { computed } from 'vue'
import { getPreset, ptToMm, ruleYsForHeight } from './sheetSpec'

const props = defineProps<{ presetId: string; heightMm?: number }>()

const preset = computed(() => getPreset(props.presetId))
const height = computed(() => props.heightMm ?? preset.value.height)
const rules = computed(() => ruleYsForHeight(preset.value, height.value))
const ruleWeight = computed(() => ptToMm(preset.value.rule.weightPt))
const marginWeight = computed(() => ptToMm(preset.value.margin.weightPt))
const viewBox = computed(() => `0 0 ${preset.value.width} ${height.value}`)
</script>

<template>
  <svg
    class="sheet"
    :viewBox="viewBox"
    preserveAspectRatio="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="0" y="0" :width="preset.width" :height="height" :fill="preset.background" />
    <line
      v-for="(y, i) in rules"
      :key="i"
      x1="0"
      :x2="preset.width"
      :y1="y"
      :y2="y"
      :stroke="preset.rule.color"
      :stroke-width="ruleWeight"
    />
    <line
      :x1="preset.margin.left"
      :x2="preset.margin.left"
      y1="0"
      :y2="height"
      :stroke="preset.margin.color"
      :stroke-width="marginWeight"
    />
  </svg>
</template>

<style scoped>
.sheet {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
