// The starting document: the Sets and Venn Diagrams notes, reproduced so the app
// opens looking exactly like the sample. Text is transcribed line for line and each
// figure is a diagram spec drawn by the pen engine, not an image. This is data, so
// every block stays editable and every figure stays recolourable.
import type { Block, NoteDocument, Page, TextBlock, DiagramSpec, DiagramScene } from '@/types'
import { defaultPresetId } from '@/paper/sheetSpec'
import { sanobiaPalette } from '@/handwriting/registry'
import { uid } from '@/util/id'

const C = sanobiaPalette
const PURPLE = '#7E3F8A'

function text(role: TextBlock['role'], content: string, extra: Partial<TextBlock> = {}): Block {
  return { id: uid('b'), type: 'text', text: { id: uid('t'), role, content, ...extra } }
}

function diagram(spec: DiagramSpec, heightRules: number): Block {
  return { id: uid('b'), type: 'diagram', spec, heightRules }
}

function page(index: number, blocks: Block[]): Page {
  return { id: uid('p'), index, presetId: defaultPresetId, blocks, strokes: [] }
}

// Two bare circles with a heading above and no universal-set box, drawn straight as
// a custom scene. These are the intersection and union figures, which the sample
// shows without a rectangle, and they double as a demonstration of the free-form
// engine.
function pairScene(heading: string, shade: 'intersection' | 'union', caption?: string): DiagramScene {
  const W = 100
  const H = 52
  const cy = 30
  const rx = 19
  const ry = 14
  const lcx = 38
  const rcx = 58
  const shapes: DiagramScene['shapes'] = [
    { type: 'label', at: { x: W / 2, y: 8 }, text: heading, color: C.ink, size: 4.4, anchor: 'middle' },
  ]
  if (shade === 'intersection') {
    shapes.push({ type: 'ellipse', cx: (lcx + rcx) / 2, cy, rx: rx * 0.5, ry: ry * 0.82, color: 'none', fill: 'rgba(126,63,138,0.18)' })
  } else {
    shapes.push({ type: 'ellipse', cx: lcx, cy, rx, ry, color: 'none', fill: 'rgba(190,180,90,0.15)' })
    shapes.push({ type: 'ellipse', cx: rcx, cy, rx, ry, color: 'none', fill: 'rgba(190,180,90,0.15)' })
  }
  shapes.push({ type: 'ellipse', cx: lcx, cy, rx, ry, color: C.penBlue })
  shapes.push({ type: 'ellipse', cx: rcx, cy, rx, ry, color: C.penRed })
  shapes.push({ type: 'label', at: { x: lcx - 8, y: cy }, text: 'A', color: C.penBlue, size: 4.2 })
  shapes.push({ type: 'label', at: { x: rcx + 8, y: cy }, text: 'B', color: C.penRed, size: 4.2 })
  if (shade === 'intersection') {
    shapes.push({ type: 'label', at: { x: (lcx + rcx) / 2, y: cy }, text: 'A∩B', color: PURPLE, size: 3.6 })
  }
  if (caption) {
    shapes.push({ type: 'label', at: { x: W / 2, y: H - 3 }, text: caption, color: C.ink, size: 3.4 })
  }
  return { canvas: { width: W, height: H }, shapes }
}

// The four categorical propositions as one figure: a heading, then four rows each
// with a title, a miniature two-circle layout, and a caption to its right.
function propositionScene(): DiagramScene {
  const W = 100
  const rowH = 20
  const H = 12 + rowH * 4
  const shapes: DiagramScene['shapes'] = [
    { type: 'label', at: { x: 4, y: 8 }, text: 'Four Categorical Propositions:', color: C.ink, size: 4, anchor: 'start' },
  ]
  const rows: Array<{ n: string; layout: 'subset' | 'disjoint' | 'overlap' | 'some-not'; caption: string }> = [
    { n: '1. All A are B', layout: 'subset', caption: 'A inside B' },
    { n: '2. No A are B', layout: 'disjoint', caption: 'A and B apart' },
    { n: '3. Some A are B', layout: 'overlap', caption: 'A and B overlap' },
    { n: '4. Some A are not B', layout: 'some-not', caption: 'Part of A outside B' },
  ]
  rows.forEach((row, i) => {
    const top = 12 + i * rowH
    const cy = top + rowH * 0.55
    const cx = 22
    shapes.push({ type: 'label', at: { x: 8, y: top + 4 }, text: row.n, color: C.ink, size: 3.6, anchor: 'start' })
    const rx = 8
    const ry = 5.5
    if (row.layout === 'subset') {
      shapes.push({ type: 'ellipse', cx, cy, rx, ry, color: C.penBlue })
      shapes.push({ type: 'ellipse', cx, cy, rx: rx * 0.5, ry: ry * 0.5, color: C.penRed })
    } else if (row.layout === 'disjoint') {
      shapes.push({ type: 'ellipse', cx: cx - 6, cy, rx, ry, color: C.penBlue })
      shapes.push({ type: 'ellipse', cx: cx + 8, cy, rx, ry, color: C.penRed })
    } else if (row.layout === 'overlap') {
      shapes.push({ type: 'ellipse', cx: cx - 4, cy, rx, ry, color: C.penBlue })
      shapes.push({ type: 'ellipse', cx: cx + 4, cy, rx, ry, color: C.penRed })
    } else {
      shapes.push({ type: 'ellipse', cx: cx - 3, cy, rx, ry, color: C.penBlue })
      shapes.push({ type: 'ellipse', cx: cx + 6, cy, rx: rx * 0.7, ry, color: C.penRed })
    }
    shapes.push({ type: 'label', at: { x: 44, y: cy + 1 }, text: row.caption, color: C.ink, size: 3.2, anchor: 'start' })
  })
  return { canvas: { width: W, height: H }, shapes }
}

