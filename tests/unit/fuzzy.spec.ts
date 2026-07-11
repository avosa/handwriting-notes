import { describe, it, expect } from 'vitest'
import { boundedLevenshtein, editBudget, fuzzyHit } from '@/util/fuzzy'

describe('boundedLevenshtein', () => {
  it('counts single edits of each kind', () => {
    expect(boundedLevenshtein('cat', 'cat', 2)).toBe(0)
    expect(boundedLevenshtein('cat', 'cot', 2)).toBe(1) // substitution
    expect(boundedLevenshtein('cat', 'cats', 2)).toBe(1) // insertion
    expect(boundedLevenshtein('cats', 'cat', 2)).toBe(1) // deletion
    expect(boundedLevenshtein('chemsitry', 'chemistry', 2)).toBe(2) // transposition = 2 edits
  })

  it('stops counting past the ceiling', () => {
    // Whatever the true distance, a bounded call never reports more than max + 1.
    expect(boundedLevenshtein('apple', 'orange', 1)).toBe(2)
    expect(boundedLevenshtein('a', 'bbbbbbb', 2)).toBe(3)
  })
})

describe('editBudget', () => {
  it('demands exactness for short terms and loosens for long ones', () => {
    expect(editBudget(3)).toBe(0)
    expect(editBudget(5)).toBe(1)
    expect(editBudget(9)).toBe(2)
  })
})

describe('fuzzyHit', () => {
  it('matches a substring, an exact word, or a near-miss within budget', () => {
    const tokens = ['chemistry', 'reaction', 'mole']
    expect(fuzzyHit(tokens, 'chem')).toBe(true) // substring
    expect(fuzzyHit(tokens, 'reaction')).toBe(true) // exact
    expect(fuzzyHit(tokens, 'reacton')).toBe(true) // one edit
    expect(fuzzyHit(tokens, 'mole')).toBe(true)
    expect(fuzzyHit(tokens, 'mob')).toBe(false) // short term, not a substring
    expect(fuzzyHit(tokens, 'biology')).toBe(false)
  })
})
