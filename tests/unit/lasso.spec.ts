import { describe, it, expect } from 'vitest'
import { pointInPolygon, strokesInLasso, strokesBounds, translateStroke, scaleStroke } from '@/tools/lasso'
import type { Stroke } from '@/types'

function stroke(id: string, xy: [number, number][]): Stroke {
  return { id, tool: 'fine', color: '#000', width: 1, points: xy.map(([x, y]) => ({ x, y, pressure: 1 })) }
}

const box = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

describe('pointInPolygon', () => {
  it('is true inside and false outside', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, box)).toBe(true)
    expect(pointInPolygon({ x: 15, y: 5 }, box)).toBe(false)
  })
})

describe('strokesInLasso', () => {
  it('selects a stroke inside the loop and skips one outside', () => {
    const inside = stroke('a', [
      [3, 3],
      [4, 4],
      [5, 5],
    ])
    const outside = stroke('b', [
      [30, 30],
      [31, 31],
    ])
    expect(strokesInLasso([inside, outside], box)).toEqual(['a'])
  })

  it('ignores a stroke that only grazes the edge', () => {
    const grazing = stroke('c', [
      [9, 5],
      [12, 5],
      [15, 5],
      [18, 5],
      [21, 5],
    ])
    expect(strokesInLasso([grazing], box)).toEqual([])
  })
})

describe('strokesBounds', () => {
  it('boxes the strokes and returns null for none', () => {
    expect(
      strokesBounds([
        stroke('a', [
          [2, 4],
          [8, 10],
        ]),
      ]),
    ).toEqual({ x: 2, y: 4, w: 6, h: 6 })
    expect(strokesBounds([])).toBeNull()
  })
})

describe('transforms', () => {
  it('translates every point', () => {
    const moved = translateStroke(
      stroke('a', [
        [1, 1],
        [2, 2],
      ]),
      5,
      -3,
    )
    expect(moved.points.map((p) => [p.x, p.y])).toEqual([
      [6, -2],
      [7, -1],
    ])
  })

  it('scales about an origin', () => {
    const scaled = scaleStroke(
      stroke('a', [
        [10, 10],
        [20, 20],
      ]),
      { x: 0, y: 0 },
      2,
      0.5,
    )
    expect(scaled.points.map((p) => [p.x, p.y])).toEqual([
      [20, 5],
      [40, 10],
    ])
  })

  it('keeps pressure through a transform', () => {
    const moved = translateStroke(stroke('a', [[1, 1]]), 1, 1)
    expect(moved.points[0].pressure).toBe(1)
  })
})
