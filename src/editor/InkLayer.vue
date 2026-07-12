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
import {
  strokesInLasso,
  strokesBounds,
  translateStroke,
  scaleStroke,
  copyToClipboard,
  clipboardStrokes,
  hasClipboard,
  type Bounds,
} from '@/tools/lasso'
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

// Lasso selection: the ids of the picked strokes, the box around them, and the interaction in
// progress. While moving or resizing, a preview holds the whole page with the picked strokes
// transformed, so the change is seen live before it is committed.
const selectedIds = ref<Set<string>>(new Set())
const selBounds = ref<Bounds | null>(null)
const clipboardReady = ref(hasClipboard())
let lassoPts: StrokePoint[] = []
let lassoMode: 'idle' | 'lasso' | 'move' | 'resize' = 'idle'
let dragStart: StrokePoint | null = null
let origSelected: Stroke[] = []
let resizeCorner = 0
let preview: Stroke[] | null = null
// How close, in millimetres, a press must be to a corner to grab its resize handle.
const HANDLE_MM = 4

function selectedStrokes(): Stroke[] {
  return props.page.strokes.filter((s) => selectedIds.value.has(s.id))
}

function clearSelection() {
  selectedIds.value = new Set()
  selBounds.value = null
  preview = null
}

// The corner of the selection box a press is grabbing, or null when it is not on a handle.
function handleAt(point: StrokePoint): number | null {
  const b = selBounds.value
  if (!b) return null
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ]
  for (let i = 0; i < corners.length; i++) {
    if (Math.hypot(point.x - corners[i].x, point.y - corners[i].y) <= HANDLE_MM) return i
  }
  return null
}

function insideSelection(point: StrokePoint): boolean {
  const b = selBounds.value
  return !!b && point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h
}

// Replace the page's strokes with the current preview (the committed transform) and refresh the box.
function commitPreview() {
  if (preview) documentStore.replaceStrokes(props.pageIndex, preview)
  preview = null
  selBounds.value = strokesBounds(selectedStrokes())
}

function deleteSelection() {
  if (!selectedIds.value.size) return
  documentStore.replaceStrokes(
    props.pageIndex,
    props.page.strokes.filter((s) => !selectedIds.value.has(s.id)),
  )
  clearSelection()
  redraw()
}

function recolorSelection() {
  if (!selectedIds.value.size) return
  documentStore.replaceStrokes(
    props.pageIndex,
    props.page.strokes.map((s) => (selectedIds.value.has(s.id) ? { ...s, color: settings.activeColor } : s)),
  )
  redraw()
}

function duplicateSelection() {
  const picked = selectedStrokes()
  if (!picked.length) return
  const copies = picked.map((s) => ({ ...translateStroke(s, 4, 4), id: uid('s') }))
  documentStore.replaceStrokes(props.pageIndex, [...props.page.strokes, ...copies])
  selectedIds.value = new Set(copies.map((s) => s.id))
  selBounds.value = strokesBounds(copies)
  redraw()
}

function copySelection() {
  const picked = selectedStrokes()
  if (!picked.length) return
  copyToClipboard(picked)
  clipboardReady.value = true
}

function cutSelection() {
  copySelection()
  deleteSelection()
}

function pasteClipboard() {
  const copies = clipboardStrokes().map((s) => ({ ...translateStroke(s, 6, 6), id: uid('s') }))
  if (!copies.length) return
  documentStore.replaceStrokes(props.pageIndex, [...props.page.strokes, ...copies])
  selectedIds.value = new Set(copies.map((s) => s.id))
  selBounds.value = strokesBounds(copies)
  redraw()
}

// The selection box as it stood when a drag began, so a resize scales against a fixed frame.
let origBounds: Bounds | null = null

// Build the live preview by transforming the picked strokes with fn, leaving the rest untouched, and
// keep the box tracking them so the handles follow.
function applyPreview(fn: (s: Stroke) => Stroke) {
  const map = new Map(origSelected.map((s) => [s.id, s]))
  preview = props.page.strokes.map((s) => (map.has(s.id) ? fn(map.get(s.id)!) : s))
  selBounds.value = strokesBounds(preview.filter((s) => selectedIds.value.has(s.id)))
}

// Scale the selection about the corner opposite the one being dragged, so that fixed corner stays
// put while the grabbed corner follows the pointer.
function applyResize(point: StrokePoint) {
  const b = origBounds
  if (!b) return
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ]
  const anchor = corners[(resizeCorner + 2) % 4]
  const grabbed = corners[resizeCorner]
  const origW = grabbed.x - anchor.x
  const origH = grabbed.y - anchor.y
  const keep = (v: number) => (Math.abs(v) < 0.05 ? (v < 0 ? -0.05 : 0.05) : v)
  const sx = origW !== 0 ? keep((point.x - anchor.x) / origW) : 1
  const sy = origH !== 0 ? keep((point.y - anchor.y) / origH) : 1
  applyPreview((s) => scaleStroke(s, anchor, sx, sy))
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
  for (const stroke of working ?? preview ?? props.page.strokes) drawStroke(context, stroke)
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
  drawLasso(context)
}

