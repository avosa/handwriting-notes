// Expands a DiagramSpec into a primitive scene. A custom `scene` passes straight
// through; the named Venn shorthands are laid out here into the same primitives, so
// every diagram, sample or arbitrary, renders through one pen-drawn engine.
import type { DiagramScene, DiagramShape, DiagramSpec } from '@/types'

const INK = '#33334C'
const PURPLE = '#7E3F8A'
const INTERSECTION_FILL = 'rgba(126, 63, 138, 0.16)'
const UNION_FILL = 'rgba(190, 180, 90, 0.15)'

// A framed diagram lives in a landscape box a little wider than tall, matching the
// universal-set rectangles in the notes.
const W = 100
const H = 64

function universe(label: string): DiagramShape[] {
  return [
    { type: 'rect', x: 2, y: 2, w: W - 4, h: H - 4, color: INK },
    { type: 'label', at: { x: 5, y: 9 }, text: label, color: INK, size: 3.6, anchor: 'start' },
  ]
}

function caption(text: string): DiagramShape {
  return { type: 'label', at: { x: W / 2, y: H - 4.5 }, text, color: INK, size: 3.4, anchor: 'middle' }
}

export function toScene(spec: DiagramSpec): DiagramScene {
  if (spec.kind === 'scene') return spec.scene

  const shapes: DiagramShape[] = []
  const cy = H / 2

  switch (spec.kind) {
    case 'venn-subset': {
      const cx = W / 2
      const rx = W * 0.3
      const ry = H * 0.32
      shapes.push(...universe(spec.universeLabel))
      shapes.push({ type: 'ellipse', cx, cy, rx, ry, color: spec.outer.color })
      shapes.push({ type: 'ellipse', cx, cy: cy + ry * 0.12, rx: rx * 0.4, ry: ry * 0.42, color: spec.inner.color })
      shapes.push({ type: 'label', at: { x: cx, y: cy - ry * 0.66 }, text: spec.outer.label, color: spec.outer.color, size: 4 })
      shapes.push({ type: 'label', at: { x: cx, y: cy + ry * 0.2 }, text: spec.inner.label, color: spec.inner.color, size: 4 })
      shapes.push(caption(spec.caption))
      break
    }
    case 'venn-overlap': {
      const rx = W * 0.22
      const ry = H * 0.3
      const lcx = W * 0.4
      const rcx = W * 0.6
      shapes.push(...universe(spec.universeLabel))
      if (spec.shade === 'intersection') {
        shapes.push({ type: 'ellipse', cx: (lcx + rcx) / 2, cy, rx: rx * 0.5, ry: ry * 0.78, color: 'none', fill: INTERSECTION_FILL })
      } else if (spec.shade === 'union') {
        shapes.push({ type: 'ellipse', cx: lcx, cy, rx, ry, color: 'none', fill: UNION_FILL })
        shapes.push({ type: 'ellipse', cx: rcx, cy, rx, ry, color: 'none', fill: UNION_FILL })
      }
      shapes.push({ type: 'ellipse', cx: lcx, cy, rx, ry, color: spec.left.color })
      shapes.push({ type: 'ellipse', cx: rcx, cy, rx, ry, color: spec.right.color })
      shapes.push({ type: 'label', at: { x: lcx - rx * 0.6, y: cy - ry * 0.55 }, text: spec.left.label, color: spec.left.color, size: 4 })
      shapes.push({ type: 'label', at: { x: rcx + rx * 0.6, y: cy - ry * 0.55 }, text: spec.right.label, color: spec.right.color, size: 4 })
      if (spec.middleLabel) {
        shapes.push({ type: 'label', at: { x: (lcx + rcx) / 2, y: cy }, text: spec.middleLabel, color: spec.middleColor ?? PURPLE, size: 3.8 })
      }
      shapes.push(caption(spec.caption))
      break
    }
    case 'venn-disjoint': {
      const rx = W * 0.18
      const ry = H * 0.3
      const lcx = W * 0.3
      const rcx = W * 0.7
      shapes.push(...universe(spec.universeLabel))
      shapes.push({ type: 'ellipse', cx: lcx, cy, rx, ry, color: spec.left.color })
      shapes.push({ type: 'ellipse', cx: rcx, cy, rx, ry, color: spec.right.color })
      shapes.push({ type: 'label', at: { x: lcx, y: cy }, text: spec.left.label, color: spec.left.color, size: 4 })
      shapes.push({ type: 'label', at: { x: rcx, y: cy }, text: spec.right.label, color: spec.right.color, size: 4 })
      shapes.push(caption(spec.caption))
      break
    }
    case 'venn-three': {
      const rx = W * 0.19
      const ry = H * 0.26
      const acx = W * 0.4
      const bcx = W * 0.6
      const topY = cy - ry * 0.45
      const ccx = W * 0.5
      const ccy = cy + ry * 0.6
      shapes.push(...universe(spec.universeLabel))
      shapes.push({ type: 'ellipse', cx: acx, cy: topY, rx, ry, color: spec.a.color })
      shapes.push({ type: 'ellipse', cx: bcx, cy: topY, rx, ry, color: spec.b.color })
      shapes.push({ type: 'ellipse', cx: ccx, cy: ccy, rx, ry, color: spec.c.color })
      shapes.push({ type: 'label', at: { x: acx - rx * 0.55, y: topY - ry * 0.15 }, text: spec.a.label, color: spec.a.color, size: 4.4 })
      shapes.push({ type: 'label', at: { x: bcx + rx * 0.55, y: topY - ry * 0.15 }, text: spec.b.label, color: spec.b.color, size: 4.4 })
      shapes.push({ type: 'label', at: { x: ccx, y: ccy + ry * 0.7 }, text: spec.c.label, color: spec.c.color, size: 4.4 })
      if (spec.centerLabel) {
        shapes.push({ type: 'label', at: { x: ccx, y: cy + ry * 0.15 }, text: spec.centerLabel, color: INK, size: 3.2 })
      }
      shapes.push(caption(spec.caption))
      break
    }
    case 'triangle': {
      const up = spec.direction === 'up'
      const apex = up ? { x: W / 2, y: 8 } : { x: W / 2, y: H - 8 }
      const baseL = up ? { x: 20, y: H - 8 } : { x: 20, y: 8 }
      const baseR = up ? { x: W - 20, y: H - 8 } : { x: W - 20, y: 8 }
      shapes.push({ type: 'triangle', points: [apex, baseL, baseR], color: spec.color })
      shapes.push({ type: 'arrow', from: { x: W / 2, y: H - 12 }, to: { x: W / 2, y: 12 }, color: spec.color })
      shapes.push({ type: 'label', at: { x: W / 2, y: up ? 6 : H - 2 }, text: spec.topLabel, color: spec.color, size: 4 })
      shapes.push({ type: 'label', at: { x: W / 2, y: up ? H - 2 : 6 }, text: spec.bottomLabel, color: spec.color, size: 4 })
      break
    }
  }

  return { canvas: { width: W, height: H }, shapes }
}
