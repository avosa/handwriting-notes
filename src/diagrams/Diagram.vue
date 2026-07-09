<script setup lang="ts">
// Renders any diagram scene as pen-drawn SVG. It knows nothing about Venn diagrams
// specifically: it walks a list of primitive shapes and draws each with the wobble
// engine. That is what makes the engine dynamic. Whatever figure a user or the AI
// describes becomes a scene, and this component draws it.
import { computed } from 'vue'
import type { DiagramScene, DiagramSpec, Point } from '@/types'
import { toScene } from './diagramSpec'
import { circle, rect, tri, arrow, line, hashSeed } from './wobble'

const props = defineProps<{
  spec: DiagramSpec
  widthMm: number
  heightMm: number
  fontStack: string
}>()

const scene = computed<DiagramScene>(() => toScene(props.spec))
const vb = computed(() => `0 0 ${scene.value.canvas.width} ${scene.value.canvas.height}`)
const seedBase = computed(() => hashSeed(JSON.stringify(props.spec)))
// Stroke weight is set in scene units so it stays even at any on-page size.
const stroke = computed(() => Math.max(scene.value.canvas.width, scene.value.canvas.height) * 0.004)

interface Drawn {
  d: string
  stroke: string
  fill: string
}
interface Written {
  x: number
  y: number
  text: string
  color: string
  size: number
  anchor: 'start' | 'middle' | 'end'
}

const paths = computed<Drawn[]>(() => {
  const out: Drawn[] = []
  scene.value.shapes.forEach((shape, i) => {
    const seed = seedBase.value + i * 131
    switch (shape.type) {
      case 'ellipse':
        out.push({ d: circle(shape.cx, shape.cy, shape.rx, shape.ry, seed), stroke: shape.color, fill: shape.fill ?? 'none' })
        break
      case 'rect':
        out.push({ d: rect(shape.x, shape.y, shape.w, shape.h, seed), stroke: shape.color, fill: shape.fill ?? 'none' })
        break
      case 'triangle': {
        const p = shape.points.map((pt: Point): [number, number] => [pt.x, pt.y])
        out.push({ d: tri(p[0], p[1], p[2], seed), stroke: shape.color, fill: shape.fill ?? 'none' })
        break
      }
      case 'arrow':
        out.push({ d: arrow(shape.from.x, shape.from.y, shape.to.x, shape.to.y, seed), stroke: shape.color, fill: 'none' })
        break
      case 'line':
        out.push({ d: line(shape.from.x, shape.from.y, shape.to.x, shape.to.y, seed), stroke: shape.color, fill: 'none' })
        break
      case 'label':
        break
    }
  })
  return out
})

const labels = computed<Written[]>(() =>
  scene.value.shapes
    .filter((s): s is Extract<DiagramScene['shapes'][number], { type: 'label' }> => s.type === 'label')
    .map((l) => ({
      x: l.at.x,
      y: l.at.y,
      text: l.text,
      color: l.color,
      size: l.size ?? 4,
      anchor: l.anchor ?? 'middle',
    })),
)
</script>

<template>
  <svg class="diagram" :viewBox="vb" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <path
      v-for="(p, i) in paths"
      :key="`p${i}`"
      :d="p.d"
      :fill="p.fill"
      :stroke="p.stroke"
      :stroke-width="stroke"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <text
      v-for="(l, i) in labels"
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
