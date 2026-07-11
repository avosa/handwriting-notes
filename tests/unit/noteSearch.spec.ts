import { describe, it, expect, vi, beforeEach } from 'vitest'

// A tiny fake library: two notes whose plain text is returned by the mocked exporter.
vi.mock('@/store/persistence', () => ({
  loadAllNotes: async () => [
    { id: 'a', title: 'Chemistry' },
    { id: 'b', title: 'History' },
  ],
}))
vi.mock('@/export/toText', () => ({
  toPlainText: (n: { id: string }) =>
    n.id === 'a' ? 'The mole is a unit of amount in chemistry.' : 'The French revolution began in 1789.',
}))

import { buildSearchIndex, useNoteSearch } from '@/home/noteSearch'

describe('note search', () => {
  beforeEach(async () => {
    await buildSearchIndex()
  })

  it('matches on title or body, and narrows on multiple terms', () => {
    const { matches } = useNoteSearch()
    expect(matches('a', 'Chemistry', 'mole')).toBe(true) // body
    expect(matches('a', 'Chemistry', 'chemistry')).toBe(true) // title or body
    expect(matches('b', 'History', 'revolution')).toBe(true)
    expect(matches('b', 'History', 'mole')).toBe(false)
    // Both terms must be present.
    expect(matches('b', 'History', 'french revolution')).toBe(true)
    expect(matches('b', 'History', 'french chemistry')).toBe(false)
    // An empty query matches everything.
    expect(matches('a', 'Chemistry', '')).toBe(true)
  })

  it('returns a snippet around the first matched term', () => {
    const { snippet } = useNoteSearch()
    const s = snippet('a', 'mole')
    expect(s.toLowerCase()).toContain('mole')
  })

  it('tolerates a small typo in a longer term', () => {
    const { matches } = useNoteSearch()
    // One dropped/added/wrong letter on a long word still finds the note.
    expect(matches('a', 'Chemistry', 'chemsitry')).toBe(true) // transposed
    expect(matches('a', 'Chemistry', 'chemistrry')).toBe(true) // doubled letter
    expect(matches('b', 'History', 'revolotion')).toBe(true) // wrong vowel
    // A short term must still be exact, so a typo does not match an unrelated word.
    expect(matches('a', 'Chemistry', 'xxx')).toBe(false)
    // A far-off word is not dragged in by tolerance.
    expect(matches('b', 'History', 'chemistry')).toBe(false)
  })

  it('centres a snippet on a near-miss word when there was no exact hit', () => {
    const { snippet } = useNoteSearch()
    const s = snippet('a', 'chemsitry')
    expect(s.toLowerCase()).toContain('chemistry')
  })
})
