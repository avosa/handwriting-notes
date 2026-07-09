<script setup lang="ts">
// Renders any diagram scene as pen-drawn SVG. It knows nothing about Venn diagrams
// specifically: it draws a list of primitive pen paths and labels produced by the
// shared renderer. That shared renderer also feeds the PDF exporter, so a figure
// looks identical on screen and on the exported page. In write mode every label is
// editable in place, so any letter in the figure can be changed. Whatever figure a
// user or the AI describes becomes a scene, and this draws it.
import { computed } from 'vue'
import type { DiagramSpec } from '@/types'
import { renderDiagram } from './render'
import DiagramLabel from './DiagramLabel.vue'

const props = defineProps<{
  spec: DiagramSpec
  widthMm: number
  heightMm: number
  fontStack: string
  seed?: number
  editable?: boolean
  scale?: number
}>()
const emit = defineEmits<{ (e: 'edit-label', shapeIndex: number, text: string): void }>()

const drawn = computed(() => renderDiagram(props.spec, props.seed))
// The writer's font-size dial enlarges every letter in the figure together.
function labelSize(size: number): number {
  return size * (props.scale ?? 1)
}
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
    <template v-if="editable">
      <DiagramLabel
        v-for="(l, i) in drawn.labels"
        :key="`e${i}`"
        :x="l.x"
        :y="l.y"
        :text="l.text"
        :color="l.color"
        :size="labelSize(l.size)"
        :anchor="l.anchor"
        :font-stack="fontStack"
        @edit="(text) => emit('edit-label', l.shapeIndex, text)"
      />
    </template>
    <template v-else>
      <text
        v-for="(l, i) in drawn.labels"
        :key="`l${i}`"
        :x="l.x"
        :y="l.y"
        :fill="l.color"
        :font-size="labelSize(l.size)"
        :text-anchor="l.anchor"
        :style="{ fontFamily: fontStack }"
      >
        {{ l.text }}
      </text>
    </template>
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
