// Maps handwriting onto the rule grid. The text layer and the exporters both read
// these metrics so a line of writing sits on the same rule everywhere. All values
// are millimetres, matching the paper; renderers scale by their pixels per mm.
import type { SheetPreset } from '@/paper/sheetSpec'
import type { TextRole } from '@/types'

export interface TextMetrics {
  /** Height of one written line, spanning `leadingRules` rules. */
  lineHeight: number
  /** Left edge of writing. */
  left: number
  /** Width of the writing column. */
  width: number
  /** Distance from the page top to the baseline of the first line. */
  firstBaseline: number
  fontSize: Record<TextRole, number>
  /** Space above a heading or title, in written lines. */
  roleLeadIn: Record<TextRole, number>
}

// Font sizes are a fraction of the line height so writing fills the rule regardless
// of the preset's spacing. Titles and headings rise above the body size.
const BODY_FILL = 0.62
const HEADING_FILL = 0.82
const TITLE_FILL = 1.05

export function textMetrics(preset: SheetPreset): TextMetrics {
  const lineHeight = preset.rule.spacing * preset.text.leadingRules
  return {
    lineHeight,
    left: preset.text.left,
    width: preset.text.right - preset.text.left,
    firstBaseline: preset.rule.topGap,
    fontSize: {
      body: lineHeight * BODY_FILL,
      heading: lineHeight * HEADING_FILL,
      title: lineHeight * TITLE_FILL,
    },
    roleLeadIn: {
      body: 0,
      heading: 0.55,
      title: 0.2,
    },
  }
}
