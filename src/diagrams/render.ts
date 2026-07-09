// Turns a diagram spec into concrete pen-drawn paths and labels in the scene's own
// coordinate units. Both the on-screen component and the PDF exporter build from this
// one function, so a figure looks identical on screen and on the exported page.
import type { DiagramSpec, Point } from '@/types'
import { toScene } from './diagramSpec'
import { circle, rect, tri, arrow, line, hashSeed } from './wobble'

export interface RenderedPath {
  d: string
  stroke: string
  fill: string
}

export interface RenderedLabel {
  x: number
  y: number
  text: string
  color: string
  size: number
  anchor: 'start' | 'middle' | 'end'
}

export interface RenderedDiagram {
  width: number
  height: number
  paths: RenderedPath[]
  labels: RenderedLabel[]
  strokeWidth: number
}

export function renderDiagram(spec: DiagramSpec): RenderedDiagram {
  const scene = toScene(spec)
  const seedBase = hashSeed(JSON.stringify(spec))
  const paths: RenderedPath[] = []
  const labels: RenderedLabel[] = []

  scene.shapes.forEach((shape, i) => {
    const seed = seedBase + i * 131
    switch (shape.type) {
      case 'ellipse':
        paths.push({
          d: circle(shape.cx, shape.cy, shape.rx, shape.ry, seed),
          stroke: shape.color,
          fill: shape.fill ?? 'none',
        })
        break
      case 'rect':
        paths.push({
          d: rect(shape.x, shape.y, shape.w, shape.h, seed),
          stroke: shape.color,
          fill: shape.fill ?? 'none',
        })
        break
      case 'triangle': {
        const p = shape.points.map((pt: Point): [number, number] => [pt.x, pt.y])
        paths.push({ d: tri(p[0], p[1], p[2], seed), stroke: shape.color, fill: shape.fill ?? 'none' })
        break
      }
      case 'arrow':
        paths.push({
          d: arrow(shape.from.x, shape.from.y, shape.to.x, shape.to.y, seed),
          stroke: shape.color,
          fill: 'none',
        })
        break
      case 'line':
        paths.push({
          d: line(shape.from.x, shape.from.y, shape.to.x, shape.to.y, seed),
          stroke: shape.color,
          fill: 'none',
        })
        break
      case 'label':
        labels.push({
          x: shape.at.x,
          y: shape.at.y,
          text: shape.text,
          color: shape.color,
          size: shape.size ?? 4,
          anchor: shape.anchor ?? 'middle',
        })
        break
    }
  })

  return {
    width: scene.canvas.width,
    height: scene.canvas.height,
    paths,
    labels,
    strokeWidth: Math.max(scene.canvas.width, scene.canvas.height) * 0.004,
  }
}
