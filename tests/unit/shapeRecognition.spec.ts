import { describe, it, expect } from 'vitest'
import { recognizeShape, shapeToStroke, type Shape } from '@/tools/shapeRecognition'
import type { StrokePoint } from '@/types'

function pts(xy: [number, number][]): StrokePoint[] {
  return xy.map(([x, y]) => ({ x, y, pressure: 1 }))
}

// A slightly noisy circle of radius r around (cx, cy).
function roughCircle(cx: number, cy: number, r: number): StrokePoint[] {
  const out: [number, number][] = []
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2
    const wobble = 1 + 0.04 * Math.sin(i * 1.7)
    out.push([cx + Math.cos(a) * r * wobble, cy + Math.sin(a) * r * wobble])
  }
  return pts(out)
}

function roughRect(x: number, y: number, w: number, h: number): StrokePoint[] {
  const corners: [number, number][] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ]
  const out: [number, number][] = []
  for (let c = 0; c < corners.length - 1; c++) {
    const [fx, fy] = corners[c]
    const [tx, ty] = corners[c + 1]
    for (let i = 0; i < 10; i++) {
      const t = i / 10
      out.push([fx + (tx - fx) * t + Math.sin(i) * 0.4, fy + (ty - fy) * t + Math.cos(i) * 0.4])
    }
  }
  out.push([x, y])
  return pts(out)
}

describe('recognizeShape', () => {
  it('reads a rough circle as a circle', () => {
    const s = recognizeShape(roughCircle(50, 50, 30))
    expect(s?.kind).toBe('circle')
    if (s?.kind === 'circle') expect(s.r).toBeGreaterThan(25)
  })

  it('reads a rough rectangle as a rectangle', () => {
    const s = recognizeShape(roughRect(20, 20, 60, 40))
    expect(s?.kind).toBe('rect')
  })

  it('reads a nearly straight stroke as a line', () => {
    const s = recognizeShape(pts(Array.from({ length: 20 }, (_, i) => [i * 3, i * 0.15])))
    expect(s?.kind).toBe('line')
  })

  it('leaves a tiny scribble alone', () => {
    expect(
      recognizeShape(
        pts([
          [0, 0],
          [1, 1],
          [0, 2],
          [1, 0],
          [0, 1],
          [1, 2],
          [0, 0],
          [1, 1],
        ]),
      ),
    ).toBeNull()
  })

  it('leaves an open squiggle alone', () => {
    const wiggle: [number, number][] = Array.from({ length: 20 }, (_, i) => [i * 3, Math.sin(i) * 12])
    expect(recognizeShape(pts(wiggle))).toBeNull()
  })
})

describe('shapeToStroke', () => {
  it('resamples a shape into stroke points, not a perfect primitive', () => {
    const circle: Shape = { kind: 'circle', cx: 50, cy: 50, r: 30 }
    const stroke = shapeToStroke(circle, 7)
    expect(stroke.length).toBeGreaterThan(20)
    // Radii vary a little (wobble), so it is not a perfect circle.
    const radii = stroke.map((p) => Math.hypot(p.x - 50, p.y - 50))
    const spread = Math.max(...radii) - Math.min(...radii)
    expect(spread).toBeGreaterThan(0.1)
  })

  it('is deterministic for a given seed', () => {
    const s: Shape = { kind: 'rect', x: 0, y: 0, w: 40, h: 20 }
    expect(shapeToStroke(s, 3)).toEqual(shapeToStroke(s, 3))
  })
})