// The lasso loop as it is drawn, and the box with corner handles around the current selection.
function drawLasso(context: CanvasRenderingContext2D) {
  const k = props.pxPerMm
  if (lassoMode === 'lasso' && lassoPts.length > 1) {
    context.save()
    context.setLineDash([4, 4])
    context.strokeStyle = 'rgba(74,114,176,0.9)'
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(lassoPts[0].x * k, lassoPts[0].y * k)
    for (const p of lassoPts) context.lineTo(p.x * k, p.y * k)
    context.stroke()
    context.restore()
  }
  const b = selBounds.value
  if (b && selectedIds.value.size) {
    context.save()
    context.setLineDash([5, 4])
    context.strokeStyle = 'rgba(74,114,176,0.95)'
    context.lineWidth = 1
    context.strokeRect(b.x * k, b.y * k, b.w * k, b.h * k)
    context.setLineDash([])
    context.fillStyle = '#fff'
    for (const [cx, cy] of [
      [b.x, b.y],
      [b.x + b.w, b.y],
      [b.x + b.w, b.y + b.h],
      [b.x, b.y + b.h],
    ]) {
      context.beginPath()
      context.rect(cx * k - 4, cy * k - 4, 8, 8)
      context.fill()
      context.stroke()
    }
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

  if (settings.activeTool === 'lasso') {
    drawing = true
    const corner = handleAt(point)
    if (corner !== null && selectedIds.value.size) {
      lassoMode = 'resize'
      resizeCorner = corner
      dragStart = point
      origBounds = selBounds.value
      origSelected = selectedStrokes().map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }))
    } else if (insideSelection(point) && selectedIds.value.size) {
      lassoMode = 'move'
      dragStart = point
      origBounds = selBounds.value
      origSelected = selectedStrokes().map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }))
    } else {
      lassoMode = 'lasso'
      clearSelection()
      lassoPts = [point]
    }
    redraw()
    return
  }

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
  if (settings.activeTool === 'lasso') {
    const point = pointFrom(event)
    if (lassoMode === 'lasso') {
      lassoPts.push(point)
    } else if (lassoMode === 'move' && dragStart) {
      const dx = point.x - dragStart.x
      const dy = point.y - dragStart.y
      applyPreview((s) => translateStroke(s, dx, dy))
    } else if (lassoMode === 'resize' && dragStart && selBounds.value) {
      applyResize(point)
    }
    redraw()
    return
  }
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
  if (settings.activeTool === 'lasso') {
    if (lassoMode === 'lasso') {
      const loop = lassoPts.map((p) => ({ x: p.x, y: p.y }))
      selectedIds.value = new Set(strokesInLasso(props.page.strokes, loop))
      selBounds.value = strokesBounds(selectedStrokes())
      lassoPts = []
    } else if (lassoMode === 'move' || lassoMode === 'resize') {
      commitPreview()
    }
    lassoMode = 'idle'
    dragStart = null
    redraw()
    return
  }
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
    clearSelection()
    redraw()
  },
)
// Leaving the lasso for another tool drops the selection so its box does not linger over drawing.
watch(
  () => settings.activeTool,
  (tool) => {
    if (tool !== 'lasso') {
      clearSelection()
      redraw()
    }
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

    <!-- The actions for a lasso selection, hovering just above its box. -->
    <Transition name="tidy-pop">
      <div
        v-if="selBounds && selectedIds.size && lassoMode === 'idle'"
        class="sel-bar"
        :style="{ left: `${(selBounds.x + selBounds.w / 2) * pxPerMm}px`, top: `${selBounds.y * pxPerMm}px` }"
      >
        <button title="Recolour to the ink colour" @click="recolorSelection">
          <span class="swatch" :style="{ background: settings.activeColor }" />
        </button>
        <button title="Duplicate" @click="duplicateSelection"><Icon name="copy" :size="15" /></button>
        <button title="Copy" @click="copySelection"><Icon name="file" :size="15" /></button>
        <button title="Cut" @click="cutSelection"><Icon name="eraser" :size="15" /></button>
        <button v-if="clipboardReady" title="Paste" @click="pasteClipboard"><Icon name="plus" :size="15" /></button>
        <button title="Delete" class="danger" @click="deleteSelection"><Icon name="trash" :size="15" /></button>
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
.sel-bar {
  position: absolute;
  transform: translate(-50%, calc(-100% - 8px));
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 3px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 11px;
  box-shadow: var(--pop-shadow, 0 8px 22px rgba(0, 0, 0, 0.22));
  pointer-events: auto;
}
.sel-bar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text);
  padding: 7px;
  border-radius: 8px;
  cursor: pointer;
}
.sel-bar button:hover {
  background: var(--accent-wash);
}
.sel-bar button.danger:hover {
  background: color-mix(in srgb, var(--danger, #c0392b) 14%, transparent);
  color: var(--danger, #c0392b);
}
.sel-bar .swatch {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px var(--border);
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
