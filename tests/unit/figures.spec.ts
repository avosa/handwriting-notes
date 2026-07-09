import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDocument } from '@/store/document'

describe('dynamic tables', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('adds and removes columns, keeping every row in step and at least one column', () => {
    const doc = useDocument()
    const id = doc.addTable(null, 2, 2)
    doc.addTableColumn(id)
    let table = doc.locate(id)!.block as Extract<(typeof doc.doc.pages)[0]['blocks'][0], { type: 'table' }>
    expect(table.header).toHaveLength(3)
    expect(table.rows.every((r) => r.length === 3)).toBe(true)

    doc.removeTableColumn(id, 1)
    table = doc.locate(id)!.block as typeof table
    expect(table.header).toHaveLength(2)
    expect(table.rows.every((r) => r.length === 2)).toBe(true)

    doc.removeTableColumn(id, 0)
    table = doc.locate(id)!.block as typeof table
    expect(table.header).toHaveLength(1)
    doc.removeTableColumn(id, 0) // the last column is kept
    table = doc.locate(id)!.block as typeof table
    expect(table.header).toHaveLength(1)
  })

  it('adds and removes rows, keeping at least one body row', () => {
    const doc = useDocument()
    const id = doc.addTable(null, 3, 1)
    doc.addTableRow(id)
    let table = doc.locate(id)!.block as Extract<(typeof doc.doc.pages)[0]['blocks'][0], { type: 'table' }>
    expect(table.rows).toHaveLength(2)
    expect(table.rows[1]).toHaveLength(3)
    doc.removeTableRow(id, 0)
    table = doc.locate(id)!.block as typeof table
    expect(table.rows).toHaveLength(1)
    doc.removeTableRow(id, 0) // the last row is kept
    table = doc.locate(id)!.block as typeof table
    expect(table.rows).toHaveLength(1)
  })
})

describe('dynamic callouts', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('adds and removes boxes and lines, keeping one of each', () => {
    const doc = useDocument()
    const id = doc.addCallouts(null, [{ color: '#4A72B0', heading: [{ text: 'A' }], items: [[{ text: '' }]] }])
    doc.addCalloutBox(id)
    let callouts = doc.locate(id)!.block as Extract<(typeof doc.doc.pages)[0]['blocks'][0], { type: 'callouts' }>
    expect(callouts.boxes).toHaveLength(2)

    doc.addCalloutItem(id, 0)
    callouts = doc.locate(id)!.block as typeof callouts
    expect(callouts.boxes[0].items).toHaveLength(2)
    doc.removeCalloutItem(id, 0, 0)
    callouts = doc.locate(id)!.block as typeof callouts
    expect(callouts.boxes[0].items).toHaveLength(1)
    doc.removeCalloutItem(id, 0, 0) // the last line is kept
    callouts = doc.locate(id)!.block as typeof callouts
    expect(callouts.boxes[0].items).toHaveLength(1)

    doc.removeCalloutBox(id, 1)
    callouts = doc.locate(id)!.block as typeof callouts
    expect(callouts.boxes).toHaveLength(1)
    doc.removeCalloutBox(id, 0) // the last box is kept
    callouts = doc.locate(id)!.block as typeof callouts
    expect(callouts.boxes).toHaveLength(1)
  })
})

describe('free-world placement', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('drops an inserted figure where the writer last pointed, on that page, and floats it', () => {
    const doc = useDocument()
    doc.doc.pages.push({ ...doc.doc.pages[0], id: 'p2', index: 1, blocks: [] })
    doc.setLastPoint(1, 40, 60)
    const id = doc.addTable(null, 2, 1)
    // The figure lives on page two (where the point was), not page one.
    expect(doc.doc.pages[1].blocks.some((b) => b.id === id)).toBe(true)
    expect(doc.doc.pages[0].blocks.some((b) => b.id === id)).toBe(false)
    const loc = doc.locate(id)!
    expect(loc.block.float).toEqual({ x: 40, y: 60, width: 84 })
  })

  it('drags a floating figure and clamps it to non-negative coordinates', () => {
    const doc = useDocument()
    doc.setLastPoint(0, 30, 30)
    const id = doc.addDiagram(null, {
      id: 'd',
      type: 'diagram',
      heightRules: 12,
      spec: { kind: 'triangle', direction: 'up', topLabel: 'A', bottomLabel: 'B', color: '#4A72B0' },
    })
    doc.moveFloat(id, 120, 90)
    expect(doc.locate(id)!.block.float).toMatchObject({ x: 120, y: 90 })
    doc.moveFloat(id, -50, -50)
    expect(doc.locate(id)!.block.float).toMatchObject({ x: 0, y: 0 })
  })

  it('docks a floating figure back into the flow and pops it out again', () => {
    const doc = useDocument()
    doc.setLastPoint(0, 20, 20)
    const id = doc.addCallouts(null, [{ color: '#4A72B0', heading: [{ text: 'A' }], items: [[{ text: '' }]] }])
    expect(doc.locate(id)!.block.float).toBeTruthy()
    doc.dockFigure(id)
    expect(doc.locate(id)!.block.float).toBeUndefined()
    doc.popOutFigure(id)
    expect(doc.locate(id)!.block.float).toBeTruthy()
  })
})

