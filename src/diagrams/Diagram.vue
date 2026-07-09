<script setup lang="ts">
// Renders any diagram scene as pen-drawn SVG. It knows nothing about Venn diagrams
// specifically: it draws a list of primitive pen paths and labels produced by the
// shared renderer. That shared renderer also feeds the PDF exporter, so a figure
// looks identical on screen and on the exported page. Whatever figure a user or the
// AI describes becomes a scene, and this draws it.
import { computed } from 'vue'
import type { DiagramSpec } from '@/types'
import { renderDiagram } from './render'

const props = defineProps<{
  spec: DiagramSpec
  widthMm: number
  heightMm: number
  fontStack: string
}>()

const drawn = computed(() => renderDiagram(props.spec))
const vb = computed(() => `0 0 ${drawn.value.width} ${drawn.value.height}`)
</script>

<template>
  <svg class="diagram" :viewBox="vb" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <path
      v-for="(p, i) in drawn.paths"
      :key="`p${i}`"
      :d="p.d"
      :fill="p.fill"
      :stroke="p.stroke"
      :stroke-width="drawn.strokeWidth"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <text
      v-for="(l, i) in drawn.labels"
      :key="`l${i}`"
      :x="l.x"
      :y="l.y"
      :fill="l.color"
      :font-size="l.size"
      :text-anchor="l.anchor"
      :style="{ fontFamily: fontStack }"
    >
      {{ l.text }}
    </text>
  </svg>
</template>

<style scoped>
.diagram {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
</style>
