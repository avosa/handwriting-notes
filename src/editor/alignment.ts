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
const FILL: Record<TextRole, number> = {
  title: 1.05,
  subtitle: 0.66,
  heading: 0.82,
  subheading: 0.72,
  body: 0.62,
  caption: 0.52,
}

// Blank rules a role leaves above itself, kept to whole lines so the grid holds.
const LEAD_IN: Record<TextRole, number> = {
  title: 0,
  subtitle: 0,
  heading: 1,
  subheading: 1,
  body: 0,
  caption: 0,
}

export function textMetrics(preset: SheetPreset): TextMetrics {
  const lineHeight = preset.rule.spacing * preset.text.leadingRules
  const fontSize = {} as Record<TextRole, number>
  for (const role of Object.keys(FILL) as TextRole[]) fontSize[role] = lineHeight * FILL[role]
  return {
    lineHeight,
    left: preset.text.left,
    width: preset.text.right - preset.text.left,
    firstBaseline: preset.rule.topGap,
    fontSize,
    roleLeadIn: { ...LEAD_IN },
  }
}
