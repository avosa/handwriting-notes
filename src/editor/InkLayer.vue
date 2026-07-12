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
import { recognizeShape, shapeToStroke, type Shape } from '@/tools/shapeRecognition'
import Icon from '@/ui/Icon.vue'
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
// Palm rejection: once a stylus is in use, touches are the hand resting on the glass, not drawing.
// A pen currently down blocks touch outright; a short window after the last pen contact blocks the
// palm that lands just before or after a pen stroke.
let penDown = false
let lastPenAt = 0
const PALM_WINDOW_MS = 1400
// While the eraser is down, work on a copy of the strokes so rubbing shows live, then
// commit the result once. The ring shows where and how big the eraser is.
let working: Stroke[] | null = null
let lastErase: StrokePoint | null = null
const eraserRing = ref<{ x: number; y: number; r: number } | null>(null)

// After a rough figure is drawn, an offer to tidy it into a clean shape hovers by the stroke until
// it is taken or the writer moves on. The tidy version is still hand drawn, never a perfect shape.
const suggestion = ref<{ id: string; shape: Shape; left: number; top: number } | null>(null)
const INK_TOOLS = new Set(['pencil', 'fine', 'marker'])

// A stable numeric seed from a stroke id, so a tidied shape wobbles the same way every render.
function seedFrom(id: string): number {
  let n = 0
  for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) % 100000
  return n + 1
}

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
  const point: StrokePoint = {
    x: (event.clientX - rect.left) / props.pxPerMm,
    y: (event.clientY - rect.top) / props.pxPerMm,
    pressure: 0.4 + pressure * 0.9,
  }
  // Tilt, where a stylus reports it: the angle from upright, normalised so flat reads as 1. Rounded
  // to keep the stored stroke compact.
  if (event.pointerType === 'pen' && (event.tiltX || event.tiltY)) {
    const tilt = Math.min(1, Math.hypot(event.tiltX, event.tiltY) / 90)
    if (tilt > 0.02) point.tilt = Math.round(tilt * 100) / 100
  }
  return point
}

// Whether this pointer should be ignored as a resting palm rather than a drawing touch.
function isPalm(event: PointerEvent): boolean {
  return event.pointerType === 'touch' && (penDown || performance.now() - lastPenAt < PALM_WINDOW_MS)
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
  if (event.pointerType === 'pen') {
    penDown = true
    lastPenAt = performance.now()
  } else if (isPalm(event)) {
    // A palm resting on the glass while writing: ignore it so it never lays a stray mark.
    return
  }
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
  // Starting a new stroke drops any pending tidy offer from the last one.
  suggestion.value = null
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
  if (event.pointerType === 'pen') lastPenAt = performance.now()
  if (!drawing) return
  if (settings.activeTool === 'eraser') {
    eraseAt(pointFrom(event))
    return
  }
  // A stylus reports far more points than the screen refreshes; the coalesced events hold every one
  // between frames, so the line follows fast handwriting smoothly instead of cutting corners.
  const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []
  const batch = events.length ? events : [event]
  for (const e of batch) current?.points.push(pointFrom(e))
  redraw()
}

function onUp(event: PointerEvent) {
  if (event?.pointerType === 'pen') {
    penDown = false
    lastPenAt = performance.now()
  }
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
  if (current && current.points.length > 1) {
    documentStore.addStroke(props.pageIndex, current)
    offerTidy(current)
  }
  current = null
  redraw()
}

// If a just-drawn inked stroke looks like a figure, offer to tidy it. The offer hovers by the
// stroke's top-right; the highlighter, fill, and eraser never trigger it.
function offerTidy(stroke: Stroke) {
  if (!INK_TOOLS.has(stroke.tool)) return
  const shape = recognizeShape(stroke.points)
  if (!shape) return
  let maxX = -Infinity
  let minY = Infinity
  for (const p of stroke.points) {
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
  }
  suggestion.value = { id: stroke.id, shape, left: maxX * props.pxPerMm, top: minY * props.pxPerMm }
}

// Replace the rough stroke with a clean, still hand-drawn version of the shape it outlined.
function acceptTidy() {
  const s = suggestion.value
  if (!s) return
  const original = props.page.strokes.find((k) => k.id === s.id)
  if (original) {
    const cleaned: Stroke = { ...original, points: shapeToStroke(s.shape, seedFrom(s.id)), fill: undefined }
    documentStore.replaceStrokes(
      props.pageIndex,
      props.page.strokes.map((k) => (k.id === s.id ? cleaned : k)),
    )
  }
  suggestion.value = null
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
    suggestion.value = null
    redraw()
  },
)

const tidyLabel = { line: 'straight line', circle: 'circle', rect: 'rectangle', triangle: 'triangle' }
</script>

<template>
  <div class="ink-wrap">
    <canvas
      ref="canvas"
      class="ink"
      :class="{ active }"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    />
    <Transition name="tidy-pop">
      <div v-if="suggestion" class="tidy" :style="{ left: `${suggestion.left}px`, top: `${suggestion.top}px` }">
        <button class="tidy-do" @click="acceptTidy">Tidy {{ tidyLabel[suggestion.shape.kind] }}</button>
        <button class="tidy-x" title="Keep as is" @click="suggestion = null"><Icon name="close" :size="13" /></button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ink-wrap {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
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
.tidy {
  position: absolute;
  transform: translate(6px, -50%);
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--pop-shadow, 0 8px 22px rgba(0, 0, 0, 0.22));
  pointer-events: auto;
  white-space: nowrap;
}
.tidy-do {
  border: none;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  padding: 5px 9px;
  border-radius: 8px;
  cursor: pointer;
}
.tidy-do:hover {
  background: var(--accent-wash);
}
.tidy-x {
  display: inline-flex;
  border: none;
  background: transparent;
  color: var(--text-muted);
  padding: 5px;
  border-radius: 7px;
  cursor: pointer;
}
.tidy-x:hover {
  background: var(--surface-sunken);
  color: var(--text);
}
.tidy-pop-enter-active,
.tidy-pop-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.tidy-pop-enter-from,
.tidy-pop-leave-to {
  opacity: 0;
  transform: translate(6px, -50%) scale(0.9);
}
</style>
