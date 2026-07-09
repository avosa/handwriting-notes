<script setup lang="ts">
// Renders any diagram scene as pen-drawn SVG. It knows nothing about Venn diagrams
// specifically: it draws a list of primitive pen paths and labels produced by the
// shared renderer. That shared renderer also feeds the PDF exporter, so a figure
// looks identical on screen and on the exported page. In write mode every label is
// editable in place, so any letter in the figure can be changed. Whatever figure a
// user or the AI describes becomes a scene, and this draws it.
import { computed, onMounted, ref } from 'vue'
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
  animate?: boolean
}>()
const emit = defineEmits<{ (e: 'edit-label', shapeIndex: number, text: string): void }>()

const drawn = computed(() => renderDiagram(props.spec, props.seed))
// The writer's font-size dial enlarges every letter in the figure together.
function labelSize(size: number): number {
  return size * (props.scale ?? 1)
}
const vb = computed(() => `0 0 ${drawn.value.width} ${drawn.value.height}`)

// When the AI places a figure, the strokes draw themselves on one after another and the
// labels are set down after, so the diagram is seen being drawn rather than appearing whole.
// This plays once, on the fresh figure; a saved note renders it settled.
const PATH_STEP = 0.14
const PATH_DUR = 0.6
const LABEL_STEP = 0.16
const drawing = ref(props.animate === true)
const labelsStart = computed(() => drawn.value.paths.length * PATH_STEP + PATH_DUR * 0.4)
function pathDelay(i: number): string {
  return `${(i * PATH_STEP).toFixed(2)}s`
}
function labelDelay(i: number): string {
  return `${(labelsStart.value + i * LABEL_STEP).toFixed(2)}s`
}
onMounted(() => {
  if (!drawing.value) return
  const totalMs = (labelsStart.value + drawn.value.labels.length * LABEL_STEP + 0.5) * 1000
  setTimeout(() => (drawing.value = false), totalMs)
})
</script>

<template>
  <svg
    class="diagram"
    :class="{ drawing }"
    :viewBox="vb"
    preserveAspectRatio="xMidYMid meet"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      v-for="(p, i) in drawn.paths"
      :key="`p${i}`"
      class="stroke"
      :d="p.d"
      :fill="p.fill"
      :stroke="p.stroke"
      :stroke-width="drawn.strokeWidth"
      stroke-linejoin="round"
      stroke-linecap="round"
      pathLength="1"
      :style="drawing ? { animationDelay: pathDelay(i) } : undefined"
    />
    <template v-if="editable">
      <DiagramLabel
        v-for="(l, i) in drawn.labels"
        :key="`e${i}`"
        class="label"
        :style="drawing ? { animationDelay: labelDelay(i) } : undefined"
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
        class="label"
        :style="drawing ? { animationDelay: labelDelay(i) } : undefined"
        :x="l.x"
        :y="l.y"
        :fill="l.color"
        :font-size="labelSize(l.size)"
        :text-anchor="l.anchor"
        :font-family="fontStack"
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
/* Each stroke stays hidden until its turn, then draws itself from one end to the other; the
   labels settle in afterwards, so the figure reads as being drawn by hand in order. */
.diagram.drawing .stroke {
  opacity: 0;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: draw-stroke 0.6s ease forwards;
}
@keyframes draw-stroke {
  from {
    opacity: 1;
    stroke-dashoffset: 1;
  }
  to {
    opacity: 1;
    stroke-dashoffset: 0;
  }
}
.diagram.drawing .label {
  opacity: 0;
  animation: draw-label 0.4s ease forwards;
}
@keyframes draw-label {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