function buildPages(): Page[] {
  return [
    page(0, [
      text('title', 'Unit 1C: Sets and Venn Diagrams'),
      text('heading', 'What is a Set?'),
      text('body', 'A set is simply a collection of objects. The objects inside a set are called members or elements. We use curly braces to list the members of a set.', { align: 'justify' }),
      text('body', 'For example, if I define A = {1, 2, 3, 4, 5}, then A is a set containing five numbers. We say 3 is a member of A and write 3 ∈ A. If something is not in the set, like 7, we write 7 ∉ A.', { align: 'justify' }),
      text('heading', 'More examples of sets:'),
      text('body', 'The set of all states in the US. The set of all students in this class. The set of all prime numbers. Sets can contain anything, not just numbers.', { align: 'justify' }),
      text('heading', 'Set Notation:', { indent: 16 }),
      text('body', 'A = {1, 2, 3, 4, 5}', { indent: 16, color: C.penBlue }),
      text('body', 'B = {3, 4, 5, 6, 7}', { indent: 16, color: C.penBlue }),
      text('body', '3 ∈ A  (3 is a member of A)', { indent: 16 }),
      text('body', '7 ∉ A  (7 is NOT a member of A)', { indent: 16 }),
      text('body', 'A ∩ B = {3, 4, 5}    A ∪ B = {1, 2, 3, 4, 5, 6, 7}', { indent: 16 }),
      text('heading', 'Subsets'),
      text('body', 'Set A is a subset of set B if every single member of A is also a member of B. We write A ⊆ B. For example, {1, 2, 3} ⊆ {1, 2, 3, 4, 5} because every element in the first set is also in the second.', { align: 'justify' }),
      text('body', 'Two important facts: every set is a subset of itself, and the empty set {} is a subset of every set.', { align: 'justify' }),
    ]),
    page(1, [
      text('title', 'Venn Diagrams'),
      text('body', 'A Venn diagram is a visual tool for representing sets. We draw circles (or ovals) inside a rectangle. The rectangle represents the universal set, which is everything under consideration. Each circle represents a particular set.', { align: 'justify' }),
      text('heading', 'Three types of relationships:'),
      text('body', '1. Subset: If all members of A are also in B, we draw circle A entirely inside circle B. Example: All dogs are mammals, so the Dogs circle goes inside the Mammals circle.', { align: 'justify' }),
      diagram(
        {
          kind: 'venn-subset',
          universeLabel: 'U (All Animals)',
          outer: { label: 'Mammals', color: C.penBlue },
          inner: { label: 'Dogs', color: C.penRed },
          caption: 'All dogs are mammals (Dogs ⊆ Mammals)',
        },
        9,
      ),
      text('body', '2. Overlapping: If some members are shared but not all, the circles partially overlap. The overlapping region contains members that belong to both sets.', { align: 'justify' }),
    ]),
    page(2, [
      text('title', 'Overlapping and Disjoint Sets'),
      text('body', 'When two sets share some members but not all, we call them overlapping sets. Think of Athletes and Honor Students at a school. Some students are both athletes and honor students, so the circles overlap.', { align: 'justify' }),
      diagram(
        {
          kind: 'venn-overlap',
          universeLabel: 'U (All Students)',
          left: { label: 'Athletes', color: C.penBlue },
          right: { label: 'Honor St', color: C.penRed },
          middleLabel: 'Both',
          middleColor: PURPLE,
          caption: 'Some athletes are honor students (overlapping)',
        },
        9,
      ),
      text('body', 'When two sets share NO members at all, we call them disjoint sets. The circles do not touch. Example: Cats and Dogs. No animal is both a cat and a dog, so the circles are completely separate.', { align: 'justify' }),
      diagram(
        {
          kind: 'venn-disjoint',
          universeLabel: 'U (All Animals)',
          left: { label: 'Cats', color: C.penBlue },
          right: { label: 'Dogs', color: C.penRed },
          caption: 'No cats are dogs (disjoint sets)',
        },
        9,
      ),
    ]),
    page(3, [
      text('title', 'Intersection and Union'),
      text('heading', 'Intersection (A ∩ B)'),
      text('body', 'The intersection of A and B is the set of all elements that are in BOTH A and B. On a Venn diagram, it is the overlapping region where both circles meet.', { align: 'justify' }),
      text('body', 'Example: If A = {1, 2, 3, 4} and B = {3, 4, 5, 6}, then A ∩ B = {3, 4}. Only 3 and 4 appear in both sets.', { align: 'justify' }),
      text('heading', 'Union (A ∪ B)'),
      text('body', 'The union of A and B is the set of all elements that are in A OR B or both. On a Venn diagram, it is everything covered by either circle.', { align: 'justify' }),
      text('body', 'Example: If A = {1, 2, 3, 4} and B = {3, 4, 5, 6}, then A ∪ B = {1, 2, 3, 4, 5, 6}. We combine everything from both sets, but we do not repeat elements.', { align: 'justify' }),
      diagram({ kind: 'scene', scene: pairScene('Intersection (A ∩ B)', 'intersection') }, 6),
      diagram({ kind: 'scene', scene: pairScene('Union (A ∪ B)', 'union', 'Everything in A or B or both') }, 6),
    ]),
    page(4, [
      text('title', 'Categorical Propositions'),
      text('body', 'There are four types of categorical propositions that describe how two sets relate to each other. Each one has a specific Venn diagram representation:', { align: 'justify' }),
      text('body', '1. "All A are B" means A is a subset of B. Every member of A is also in B. Draw circle A entirely inside circle B.', { align: 'justify' }),
      text('body', '2. "No A are B" means A and B are disjoint. They share no members. Draw two separate circles that do not touch.', { align: 'justify' }),
      text('body', '3. "Some A are B" means A and B overlap. At least one member is in both sets. Draw two circles that partially overlap.', { align: 'justify' }),
      text('body', '4. "Some A are not B" means part of A is outside B. At least one member of A is not in B. Draw A so that some portion extends beyond B.', { align: 'justify' }),
      diagram({ kind: 'scene', scene: propositionScene() }, 13),
    ]),
    page(5, [
      text('title', 'Three-Set Venn Diagrams'),
      text('body', 'When we have three sets, we draw three overlapping circles. This creates 8 distinct regions. Each region represents a unique combination of being inside or outside each of the three sets.', { align: 'justify' }),
      text('body', 'For example, the center region where all three circles overlap represents elements that belong to A AND B AND C simultaneously. A region inside A and B but outside C represents elements in both A and B but not in C.', { align: 'justify' }),
      diagram(
        {
          kind: 'venn-three',
          universeLabel: 'U',
          a: { label: 'A', color: C.penBlue },
          b: { label: 'B', color: C.penRed },
          c: { label: 'C', color: C.penGreen },
          centerLabel: 'All 3',
          caption: '3 circles create 8 distinct regions',
        },
        11,
      ),
      text('body', 'The 8 regions are: only A, only B, only C, A and B only, A and C only, B and C only, all three, and none of them (outside all circles but inside the rectangle).', { align: 'justify' }),
    ]),
    page(6, [
      text('title', 'Quick Reference Summary'),
      text('heading', 'Key Definitions:'),
      text('body', 'Set: a collection of objects (members/elements)'),
      text('body', "Member notation: ∈ means 'is in', ∉ means 'is not in'"),
      text('body', 'Subset (A ⊆ B): every element of A is also in B'),
      text('body', 'Overlapping: sets share some members'),
      text('body', 'Disjoint: sets share NO members'),
      text('heading', 'Operations:'),
      text('body', 'Intersection (A ∩ B): elements in BOTH A and B'),
      text('body', 'Union (A ∪ B): elements in A OR B or both'),
      text('heading', 'Categorical Propositions:'),
      text('body', 'All A are B = A ⊆ B (A inside B)'),
      text('body', 'No A are B = disjoint (circles apart)'),
      text('body', 'Some A are B = overlapping (circles partially overlap)'),
      text('body', 'Some A are not B = part of A outside B'),
      text('heading', 'Venn Diagram Facts:'),
      text('body', 'Rectangle = universal set (everything)'),
      text('body', '2 circles = up to 4 regions'),
      text('body', '3 circles = up to 8 regions'),
      text('body', 'Empty set {} is a subset of every set'),
      text('body', 'Every set is a subset of itself'),
    ]),
  ]
}

export function referenceDocument(): NoteDocument {
  const now = Date.now()
  return {
    id: uid('doc'),
    title: 'Unit 1C: Sets and Venn Diagrams',
    pages: buildPages(),
    createdAt: now,
    updatedAt: now,
  }
}
