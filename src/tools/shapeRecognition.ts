// Recognise the shape a rough freehand stroke was meant to be — a line, circle, rectangle, or
// triangle — and redraw it cleanly. "Cleanly" here still means hand drawn: the tidied shape is
// resampled with a little wobble, never a perfect primitive, so a straightened circle still looks
// like it was drawn with a pen. Everything works in millimetres on the stroke's own points.
import type { StrokePoint } from '@/types'

interface Pt {
  x: number
  y: number
}

export type Shape =
  | { kind: 'line'; a: Pt; b: Pt }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'triangle'; a: Pt; b: Pt; c: Pt }

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Perpendicular distance from p to the line through a and b, for straightness tests and simplifying.
function perpendicular(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return dist(p, a)
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len
}

// Ramer–Douglas–Peucker: drop points that lie close to the line between their neighbours, leaving
// the corners. Used to count how many corners a closed shape really has.
function simplify(points: Pt[], epsilon: number): Pt[] {
  if (points.length < 3) return points.slice()
  let maxDist = 0
  let index = 0
  const first = points[0]
  const last = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicular(points[i], first, last)
    if (d > maxDist) {
      maxDist = d
      index = i
    }
  }
  if (maxDist <= epsilon) return [first, last]
  const left = simplify(points.slice(0, index + 1), epsilon)
  const right = simplify(points.slice(index), epsilon)
  return [...left.slice(0, -1), ...right]
}

function boundingBox(points: Pt[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// Work out what shape a stroke was meant to be, or null when it is just a squiggle worth leaving as
// it is. Small strokes are ignored, so a dotted i or a quick tick is never straightened.
export function recognizeShape(points: StrokePoint[]): Shape | null {
  const pts: Pt[] = points.map((p) => ({ x: p.x, y: p.y }))
  if (pts.length < 8) return null
  const box = boundingBox(pts)
  const diagonal = Math.hypot(box.w, box.h)
  if (diagonal < 12) return null // too small to be a deliberate figure (~12 mm)

  const first = pts[0]
  const last = pts[pts.length - 1]
  const closed = dist(first, last) < 0.28 * diagonal

  if (!closed) {
    // An open stroke is only tidied when it is nearly straight along its length.
    const straightness = Math.max(...pts.map((p) => perpendicular(p, first, last)))
    const length = dist(first, last)
    if (length > 12 && straightness < 0.09 * length) return { kind: 'line', a: first, b: last }
    return null
  }

  // A closed loop. Measure how even the distances from the centre are: a circle's are near constant.
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const radii = pts.map((p) => Math.hypot(p.x - cx, p.y - cy))
  const mean = radii.reduce((s, r) => s + r, 0) / radii.length
  const variation = Math.sqrt(radii.reduce((s, r) => s + (r - mean) ** 2, 0) / radii.length) / mean
  // A clearly round loop is a circle straight away, before corner counting could mistake a wobbly
  // circle that happens to simplify to four points for a rectangle.
  if (variation < 0.1) return { kind: 'circle', cx, cy, r: mean }

  // Otherwise count corners. Simplify to the turning points, drop a duplicated closing point so the
  // outline is a clean cycle, then keep only the vertices that actually turn — the simplify pass can
  // leave a stray point sitting on a straight edge, which must not be mistaken for a corner.
  const simplified = simplify(pts, 0.06 * diagonal)
  const poly =
    simplified.length > 1 && dist(simplified[0], simplified[simplified.length - 1]) < 0.1 * diagonal
      ? simplified.slice(0, -1)
      : simplified
  const cornerList = poly.filter((b, i) => {
    const a = poly[(i - 1 + poly.length) % poly.length]
    const c = poly[(i + 1) % poly.length]
    const v1x = a.x - b.x
    const v1y = a.y - b.y
    const v2x = c.x - b.x
    const v2y = c.y - b.y
    const mags = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y)
    if (mags === 0) return false
    const angle = Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / mags)))
    return angle < 2.6 // an interior angle under ~150°, i.e. a real corner rather than a straight run
  })
  const n = cornerList.length
  if (n === 3) return { kind: 'triangle', a: cornerList[0], b: cornerList[1], c: cornerList[2] }
  if (n === 4) return { kind: 'rect', x: box.x, y: box.y, w: box.w, h: box.h }
  // Many corners with an even radius reads as a circle rather than nothing.
  if (n >= 5 && variation < 0.22) return { kind: 'circle', cx, cy, r: mean }
  return null
}

// A small, stable wobble so a tidied shape still looks pen drawn. Seeded by the point index so the
// same shape wobbles the same way every render.
function wobble(seed: number, amplitude: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453
  return (s - Math.floor(s) - 0.5) * 2 * amplitude
}

// Resample a recognised shape as stroke points with a gentle wobble, so the tidy version is clean
// but still hand drawn. The pressure is even, as a deliberate outline would be.
export function shapeToStroke(shape: Shape, seed = 1): StrokePoint[] {
  const out: Pt[] = []
  const push = (x: number, y: number) => out.push({ x, y })

  if (shape.kind === 'line') {
    const steps = Math.max(8, Math.round(dist(shape.a, shape.b) / 3))
    const amp = Math.min(0.6, dist(shape.a, shape.b) * 0.01)
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const nx = -(shape.b.y - shape.a.y)
      const ny = shape.b.x - shape.a.x
      const len = Math.hypot(nx, ny) || 1
      const w = wobble(seed + i, amp)
      push(
        shape.a.x + (shape.b.x - shape.a.x) * t + (nx / len) * w,
        shape.a.y + (shape.b.y - shape.a.y) * t + (ny / len) * w,
      )
    }
  } else if (shape.kind === 'circle') {
    const steps = Math.max(24, Math.round(shape.r))
    const amp = Math.max(0.3, shape.r * 0.03)
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2
      const r = shape.r + wobble(seed + i, amp)
      push(shape.cx + Math.cos(a) * r, shape.cy + Math.sin(a) * r)
    }
  } else {
    const corners: Pt[] =
      shape.kind === 'rect'
        ? [
            { x: shape.x, y: shape.y },
            { x: shape.x + shape.w, y: shape.y },
            { x: shape.x + shape.w, y: shape.y + shape.h },
            { x: shape.x, y: shape.y + shape.h },
          ]
        : [shape.a, shape.b, shape.c]
    const amp = 0.02 * (shape.kind === 'rect' ? Math.hypot(shape.w, shape.h) : dist(shape.a, shape.b))
    for (let c = 0; c < corners.length; c++) {
      const from = corners[c]
      const to = corners[(c + 1) % corners.length]
      const steps = Math.max(6, Math.round(dist(from, to) / 3))
      for (let i = 0; i < steps; i++) {
        const t = i / steps
        push(
          from.x + (to.x - from.x) * t + wobble(seed + c * 100 + i, amp),
          from.y + (to.y - from.y) * t + wobble(seed + c * 137 + i, amp),
        )
      }
    }
    push(corners[0].x, corners[0].y)
  }
  return out.map((p) => ({ x: p.x, y: p.y, pressure: 0.9 }))
}
