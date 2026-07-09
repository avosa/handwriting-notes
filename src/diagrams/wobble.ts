// Turns clean geometry into pen-drawn geometry. Every generator is seeded, so a
// shape renders identically on every reload and export, yet each looks hand drawn:
// the radius breathes with low-frequency noise and lines overshoot their corners a
// touch. Perfect ellipses and rectangles are never used for diagram content.

/** A small deterministic PRNG so a seed fully determines a shape. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Turn any string or number seed into a 32 bit integer. */
export function hashSeed(seed: string | number): number {
  if (typeof seed === 'number') return Math.floor(seed) >>> 0
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function point(x: number, y: number): string {
  return `${x.toFixed(2)},${y.toFixed(2)}`
}

/** Build a smooth closed path through sampled points using Catmull Rom curves. */
function closedSpline(points: Array<[number, number]>): string {
  const n = points.length
  const at = (i: number) => points[((i % n) + n) % n]
  let d = `M ${point(...at(0))}`
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${point(c1x, c1y)} ${point(c2x, c2y)} ${point(p2[0], p2[1])}`
  }
  return d + ' Z'
}

/**
 * A closed wobbly ellipse centred at (cx, cy). The radius is modulated by two low
 * frequency sine waves at a random phase so the outline waves gently without ever
 * straying far from a circle.
 */
export function circle(cx: number, cy: number, rx: number, ry: number, seed: string | number): string {
  const rand = mulberry32(hashSeed(seed))
  const samples = 44
  const wobble = 0.03 + rand() * 0.015
  const phase1 = rand() * Math.PI * 2
  const phase2 = rand() * Math.PI * 2
  const freq2 = 3 + Math.floor(rand() * 3)
  const pts: Array<[number, number]> = []
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2
    const noise = 1 + wobble * Math.sin(t * 2 + phase1) + wobble * 0.5 * Math.sin(t * freq2 + phase2)
    pts.push([cx + Math.cos(t) * rx * noise, cy + Math.sin(t) * ry * noise])
  }
  return closedSpline(pts)
}

/** A rectangle whose four sides wave gently, used for the universal set box. */
export function rect(x: number, y: number, w: number, h: number, seed: string | number): string {
  const rand = mulberry32(hashSeed(seed))
  const jitter = Math.min(w, h) * 0.006
  const perSide = 10
  const corners: Array<[number, number]> = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]
  let d = ''
  for (let c = 0; c < 4; c++) {
    const [sx, sy] = corners[c]
    const [ex, ey] = corners[(c + 1) % 4]
    for (let i = 0; i <= perSide; i++) {
      const t = i / perSide
      const px = sx + (ex - sx) * t + (rand() - 0.5) * jitter * 2
      const py = sy + (ey - sy) * t + (rand() - 0.5) * jitter * 2
      d += (d === '' ? 'M ' : ' L ') + point(px, py)
    }
  }
  return d + ' Z'
}

/** A wavy triangle through three corners. */
export function tri(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  seed: string | number,
): string {
  const rand = mulberry32(hashSeed(seed))
  const corners = [p0, p1, p2]
  const scale = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
  const jitter = scale * 0.01
  const perSide = 8
  let d = ''
  for (let c = 0; c < 3; c++) {
    const [sx, sy] = corners[c]
    const [ex, ey] = corners[(c + 1) % 3]
    for (let i = 0; i <= perSide; i++) {
      const t = i / perSide
      const px = sx + (ex - sx) * t + (rand() - 0.5) * jitter * 2
      const py = sy + (ey - sy) * t + (rand() - 0.5) * jitter * 2
      d += (d === '' ? 'M ' : ' L ') + point(px, py)
    }
  }
  return d + ' Z'
}

/** A single gently wavy line between two points. */
export function line(x1: number, y1: number, x2: number, y2: number, seed: string | number): string {
  const rand = mulberry32(hashSeed(seed))
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const jitter = len * 0.015
  const segs = 8
  let d = ''
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const wob = Math.sin(t * Math.PI) * (rand() - 0.5) * jitter
    d += (i === 0 ? 'M ' : ' L ') + point(x1 + dx * t + nx * wob, y1 + dy * t + ny * wob)
  }
  return d
}

/** A wavy arrow shaft with a hand-drawn two-stroke head, returned as one path. */
export function arrow(x1: number, y1: number, x2: number, y2: number, seed: string | number): string {
  const rand = mulberry32(hashSeed(seed))
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const jitter = len * 0.02
  const segs = 8
  let shaft = ''
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const wob = Math.sin(t * Math.PI) * (rand() - 0.5) * jitter
    const px = x1 + dx * t + nx * wob
    const py = y1 + dy * t + ny * wob
    shaft += (i === 0 ? 'M ' : ' L ') + point(px, py)
  }
  const angle = Math.atan2(dy, dx)
  const headLen = Math.min(len * 0.22, 8)
  const spread = 0.42
  const hx1 = x2 - Math.cos(angle - spread) * headLen
  const hy1 = y2 - Math.sin(angle - spread) * headLen
  const hx2 = x2 - Math.cos(angle + spread) * headLen
  const hy2 = y2 - Math.sin(angle + spread) * headLen
  const head = ` M ${point(hx1, hy1)} L ${point(x2, y2)} L ${point(hx2, hy2)}`
  return shaft + head
}

/**
 * Radius variance of a generated circle path, sampled at its on-curve anchors. The
 * visual test uses this to prove the outline wobbles yet still reads as a circle.
 */
export function radiusVariance(path: string, cx: number, cy: number): { min: number; max: number; mean: number } {
  const radii: number[] = []
  const re = /([-\d.]+),([-\d.]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(path))) {
    const r = Math.hypot(Number(m[1]) - cx, Number(m[2]) - cy)
    if (r > 0) radii.push(r)
  }
  const mean = radii.reduce((s, r) => s + r, 0) / radii.length
  return { min: Math.min(...radii), max: Math.max(...radii), mean }
}
