// Ready-made figures the insert menu offers. Each returns a spec plus how many ruled
// lines tall it should sit, styled to match the hand-drawn look of the sample notes.
import type { Block, DiagramScene, DiagramSpec } from '@/types'
import { notePalette } from '@/handwriting/registry'
import { uid } from '@/util/id'

const C = notePalette
const PURPLE = '#7E3F8A'

export interface DiagramPreset {
  key: string
  label: string
  build(): { spec: DiagramSpec; heightRules: number }
}

function nodeArrowScene(): DiagramScene {
  return {
    canvas: { width: 100, height: 46 },
    shapes: [
      { type: 'ellipse', cx: 26, cy: 24, rx: 12, ry: 11, color: C.penBlue },
      { type: 'label', at: { x: 26, y: 25 }, text: 'TRUE', color: C.penBlue, size: 4 },
      { type: 'ellipse', cx: 74, cy: 24, rx: 12, ry: 11, color: C.penRed },
      { type: 'label', at: { x: 74, y: 25 }, text: 'FALSE', color: C.penRed, size: 4 },
      { type: 'arrow', from: { x: 40, y: 24 }, to: { x: 60, y: 24 }, color: C.ink },
      { type: 'label', at: { x: 50, y: 19 }, text: 'flip', color: C.ink, size: 3.2 },
    ],
  }
}

export const diagramPresets: DiagramPreset[] = [
  {
    key: 'venn-subset',
    label: 'Subset',
    build: () => ({
      spec: {
        kind: 'venn-subset',
        universeLabel: 'U',
        outer: { label: 'B', color: C.penBlue },
        inner: { label: 'A', color: C.penRed },
        caption: 'A is inside B',
      },
      heightRules: 9,
    }),
  },
  {
    key: 'venn-overlap',
    label: 'Overlap',
    build: () => ({
      spec: {
        kind: 'venn-overlap',
        universeLabel: 'U',
        left: { label: 'A', color: C.penBlue },
        right: { label: 'B', color: C.penRed },
        middleLabel: 'both',
        middleColor: PURPLE,
        caption: 'A and B overlap',
      },
      heightRules: 9,
    }),
  },
  {
    key: 'venn-disjoint',
    label: 'Disjoint',
    build: () => ({
      spec: {
        kind: 'venn-disjoint',
        universeLabel: 'U',
        left: { label: 'A', color: C.penBlue },
        right: { label: 'B', color: C.penRed },
        caption: 'A and B are separate',
      },
      heightRules: 9,
    }),
  },
  {
    key: 'venn-three',
    label: 'Three sets',
    build: () => ({
      spec: {
        kind: 'venn-three',
        universeLabel: 'U',
        a: { label: 'A', color: C.penBlue },
        b: { label: 'B', color: C.penRed },
        c: { label: 'C', color: C.penGreen },
        centerLabel: 'all',
        caption: 'three overlapping sets',
      },
      heightRules: 11,
    }),
  },
  {
    key: 'triangle',
    label: 'Triangle',
    build: () => ({
      spec: { kind: 'triangle', direction: 'up', topLabel: 'specific', bottomLabel: 'general', color: C.penBlue },
      heightRules: 8,
    }),
  },
  {
    key: 'node-arrow',
    label: 'Flow',
    build: () => ({ spec: { kind: 'scene', scene: nodeArrowScene() }, heightRules: 6 }),
  },
]

export function diagramBlock(preset: DiagramPreset): Extract<Block, { type: 'diagram' }> {
  const { spec, heightRules } = preset.build()
  return { id: uid('b'), type: 'diagram', spec, heightRules }
}
