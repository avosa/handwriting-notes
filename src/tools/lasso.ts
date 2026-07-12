// The geometry behind lasso selection of ink: what a drawn loop encloses, the box around a set of
// strokes, and moving or scaling those strokes. It works on the stroke points in millimetres and is
// free of any canvas or event handling, so it can be reasoned about and tested on its own.
import type { Stroke, StrokePoint } from '@/types'

export interface Point {
  x: number
  y: number
}
export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

// Whether a point lies inside a polygon, by ray casting across its edges.
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function centroid(points: StrokePoint[]): Point {
  let sx = 0
  let sy = 0
  for (const p of points) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / points.length, y: sy / points.length }
}

// The ids of the strokes a lasso loop takes in: a stroke is selected when its centre, or most of its
// points, fall inside the loop, so grazing the very edge of a long stroke does not grab it.
export function strokesInLasso(strokes: Stroke[], loop: Point[]): string[] {
  if (loop.length < 3) return []
  const ids: string[] = []
  for (const stroke of strokes) {
    if (!stroke.points.length) continue
    if (pointInPolygon(centroid(stroke.points), loop)) {
      ids.push(stroke.id)
      continue
    }
    const inside = stroke.points.filter((p) => pointInPolygon(p, loop)).length
    if (inside / stroke.points.length >= 0.6) ids.push(stroke.id)
  }
  return ids
}

// The bounding box around a set of strokes, or null when there are none.
export function strokesBounds(strokes: Stroke[]): Bounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const stroke of strokes) {
    for (const p of stroke.points) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  if (minX === Infinity) return null
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function translateStroke(stroke: Stroke, dx: number, dy: number): Stroke {
  return { ...stroke, points: stroke.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) }
}

// Scale a stroke about an origin by independent x and y factors, for resizing a selection by its
// corner handles.
export function scaleStroke(stroke: Stroke, origin: Point, sx: number, sy: number): Stroke {
  return {
    ...stroke,
    points: stroke.points.map((p) => ({
      ...p,
      x: origin.x + (p.x - origin.x) * sx,
      y: origin.y + (p.y - origin.y) * sy,
    })),
  }
}

// A single clipboard of strokes shared across pages, so a selection cut or copied on one page can be
// pasted onto another. A deep copy is kept so a later edit to the originals never changes it.
let clipboard: Stroke[] = []

export function copyToClipboard(strokes: Stroke[]): void {
  clipboard = strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }))
}

export function clipboardStrokes(): Stroke[] {
  return clipboard.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }))
}

export function hasClipboard(): boolean {
  return clipboard.length > 0
}
