<script setup lang="ts">
// The freehand drawing surface for one page. Pointer events capture strokes with
// pressure when the device reports it; strokes are stored per page in millimetres so
// they scale with the paper and export identically. The eraser removes whole strokes
// it passes over. Existing strokes are redrawn whenever the page or size changes.
import { onMounted, ref, watch } from 'vue'
import type { Page, Stroke, StrokePoint } from '@/types'
import { penProfile } from '@/tools/penTypes'
import { useDocument } from '@/store/document'
import { useSettings } from '@/store/settings'
import { uid } from '@/util/id'

const props = defineProps<{
  page: Page
  pageIndex: number
  widthMm: number
  heightMm: number
  pxPerMm: number
  active: boolean
}>()

const documentStore = useDocument()
const settings = useSettings()
const canvas = ref<HTMLCanvasElement | null>(null)

let drawing = false
let current: Stroke | null = null
const erased = new Set<string>()

function ctx(): CanvasRenderingContext2D | null {
  return canvas.value?.getContext('2d') ?? null
}

function resize() {
  const el = canvas.value
  if (!el) return
  el.width = Math.round(props.widthMm * props.pxPerMm)
  el.height = Math.round(props.heightMm * props.pxPerMm)
  redraw()
}

function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke) {
  const profile = penProfile(stroke.tool)
  const pts = stroke.points
  if (pts.length === 0) return
  context.save()
  context.globalCompositeOperation = stroke.tool === 'highlighter' ? 'multiply' : 'source-over'
  context.globalAlpha = profile.opacity
  context.strokeStyle = stroke.color
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  context.moveTo(pts[0].x * props.pxPerMm, pts[0].y * props.pxPerMm)
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    const prev = pts[i - 1]
    const midX = ((prev.x + p.x) / 2) * props.pxPerMm
    const midY = ((prev.y + p.y) / 2) * props.pxPerMm
    context.lineWidth = stroke.width * p.pressure * props.pxPerMm
    context.quadraticCurveTo(prev.x * props.pxPerMm, prev.y * props.pxPerMm, midX, midY)
    context.stroke()
    context.beginPath()
    context.moveTo(midX, midY)
  }
  context.restore()
}

function redraw() {
  const context = ctx()
  const el = canvas.value
  if (!context || !el) return
  context.clearRect(0, 0, el.width, el.height)
  for (const stroke of props.page.strokes) {
    if (!erased.has(stroke.id)) drawStroke(context, stroke)
  }
  if (current) drawStroke(context, current)
}

function pointFrom(event: PointerEvent): StrokePoint {
  const el = canvas.value!
  const rect = el.getBoundingClientRect()
  const x = (event.clientX - rect.left) / props.pxPerMm
  const y = (event.clientY - rect.top) / props.pxPerMm
  const pressure = event.pressure && event.pressure > 0 ? event.pressure : 0.5
  return { x, y, pressure: 0.4 + pressure * 0.9 }
}

function eraseAt(point: StrokePoint) {
  const radius = settings.activeWidth
  for (const stroke of props.page.strokes) {
    if (erased.has(stroke.id)) continue
    if (stroke.points.some((p) => Math.hypot(p.x - point.x, p.y - point.y) <= radius)) {
      erased.add(stroke.id)
    }
  }
  redraw()
}

function onDown(event: PointerEvent) {
  if (!props.active) return
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
  drawing = true
  const point = pointFrom(event)
  if (settings.activeTool === 'eraser') {
    erased.clear()
    eraseAt(point)
    return
  }
  current = {
    id: uid('s'),
    tool: settings.activeTool,
    color: settings.activeColor,
    width: settings.activeWidth,
    points: [point],
  }
  redraw()
}

function onMove(event: PointerEvent) {
  if (!drawing) return
  const point = pointFrom(event)
  if (settings.activeTool === 'eraser') {
    eraseAt(point)
    return
  }
  current?.points.push(point)
  redraw()
}

function onUp() {
  if (!drawing) return
  drawing = false
  if (settings.activeTool === 'eraser') {
    if (erased.size > 0) {
      documentStore.eraseStrokes(props.pageIndex, new Set(erased))
      erased.clear()
    }
    return
  }
  if (current && current.points.length > 1) {
    documentStore.addStroke(props.pageIndex, current)
  }
  current = null
  redraw()
}

onMounted(resize)
watch(() => [props.widthMm, props.heightMm, props.pxPerMm], resize)
watch(() => props.page.strokes.length, redraw)
watch(
  () => props.page.id,
  () => {
    erased.clear()
    redraw()
  },
)
</script>

<template>
  <canvas
    ref="canvas"
    class="ink"
    :class="{ active }"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  />
</template>

<style scoped>
.ink {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
  pointer-events: none;
}
.ink.active {
  pointer-events: auto;
  cursor: crosshair;
}
</style>
