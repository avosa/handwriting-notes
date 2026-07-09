<script setup lang="ts">
// The paper background, drawn as real SVG lines so every rule is identical at any
// zoom. It is never a CSS gradient, which rendered some lines crisp and others
// faint. All geometry comes from the preset; the template holds no magic numbers.
import { computed } from 'vue'
import { getPreset, ptToMm, ruleYs } from './sheetSpec'

const props = defineProps<{ presetId: string }>()

const preset = computed(() => getPreset(props.presetId))
const rules = computed(() => ruleYs(preset.value))
const ruleWeight = computed(() => ptToMm(preset.value.rule.weightPt))
const marginWeight = computed(() => ptToMm(preset.value.margin.weightPt))
const viewBox = computed(() => `0 0 ${preset.value.width} ${preset.value.height}`)
</script>

<template>
  <svg
    class="sheet"
    :viewBox="viewBox"
    preserveAspectRatio="xMidYMid meet"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="0" y="0" :width="preset.width" :height="preset.height" :fill="preset.background" />
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
      :y2="preset.height"
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
