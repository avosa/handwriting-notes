// Whether the reader has asked the system to keep motion to a minimum. When they have, the
// crafted writing beats are skipped so words land at once instead of being drawn out, and the
// stylesheet quiets its transitions to match.
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}
