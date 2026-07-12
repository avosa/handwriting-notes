import { describe, it, expect } from 'vitest'
import { strokeWidths, grain } from '@/tools/inkPhysics'
import type { Stroke } from '@/types'

function stroke(tool: Stroke['tool'], points: [number, number][], width = 1): Stroke {
  return { id: 's', tool, color: '#000', width, points: points.map(([x, y]) => ({ x, y, pressure: 1 })) }
}

describe('strokeWidths', () => {
  it('returns one width per point', () => {
    const s = stroke('fine', [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ])
    expect(strokeWidths(s)).toHaveLength(4)
  })

  it('tapers the ends thinner than the middle for a nib feel', () => {
    const pts: [number, number][] = Array.from({ length: 12 }, (_, i) => [i * 0.3, 0])
    const w = strokeWidths(stroke('fine', pts))
    const mid = w[6]
    expect(w[0]).toBeLessThan(mid)
    expect(w[w.length - 1]).toBeLessThan(mid)
  })

  it('pools wider where the pen moves slowly than where it moves fast', () => {
    const slow = strokeWidths(
      stroke('fine', [
        [0, 0],
        [0.1, 0],
        [0.2, 0],
        [0.3, 0],
        [0.4, 0],
      ]),
    )
    const fast = strokeWidths(
      stroke('fine', [
        [0, 0],
        [3, 0],
        [6, 0],
        [9, 0],
        [12, 0],
      ]),
    )
    const mid = (arr: number[]) => arr[Math.floor(arr.length / 2)]
    expect(mid(slow)).toBeGreaterThan(mid(fast))
  })

  it('leaves the marker an even swipe (no taper)', () => {
    const pts: [number, number][] = Array.from({ length: 12 }, (_, i) => [i * 0.3, 0])
    const w = strokeWidths(stroke('marker', pts))
    expect(w[0]).toBeCloseTo(w[6], 5)
  })

  it('is deterministic', () => {
    const s = stroke('pencil', [
      [0, 0],
      [1, 1],
      [2, 0],
      [3, 1],
    ])
    expect(strokeWidths(s)).toEqual(strokeWidths(s))
  })
})

describe('grain', () => {
  it('is stable for a given spot and within [0, 1]', () => {
    const a = grain(12.5, 40.2)
    expect(a).toBe(grain(12.5, 40.2))
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(1)
  })
})
