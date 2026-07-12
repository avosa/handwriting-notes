<script setup lang="ts">
// The freehand drawing surface for one page. Pointer events capture strokes with
// pressure when the device reports it; strokes are stored per page in millimetres so
// they scale with the paper and export identically. The eraser rubs out only what it
// passes over, splitting a stroke into the parts left behind, and its size follows the
// width slider. The fill tool floods the closed shape a stroke outlines, so a circle or
// any figure drawn by hand can be coloured in with a tap.
import { onMounted, ref, watch } from 'vue'
import type { Page, Stroke, StrokePoint } from '@/types'
import { penProfile } from '@/tools/penTypes'
import { strokeWidths, grain } from '@/tools/inkPhysics'
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
// While the eraser is down, work on a copy of the strokes so rubbing shows live, then
// commit the result once. The ring shows where and how big the eraser is.
let working: Stroke[] | null = null
let lastErase: StrokePoint | null = null
const eraserRing = ref<{ x: number; y: number; r: number } | null>(null)

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

function tracePath(context: CanvasRenderingContext2D, stroke: Stroke) {
  const pts = stroke.points
  context.beginPath()
  context.moveTo(pts[0].x * props.pxPerMm, pts[0].y * props.pxPerMm)
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    const prev = pts[i - 1]
    context.quadraticCurveTo(
      prev.x * props.pxPerMm,
      prev.y * props.pxPerMm,
      ((prev.x + p.x) / 2) * props.pxPerMm,
      ((prev.y + p.y) / 2) * props.pxPerMm,
    )
  }
}

function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke) {
  const profile = penProfile(stroke.tool)
  const pts = stroke.points
  if (pts.length === 0) return
  context.save()
  if (stroke.fill) {
    context.globalAlpha = 0.45
    context.fillStyle = stroke.fill
    tracePath(context, stroke)
    context.closePath()
    context.fill()
    context.globalAlpha = 1
  }
  context.globalCompositeOperation = stroke.tool === 'highlighter' ? 'multiply' : 'source-over'
  context.strokeStyle = stroke.color
  context.lineCap = 'round'
  context.lineJoin = 'round'

  const widths = strokeWidths(stroke)

  // Bleed: a faint, wider under-pass so a pen's ink looks soaked a little into the paper rather than
  // sitting on a hard edge. Only for the ink instruments; pencil and highlighter have no wet edge.
  if (stroke.tool === 'fine' || stroke.tool === 'marker') {
    const avg = widths.reduce((sum, w) => sum + w, 0) / widths.length
    context.globalAlpha = profile.opacity * 0.12
    context.lineWidth = avg * 1.8 * props.pxPerMm
    tracePath(context, stroke)
    context.stroke()
  }

  // Pencil catches on the paper's tooth, so its darkness is mottled by the grain; other tools lay
  // an even line.
  const grainy = stroke.tool === 'pencil'
  context.beginPath()
  context.moveTo(pts[0].x * props.pxPerMm, pts[0].y * props.pxPerMm)
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    const prev = pts[i - 1]
    const midX = ((prev.x + p.x) / 2) * props.pxPerMm
    const midY = ((prev.y + p.y) / 2) * props.pxPerMm
    context.lineWidth = Math.max(0.12, widths[i]) * props.pxPerMm
    context.globalAlpha = grainy ? profile.opacity * (0.72 + 0.28 * grain(p.x, p.y)) : profile.opacity
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
  for (const stroke of working ?? props.page.strokes) drawStroke(context, stroke)
  if (current) drawStroke(context, current)
  const ring = eraserRing.value
  if (ring) {
    context.save()
    context.beginPath()
    context.arc(ring.x * props.pxPerMm, ring.y * props.pxPerMm, ring.r * props.pxPerMm, 0, Math.PI * 2)
    context.strokeStyle = 'rgba(51,51,76,0.55)'
    context.lineWidth = 1
    context.stroke()
    context.restore()
  }
}

function pointFrom(event: PointerEvent): StrokePoint {
  const rect = canvas.value!.getBoundingClientRect()
  const pressure = event.pressure && event.pressure > 0 ? event.pressure : 0.5
  return {
    x: (event.clientX - rect.left) / props.pxPerMm,
    y: (event.clientY - rect.top) / props.pxPerMm,
    pressure: 0.4 + pressure * 0.9,
  }
}

// Split a stroke where the eraser touches it, keeping the runs of points left behind.
// A stroke the eraser never reaches is returned unchanged.
function eraseStroke(stroke: Stroke, ex: number, ey: number, r: number): Stroke[] {
  if (!stroke.points.some((p) => Math.hypot(p.x - ex, p.y - ey) <= r)) return [stroke]
  const runs: StrokePoint[][] = []
  let run: StrokePoint[] = []
  for (const p of stroke.points) {
    if (Math.hypot(p.x - ex, p.y - ey) <= r) {
      if (run.length) runs.push(run)
      run = []
    } else {
      run.push(p)
    }
  }
  if (run.length) runs.push(run)
  return runs.filter((rn) => rn.length >= 2).map((rn) => ({ ...stroke, id: uid('s'), points: rn, fill: undefined }))
}

function eraseAt(point: StrokePoint) {
  const radius = settings.activeWidth
  if (!working) working = props.page.strokes.map((s) => ({ ...s, points: [...s.points] }))
  // Rub along the path since the last point so a quick swipe erases continuously.
  const from = lastErase ?? point
  const dist = Math.hypot(point.x - from.x, point.y - from.y)
  const steps = Math.max(1, Math.ceil(dist / (radius * 0.6)))
  for (let i = 1; i <= steps; i++) {
    const ex = from.x + ((point.x - from.x) * i) / steps
    const ey = from.y + ((point.y - from.y) * i) / steps
    working = working.flatMap((s) => eraseStroke(s, ex, ey, radius))
  }
  lastErase = point
  eraserRing.value = { x: point.x, y: point.y, r: radius }
  redraw()
}

// Which drawn shape surrounds a point, tested by ray casting over its outline.
function strokeContaining(point: StrokePoint): Stroke | null {
  for (let s = props.page.strokes.length - 1; s >= 0; s--) {
    const stroke = props.page.strokes[s]
    const pts = stroke.points
    if (pts.length < 3) continue
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x
      const yi = pts[i].y
      const xj = pts[j].x
      const yj = pts[j].y
      if (yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) inside = !inside
    }
    if (inside) return stroke
  }
  return null
}

function onDown(event: PointerEvent) {
  if (!props.active) return
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
  const point = pointFrom(event)

  if (settings.activeTool === 'fill') {
    const target = strokeContaining(point)
    if (target) documentStore.fillStroke(props.pageIndex, target.id, settings.activeColor)
    return
  }
  drawing = true
  if (settings.activeTool === 'eraser') {
    working = props.page.strokes.map((s) => ({ ...s, points: [...s.points] }))
    lastErase = null
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
    if (working) documentStore.replaceStrokes(props.pageIndex, working)
    working = null
    lastErase = null
    eraserRing.value = null
    redraw()
    return
  }
  if (current && current.points.length > 1) documentStore.addStroke(props.pageIndex, current)
  current = null
  redraw()
}

onMounted(resize)
watch(() => [props.widthMm, props.heightMm, props.pxPerMm], resize)
watch(() => props.page.strokes, redraw, { deep: true })
watch(
  () => props.page.id,
  () => {
    working = null
    lastErase = null
    eraserRing.value = null
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
