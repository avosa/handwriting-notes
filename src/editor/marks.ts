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
