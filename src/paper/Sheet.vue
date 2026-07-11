<script setup lang="ts">
// The paper background, drawn as real SVG so every mark is identical at any zoom. It is never
// a CSS gradient, which rendered some lines crisp and others faint. A lined sheet draws its
// horizontal rules and margin; a grid or dotted sheet tiles a pattern across the page; a blank
// sheet is just the paper. Geometry comes from the preset; the height can grow past a single
// page so the paper fills whatever the writing needs while keeping the ruling uniform.
import { computed } from 'vue'
import { getPreset, ptToMm, ruleYsForHeight } from './sheetSpec'
import { uid } from '@/util/id'

const props = defineProps<{ presetId: string; heightMm?: number }>()

const preset = computed(() => getPreset(props.presetId))
const style = computed(() => preset.value.style ?? 'lined')
const height = computed(() => props.heightMm ?? preset.value.height)
const rules = computed(() => (style.value === 'lined' ? ruleYsForHeight(preset.value, height.value) : []))
const ruleWeight = computed(() => ptToMm(preset.value.rule.weightPt))
const marginWeight = computed(() => ptToMm(preset.value.margin.weightPt))
const dotRadius = computed(() => Math.max(0.18, ptToMm(preset.value.rule.weightPt) * 0.7))
const viewBox = computed(() => `0 0 ${preset.value.width} ${height.value}`)
// A pattern id unique to this sheet, so several sheets on one screen never share a fill.
const patternId = `paper-${uid()}`
</script>

<template>
  <svg
    class="sheet"
    :viewBox="viewBox"
    preserveAspectRatio="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs v-if="style === 'grid' || style === 'dots'">
      <pattern :id="patternId" :width="preset.rule.spacing" :height="preset.rule.spacing" patternUnits="userSpaceOnUse">
        <path
          v-if="style === 'grid'"
          :d="`M ${preset.rule.spacing} 0 L 0 0 0 ${preset.rule.spacing}`"
          fill="none"
          :stroke="preset.rule.color"
          :stroke-width="ruleWeight"
        />
        <circle v-else cx="0" cy="0" :r="dotRadius" :fill="preset.rule.color" />
      </pattern>
    </defs>

    <rect x="0" y="0" :width="preset.width" :height="height" :fill="preset.background" />

    <template v-if="style === 'lined'">
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
    </template>

    <rect
      v-else-if="style === 'grid' || style === 'dots'"
      x="0"
      y="0"
      :width="preset.width"
      :height="height"
      :fill="`url(#${patternId})`"
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
