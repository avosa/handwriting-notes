// Applies emphasis and colour to the current text selection. These drive the browser's
// own editing commands so the editable can serialise itself back into runs. Opening a
// colour picker moves focus and drops the selection, so the selection is remembered
// when the picker opens and restored before the colour is applied.
function withCss() {
  document.execCommand('styleWithCSS', false, 'true')
}

let savedRange: Range | null = null

/** Capture the live selection before a menu or picker takes focus away from it. */
export function rememberSelection() {
  const sel = window.getSelection()
  if (sel && sel.rangeCount && !sel.isCollapsed) savedRange = sel.getRangeAt(0).cloneRange()
}

/** Capture the caret, even when nothing is selected, so a picker can drop text where it was. */
export function rememberCaret() {
  const sel = window.getSelection()
  if (sel && sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange()
}

/** Drop text in at the remembered caret, letting the line read it back into the note. */
export function insertAtSelection(text: string) {
  if (restoreSelection()) document.execCommand('insertText', false, text)
}

function restoreSelection(): boolean {
  if (!savedRange) return false
  const node = savedRange.commonAncestorContainer
  const host = (node instanceof Element ? node : node.parentElement)?.closest('.editable, .cell') as HTMLElement | null
  host?.focus()
  const sel = window.getSelection()
  if (!sel) return false
  sel.removeAllRanges()
  sel.addRange(savedRange)
  return true
}

export function toggleBold() {
  withCss()
  document.execCommand('bold')
}
export function toggleItalic() {
  withCss()
  document.execCommand('italic')
}
export function toggleUnderline() {
  withCss()
  document.execCommand('underline')
}
export function setTextColor(color: string) {
  restoreSelection()
  withCss()
  document.execCommand('foreColor', false, color)
}
export function setHighlight(color: string) {
  restoreSelection()
  withCss()
  if (!document.execCommand('hiliteColor', false, color)) document.execCommand('backColor', false, color)
}

// A web address the note is willing to link to: an http(s) address, or a mail link. A bare
// address like example.com is taken as https. Anything else, including a script address, is
// refused so a note can never carry a link that runs code.
export function safeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const candidate =
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('mailto:') ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') return url.href
  } catch {
    // Not a parseable address.
  }
  return null
}

// Link the selected words to an address, or clear a link from them. The selection is captured
// before the field takes focus, then restored so the link lands on the words that were chosen.
export function setLink(raw: string) {
  const href = safeUrl(raw)
  if (!href) return
  restoreSelection()
  document.execCommand('createLink', false, href)
}
export function clearLink() {
  restoreSelection()
  document.execCommand('unlink')
}

// Change the case of the selected words in place. Title case lowercases first so a line that
// arrived in shouting capitals comes back down to a clean Capitalised Line.
export function convertCase(mode: 'upper' | 'lower' | 'title') {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) return
  const text = selection.toString()
  if (!text.trim()) return
  const out =
    mode === 'upper'
      ? text.toUpperCase()
      : mode === 'lower'
        ? text.toLowerCase()
        : text.toLowerCase().replace(/(^|\s|[("'])\p{L}/gu, (m) => m.toUpperCase())
  document.execCommand('insertText', false, out)
}
