import { describe, it, expect } from 'vitest'
import { slicedRuns } from '@/compose/useAi'

describe('typewriter run slicing', () => {
  it('reveals a growing prefix that keeps each run’s emphasis', () => {
    const full = [{ text: 'Bold', bold: true }, { text: ' then plain' }]
    // Within the first run: still one bold run of the first three letters.
    expect(slicedRuns(full, 3)).toEqual([{ text: 'Bol', bold: true }])
    // Across the boundary: the whole bold run plus the start of the plain run.
    expect(slicedRuns(full, 6)).toEqual([{ text: 'Bold', bold: true }, { text: ' t' }])
    // The full length returns every run unchanged.
    expect(slicedRuns(full, 15)).toEqual(full)
  })

  it('never returns an empty list, so an editable always has a run', () => {
    expect(slicedRuns([{ text: 'hi' }], 0)).toEqual([{ text: '' }])
  })
})
