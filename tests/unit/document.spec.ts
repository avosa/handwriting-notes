import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDocument } from '@/store/document'
import type { Block } from '@/types'

describe('document store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('opens on one blank page with a single empty line', () => {
    const doc = useDocument()
    expect(doc.doc.pages).toHaveLength(1)
    expect(doc.doc.pages[0].blocks).toHaveLength(1)
    const first = doc.doc.pages[0].blocks[0]
    expect(first.type).toBe('text')
  })

  it('inserts a heading after a block and can retype its role', () => {
    const doc = useDocument()
    const firstId = doc.doc.pages[0].blocks[0].id
    const id = doc.addParagraphAfter(firstId, 'heading')
    const block = doc.locate(id)?.block
    expect(block?.type === 'text' && block.text.role).toBe('heading')
    doc.setRole(id, 'title')
    expect(doc.locate(id)?.block).toMatchObject({ text: { role: 'title' } })
  })

  it('breaks a page so the rest continues on a new one', () => {
    const doc = useDocument()
    const firstId = doc.doc.pages[0].blocks[0].id
    const second = doc.addParagraphAfter(firstId, 'body')
    doc.breakPageAt(firstId)
    expect(doc.doc.pages).toHaveLength(2)
    expect(doc.locate(second)?.pageIndex).toBe(1)
  })

  it('writes into the blank first page instead of opening a second one', () => {
    const doc = useDocument()
    const pageIndex = doc.beginAiPage()
    expect(pageIndex).toBe(0)
    expect(doc.doc.pages).toHaveLength(1)
    expect(doc.doc.pages[0].blocks).toHaveLength(0)
    doc.appendAiBlock(0, { id: 'b1', type: 'text', text: { id: 't1', role: 'body', runs: [{ text: 'Hello' }] } })
    doc.endAi()
    // The note stays a single page and rests on the line just written.
    expect(doc.doc.pages).toHaveLength(1)
    expect(doc.selectedBlockId).toBe('b1')
  })

  it('continues on a fresh page when the current one already holds writing', () => {
    const doc = useDocument()
    doc.setRuns(doc.doc.pages[0].blocks[0].id, [{ text: 'Existing note' }])
    const pageIndex = doc.beginAiPage()
    expect(pageIndex).toBe(1)
    expect(doc.doc.pages).toHaveLength(2)
    doc.appendAiBlock(1, { id: 'b2', type: 'text', text: { id: 't2', role: 'body', runs: [{ text: 'More' }] } })
    doc.endAi()
    expect(doc.selectedBlockId).toBe('b2')
  })

  it('adds to the note without wiping what the writer already has', () => {
    const doc = useDocument()
    const first = doc.doc.pages[0].blocks[0].id
    doc.setRuns(first, [{ text: 'Original note the writer keeps' }])
    const plain = () =>
      doc.doc.pages
        .flatMap((p) => p.blocks)
        .map((b) => (b.type === 'text' ? b.text.runs.map((r) => r.text).join('') : ''))
        .join(' ')

    doc.beginAiPage()
    doc.appendAiBlock(1, {
      id: 'a1',
      type: 'text',
      text: { id: 't', role: 'body', runs: [{ text: 'Added by the AI' }] },
    })
    doc.endAi()
    // Both the original and the added writing are present; nothing was wiped.
    expect(plain()).toContain('Original note the writer keeps')
    expect(plain()).toContain('Added by the AI')
  })

  it('restores a blank line when a run on the only page produced nothing', () => {
    const doc = useDocument()
    doc.beginAiPage()
    doc.endAi()
    expect(doc.doc.pages).toHaveLength(1)
    expect(doc.doc.pages[0].blocks).toHaveLength(1)
    expect(doc.doc.pages[0].blocks[0].type).toBe('text')
  })

  it('drops an empty continuation page a failed run left behind', () => {
    const doc = useDocument()
    doc.setRuns(doc.doc.pages[0].blocks[0].id, [{ text: 'Existing note' }])
    doc.beginAiPage()
    doc.endAi()
    expect(doc.doc.pages).toHaveLength(1)
    expect(doc.activePageIndex).toBe(0)
  })

  it('turns the current paragraph into a one item list, keeping its words', () => {
    const doc = useDocument()
    const first = doc.doc.pages[0].blocks[0].id
    doc.setRuns(first, [{ text: 'Hello world' }])
    const id = doc.convertToList(first, true)
    const block = doc.locate(id)!.block
    expect(block.type).toBe('list')
    expect(block.type === 'list' && block.items[0][0].text).toBe('Hello world')
    // The paragraph became the list; it is not left behind as a separate line.
    expect(doc.doc.pages[0].blocks.filter((b) => b.type === 'text')).toHaveLength(0)
  })

  // A small page of a paragraph, an ordered list of three, then another paragraph, used to
  // exercise selecting and acting on a run of lines across blocks.
  function seedLines() {
    const doc = useDocument()
    doc.doc.pages[0].blocks = [
      { id: 'p1', type: 'text', text: { id: 't1', role: 'body', runs: [{ text: 'alpha' }] } },
      { id: 'l1', type: 'list', ordered: true, items: [[{ text: 'one' }], [{ text: 'two' }], [{ text: 'three' }]] },
      { id: 'p2', type: 'text', text: { id: 't2', role: 'body', runs: [{ text: 'beta' }] } },
    ]
    return doc
  }
  const plainOf = (block: Block | undefined) =>
    block && block.type === 'text' ? block.text.runs.map((r) => r.text).join('') : ''

  it('selects a range of lines between the anchor and a shift-clicked line', () => {
    const doc = seedLines()
    doc.setLineAnchor('l1', 0)
    doc.selectLineRange(0, { blockId: 'l1', item: 2 })
    expect(doc.lineSelection?.refs).toHaveLength(3)
    expect(doc.isLineSelected('l1', 1)).toBe(true)
    expect(doc.isLineSelected('p1', null)).toBe(false)
  })

  it('shouts a run of selected lines in one action', () => {
    const doc = seedLines()
    doc.lineSelection = {
      pageIndex: 0,
      refs: [
        { blockId: 'p1', item: null },
        { blockId: 'l1', item: 0 },
      ],
    }
    doc.setCaseForLines('upper')
    expect(plainOf(doc.locate('p1')?.block)).toBe('ALPHA')
    const list = doc.locate('l1')?.block
    expect(list?.type === 'list' && list.items[0][0].text).toBe('ONE')
    // A line outside the selection is untouched.
    expect(list?.type === 'list' && list.items[1][0].text).toBe('two')
  })

  it('bolds selected lines and toggles the emphasis off when all already carry it', () => {
    const doc = seedLines()
    doc.lineSelection = {
      pageIndex: 0,
      refs: [
        { blockId: 'l1', item: 0 },
        { blockId: 'l1', item: 1 },
      ],
    }
    doc.applyMarkToLines('bold')
    const list = () => doc.locate('l1')?.block
    const b = list()
    expect(b?.type === 'list' && b.items[0][0].bold).toBe(true)
    doc.applyMarkToLines('bold')
    const b2 = list()
    expect(b2?.type === 'list' && b2.items[0][0].bold).toBeUndefined()
  })

  it('merges a run of lines into one paragraph, splitting the list around it', () => {
    const doc = seedLines()
    // Select the last two list items and the paragraph after them.
    doc.lineSelection = {
      pageIndex: 0,
      refs: [
        { blockId: 'l1', item: 1 },
        { blockId: 'l1', item: 2 },
        { blockId: 'p2', item: null },
      ],
    }
    doc.mergeSelectedLines()
    const blocks = doc.doc.pages[0].blocks
    // alpha paragraph, the list now holding only 'one', then the merged paragraph.
    expect(blocks[0].id).toBe('p1')
    const keptList = blocks[1]
    expect(keptList.type === 'list' && keptList.items).toHaveLength(1)
    expect(keptList.type === 'list' && keptList.items[0][0].text).toBe('one')
    expect(plainOf(blocks[2])).toBe('two three beta')
    expect(blocks).toHaveLength(3)
    expect(doc.lineSelection).toBeNull()
  })

  it('drops a picture into the column after a line and resizes it within bounds', () => {
    const doc = useDocument()
    const first = doc.doc.pages[0].blocks[0].id
    const id = doc.insertImage(first, 'img_1', 'a shell', 10)
    const block = doc.locate(id)!.block
    expect(block.type).toBe('image')
    expect(block.type === 'image' && block.blobRef).toBe('img_1')
    doc.setFigureHeight(id, 100)
    expect((doc.locate(id)!.block as { heightRules: number }).heightRules).toBe(40)
    doc.setFigureHeight(id, 1)
    expect((doc.locate(id)!.block as { heightRules: number }).heightRules).toBe(4)
  })

  it('rules a page on a chosen paper, per page', () => {
    const doc = useDocument()
    doc.setPagePreset(0, 'grid')
    expect(doc.doc.pages[0].presetId).toBe('grid')
    doc.setPagePreset(0, 'blank')
    expect(doc.doc.pages[0].presetId).toBe('blank')
  })

  it('starts a task list with one clear tick and toggles a tick by index', () => {
    const doc = useDocument()
    const first = doc.doc.pages[0].blocks[0].id
    const id = doc.addTaskList(first)
    const block = doc.locate(id)!.block
    expect(block.type === 'list' && block.checked).toEqual([false])
    doc.toggleListCheck(id, 0)
    expect((doc.locate(id)!.block as { checked: boolean[] }).checked[0]).toBe(true)
    doc.toggleListCheck(id, 0)
    expect((doc.locate(id)!.block as { checked: boolean[] }).checked[0]).toBe(false)
    // Out of range is ignored rather than growing the array.
    doc.toggleListCheck(id, 5)
    expect((doc.locate(id)!.block as { checked: boolean[] }).checked).toHaveLength(1)
  })

  it('emphasises a quote along with the rest when the whole note is styled', () => {
    const doc = useDocument()
    doc.doc.pages[0].blocks.push({ id: 'q', type: 'quote', runs: [{ text: 'a saying' }] })
    doc.applyMarkToAll('bold')
    const quote = doc.locate('q')!.block
    expect(quote.type === 'quote' && quote.runs.every((r) => r.bold)).toBe(true)
  })

  it('flows a heading up to the page above keeping its formatting, and joins a plain line', () => {
    const heading = useDocument()
    heading.doc.pages = [
      {
        id: 'p0',
        index: 0,
        presetId: '1C',
        blocks: [{ id: 'a', type: 'text', text: { id: 'ta', role: 'body', runs: [{ text: 'alpha' }] } }],
        strokes: [],
      },
      {
        id: 'p1',
        index: 1,
        presetId: '1C',
        blocks: [{ id: 'h', type: 'text', text: { id: 'th', role: 'heading', runs: [{ text: 'Chapter' }] } }],
        strokes: [],
      },
    ] as never
    heading.mergeToPrevPageEnd('h', [{ text: 'Chapter' }])
    expect(heading.doc.pages).toHaveLength(1)
    const moved = heading.locate('h')!.block
    expect(moved.type === 'text' && moved.text.role).toBe('heading')

    const body = useDocument()
    body.doc.pages = [
      {
        id: 'p0',
        index: 0,
        presetId: '1C',
        blocks: [{ id: 'a', type: 'text', text: { id: 'ta', role: 'body', runs: [{ text: 'alpha' }] } }],
        strokes: [],
      },
      {
        id: 'p1',
        index: 1,
        presetId: '1C',
        blocks: [{ id: 'b', type: 'text', text: { id: 'tb', role: 'body', runs: [{ text: 'beta' }] } }],
        strokes: [],
      },
    ] as never
    body.mergeToPrevPageEnd('b', [{ text: 'beta' }])
    expect(body.doc.pages).toHaveLength(1)
    const a = body.locate('a')!.block
    expect(a.type === 'text' && a.text.runs.map((r) => r.text).join('')).toBe('alphabeta')
  })

  it('fills a stroke by id', () => {
    const doc = useDocument()
    doc.addStroke(0, { id: 's1', tool: 'fine', color: '#000', width: 1, points: [{ x: 0, y: 0, pressure: 1 }] })
    doc.fillStroke(0, 's1', '#4A72B0')
    expect(doc.doc.pages[0].strokes[0].fill).toBe('#4A72B0')
  })
})
