// Typo tolerance for the library search. A short, bounded Levenshtein distance lets a
// search still find a note when a letter is dropped, added, swapped, or mistyped, without
// pulling in unrelated words. Kept small and allocation-light because it runs over every
// note's vocabulary on each keystroke.

/**
 * The edit distance between two words, but never counting past `max`: as soon as a row's best
 * possible score exceeds the ceiling the work stops and `max + 1` is returned. This makes a
 * "within N edits?" test cheap, since most word pairs are ruled out after a row or two.
 */
export function boundedLevenshtein(a: string, b: string, max: number): number {
  if (a === b) return 0
  // A length gap wider than the ceiling can never be closed by edits.
  if (Math.abs(a.length - b.length) > max) return max + 1
  if (!a.length) return b.length
  if (!b.length) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  let curr = new Array<number>(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    let rowBest = curr[0]
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      if (curr[j] < rowBest) rowBest = curr[j]
    }
    // Every later row can only grow from this row's best, so bail once it clears the ceiling.
    if (rowBest > max) return max + 1
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

/** How many edits a term of the given length may differ by and still count as a match. Short
 *  terms demand an exact hit (a one-letter slip on a 3-letter word is too likely to be noise);
 *  longer terms allow one or two. */
export function editBudget(length: number): number {
  if (length <= 3) return 0
  if (length <= 6) return 1
  return 2
}

/** Whether any word in `tokens` is the term, contains it, or is within the term's edit budget —
 *  the per-term test behind a typo-tolerant search. */
export function fuzzyHit(tokens: readonly string[], term: string): boolean {
  const budget = editBudget(term.length)
  for (const token of tokens) {
    if (token.includes(term)) return true
    if (budget > 0 && boundedLevenshtein(token, term, budget) <= budget) return true
  }
  return false
}
