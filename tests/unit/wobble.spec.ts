import { describe, it, expect } from 'vitest'
import { circle, rect, radiusVariance } from '@/diagrams/wobble'

describe('wobble engine', () => {
  it('draws circles that read as hand-drawn, not as perfect ellipses', () => {
    const path = circle(50, 50, 30, 30, 'dogs')
    const { min, max, mean } = radiusVariance(path, 50, 50)
    const spread = (max - min) / mean
    // A perfect circle would have zero spread. Require a visible wobble, but not so
    // much that it stops reading as a circle.
    expect(spread).toBeGreaterThan(0.02)
    expect(spread).toBeLessThan(0.2)
  })

  it('is deterministic for a given seed', () => {
    expect(circle(10, 10, 5, 5, 'a')).toBe(circle(10, 10, 5, 5, 'a'))
    expect(rect(0, 0, 40, 20, 7)).toBe(rect(0, 0, 40, 20, 7))
  })

  it('produces different outlines for different seeds', () => {
    expect(circle(10, 10, 5, 5, 'a')).not.toBe(circle(10, 10, 5, 5, 'b'))
  })

  it('emits only path data, never a perfect primitive', () => {
    const path = circle(0, 0, 10, 10, 1)
    expect(path.startsWith('M')).toBe(true)
    expect(path).not.toContain('<circle')
  })
})
