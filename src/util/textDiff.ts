// How much of two strings match from the start, so an edit can erase only from the first
// character that changed rather than rubbing out a whole line to fix one word.
export function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i += 1
  return i
}

// How much of two strings match from the end, without overlapping the shared start, so a
// change in the middle leaves the tail it shares alone.
export function commonSuffixLength(a: string, b: string, prefix: number): number {
  const max = Math.min(a.length, b.length) - prefix
  let i = 0
  while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1
  return i
}