describe('font size', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('sizes the free note the caret is in, not a stale block selection', () => {
    const doc = useDocument()
    // A paragraph is selected first, then the caret moves into a free note.
    const para = doc.doc.pages[0].blocks[0].id
    doc.select(para)
    const noteId = doc.addNote(0, 20, 30)
    doc.selectNote(0, noteId)
    doc.nudgeSelectionFontScale(0.2)
    // The note grew; the earlier block was left alone.
    const note = doc.doc.pages[0].notes!.find((n) => n.id === noteId)
    expect(note!.scale).toBeCloseTo(1.2, 5)
    expect(doc.locate(para)!.block.scale).toBeUndefined()
  })

  it('makes the free note the caret is in a heading, not a stale block', () => {
    const doc = useDocument()
    const para = doc.doc.pages[0].blocks[0].id
    doc.select(para)
    const noteId = doc.addNote(0, 20, 30)
    doc.selectNote(0, noteId)
    doc.setSelectionRole('heading')
    expect(doc.doc.pages[0].notes!.find((n) => n.id === noteId)!.role).toBe('heading')
    // The earlier paragraph keeps its role.
    const block = doc.locate(para)!.block
    expect(block.type === 'text' ? block.text.role : null).not.toBe('heading')
  })

  it('nudges a block scale up and down and clamps it', () => {
    const doc = useDocument()
    const id = doc.addTable(null, 2, 1)
    doc.nudgeFontScale(id, 0.2)
    expect(doc.locate(id)!.block.scale).toBeCloseTo(1.2, 5)
    doc.nudgeFontScale(id, -0.4)
    expect(doc.locate(id)!.block.scale).toBeCloseTo(0.8, 5)
    doc.setFontScale(id, 9)
    expect(doc.locate(id)!.block.scale).toBe(2.4)
    doc.setFontScale(id, 0)
    expect(doc.locate(id)!.block.scale).toBe(0.6)
  })
})

describe('dynamic diagrams', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('resizes within bounds', () => {
    const doc = useDocument()
    const id = doc.addDiagram(null, {
      id: 'x',
      type: 'diagram',
      heightRules: 12,
      spec: { kind: 'triangle', direction: 'up', topLabel: 'A', bottomLabel: 'B', color: '#4A72B0' },
    })
    doc.setDiagramHeight(id, 100)
    expect((doc.locate(id)!.block as { heightRules: number }).heightRules).toBe(40)
    doc.setDiagramHeight(id, 1)
    expect((doc.locate(id)!.block as { heightRules: number }).heightRules).toBe(4)
  })

  it('flattens a named diagram to an editable scene and sets a label', async () => {
    const doc = useDocument()
    const id = doc.addDiagram(null, {
      id: 'x',
      type: 'diagram',
      heightRules: 12,
      spec: { kind: 'triangle', direction: 'up', topLabel: 'A', bottomLabel: 'B', color: '#4A72B0' },
    })
    // The first label shape in the flattened scene is the top label ('A'); change it.
    const block = doc.locate(id)!.block as Extract<(typeof doc.doc.pages)[0]['blocks'][0], { type: 'diagram' }>
    const { toScene } = await import('@/diagrams/diagramSpec')
    const labelIndex = toScene(block.spec).shapes.findIndex((s) => s.type === 'label' && s.text === 'A')
    doc.setDiagramLabel(id, labelIndex, 'Specific')
    const after = doc.locate(id)!.block as typeof block
    expect(after.spec.kind).toBe('scene')
    const scene = after.spec.kind === 'scene' ? after.spec.scene : null
    expect(scene?.shapes.some((s) => s.type === 'label' && s.text === 'Specific')).toBe(true)
  })
})
