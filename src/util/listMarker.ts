// The markers a list shows, given whether it is numbered and how deep each item nests. Bullets
// cycle a glyph per depth; a numbered list counts within each level and restarts under every new
// parent, styled decimal, then letters, then roman, so a nested list reads like a document. Kept
// in one place so the page, the PDF, and any other view number a nested list identically.

const BULLETS = ['•', '◦', '▪'] // • ◦ ▪

// 1 -> a, 26 -> z, 27 -> aa, for lettered sub-levels.
export function alphaLabel(n: number): string {
  let s = ''
  let v = n
  while (v > 0) {
    v -= 1
    s = String.fromCharCode(97 + (v % 26)) + s
    v = Math.floor(v / 26)
  }
  return s || 'a'
}

// 1 -> i, 4 -> iv, for the third numbered level.
export function romanLabel(n: number): string {
  const table: [number, string][] = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ]
  let v = n
  let s = ''
  for (const [value, sym] of table) {
    while (v >= value) {
      s += sym
      v -= value
    }
  }
  return s || 'i'
}

// The marker for one level given the running count of siblings at that level.
export function orderedMarker(level: number, count: number): string {
  const style = level % 3
  return style === 0 ? `${count}.` : style === 1 ? `${alphaLabel(count)}.` : `${romanLabel(count)}.`
}

// Every item's marker in order, numbering restarting under each new parent.
export function listMarkers(ordered: boolean, levels: number[]): string[] {
  const counters: number[] = []
  return levels.map((level) => {
    if (!ordered) return BULLETS[level % BULLETS.length]
    counters[level] = (counters[level] ?? 0) + 1
    for (let d = level + 1; d < counters.length; d++) counters[d] = 0
    return orderedMarker(level, counters[level])
  })
}
