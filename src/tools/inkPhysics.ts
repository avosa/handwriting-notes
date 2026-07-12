// What makes a drawn line read as real ink rather than a constant-width trace. The nib swells where
// the pen moves slowly or presses hard and thins where it moves fast, ink pools a touch at the ends
// as the pen lands and lifts, and paper tooth mottles the darkness so it sits on the page instead of
// floating above it. Everything here is deterministic — a stroke looks identical on every redraw and
// in an export — and depends only on the stroke's own points, so it costs nothing to store.
import type { Stroke } from '@/types'

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

// Per-point widths in millimetres for a stroke, shaped by pressure, speed, and end taper. The fine
// pen and pencil pool and taper like a real nib; the marker and highlighter lay an even swipe, so
// they only follow pressure. Widths are smoothed so sampling jitter never makes the line ripple.
export function strokeWidths(stroke: Stroke): number[] {
  const pts = stroke.points
  const n = pts.length
  const base = stroke.width
  if (n === 0) return []
  if (n === 1) return [base * pts[0].pressure]

  const shapes = stroke.tool === 'fine' || stroke.tool === 'pencil'
  const raw = pts.map((p, i) => {
    const prev = pts[Math.max(0, i - 1)]
    // Distance between samples stands in for speed: samples arrive at a steady rate, so a big gap
    // means a fast stroke. A slow stroke pools wider, a fast one thins.
    const speed = Math.hypot(p.x - prev.x, p.y - prev.y)
    const pool = shapes ? clamp(1.18 - speed * 0.5, 0.62, 1.18) : 1
    // A tilted stylus lays a broader mark, like shading with the side of the nib; upright pens and
    // fingers (tilt unset) are unaffected.
    const tilt = 1 + 0.7 * (p.tilt ?? 0)
    return base * p.pressure * pool * tilt
  })

  const smooth = raw.map((_, i) => {
    const a = raw[Math.max(0, i - 1)]
    const b = raw[i]
    const c = raw[Math.min(n - 1, i + 1)]
    return (a + 2 * b + c) / 4
  })

  if (shapes) {
    const taper = Math.min(6, Math.floor(n / 3))
    for (let i = 0; i < taper; i++) {
      const f = 0.4 + 0.6 * ((i + 1) / (taper + 1))
      smooth[i] *= f
      smooth[n - 1 - i] *= f
    }
  }
  return smooth
}

// A stable value in [0, 1] for a spot on the page — the paper's tooth. Sampling it at a point gives
// the same grain every redraw, so ink can be mottled a little where the paper is rougher.
export function grain(x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}
