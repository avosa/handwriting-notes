import { describe, it, expect } from 'vitest'
import { stripDashes, hasProseDash, lintNote } from '@/ai/noteLint'

describe('noteLint', () => {
  it('removes em and en dashes used as punctuation', () => {
    expect(stripDashes('sets are equal — always')).toBe('sets are equal, always')
    expect(stripDashes('a set – a collection')).toBe('a set, a collection')
  })

  it('turns a spaced hyphen into a comma', () => {
    expect(stripDashes('a subset - every member')).toBe('a subset, every member')
  })

  it('keeps hyphens inside compound words', () => {
    expect(stripDashes('Three-Set Venn Diagrams')).toBe('Three-Set Venn Diagrams')
    expect(stripDashes('light-blue college-ruled')).toBe('light-blue college-ruled')
  })

  it('detects a remaining prose dash', () => {
    expect(hasProseDash('a — b')).toBe(true)
    expect(hasProseDash('Three-Set')).toBe(false)
  })

  it('collapses extra blank lines when linting a whole note', () => {
    expect(lintNote('one\n\n\n\ntwo')).toBe('one\n\ntwo')
  })
})
