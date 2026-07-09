// Enforces the standing rule that generated prose carries no dashes. It removes the
// em, en, and horizontal bar dashes and the spaced hyphen used as a dash, replacing
// each with ordinary punctuation. Hyphens that join a compound word, such as
// "Three-Set" or "college-ruled", are left alone: those read as one word, not a dash.
export function stripDashes(text: string): string {
  return text
    .replace(/\s*[—–―]\s*/g, ', ')
    .replace(/(\S)\s+-\s+(\S)/g, '$1, $2')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
}

/** Tidy a whole generated note: drop dashes and collapse stray blank lines. */
export function lintNote(text: string): string {
  return stripDashes(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Whether a run of text still contains a prose dash the lint would change. */
export function hasProseDash(text: string): boolean {
  return /[—–―]/.test(text) || /\S\s+-\s+\S/.test(text)
}
