// Applies emphasis to the current text selection. The selection lives in a
// contenteditable element, so these drive the browser's own editing commands and let
// the editable serialise itself back into runs. Colours are written as inline styles
// so they read back cleanly as run colours.
function withCss() {
  document.execCommand('styleWithCSS', false, 'true')
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
  withCss()
  document.execCommand('foreColor', false, color)
}
export function setHighlight(color: string) {
  withCss()
  // Chromium uses hiliteColor; some engines only take backColor.
  if (!document.execCommand('hiliteColor', false, color)) document.execCommand('backColor', false, color)
}
export function clearHighlight() {
  setHighlight('transparent')
}

/** The marks active at the caret, so the toolbar can show what is on. */
export function activeMarks(): { bold: boolean; italic: boolean; underline: boolean } {
  return {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
  }
}
