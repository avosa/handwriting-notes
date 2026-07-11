// Single source of truth for the ruled paper. Every measurement the sheet, the
// text grid, and the exporters need lives here so screen and PDF stay identical.
// A new sheet style is one more entry in `sheetPresets`; nothing else changes.

/** Every length in a preset is millimetres, the paper's native unit. */
export interface SheetPreset {
  id: string
  name: string
  /** How the paper is ruled: horizontal lines, a full grid, a field of dots, or nothing.
   *  Unset reads as lined, so the ruled presets need not name it. */
  style?: 'lined' | 'grid' | 'dots' | 'blank'
  /** Page width and height in millimetres. */
  width: number
  height: number
  /** Warm paper fill behind the rules. */
  background: string
  rule: {
    color: string
    /** Distance between adjacent horizontal rules. */
    spacing: number
    /** Distance from the top edge to the first rule. */
    topGap: number
    /** Stroke weight in points; converted to millimetres where needed. */
    weightPt: number
  }
  margin: {
    color: string
    /** Distance from the left edge to the vertical margin rule. */
    left: number
    weightPt: number
  }
  text: {
    /** Left edge of writing, clear of the margin rule. */
    left: number
    /** Right edge of writing. */
    right: number
    /** Number of rules one line of writing occupies. */
    leadingRules: number
  }
}

const POINTS_PER_MM = 72 / 25.4

/** Convert a point weight to millimetres for geometry that works in millimetres. */
export function ptToMm(pt: number): number {
  return pt / POINTS_PER_MM
}

// Light-blue college-ruled A4. The look the notes are matched against.
const preset1C: SheetPreset = {
  id: '1C',
  name: 'College ruled (light blue)',
  width: 210,
  height: 297,
  background: '#FDFBF4',
  rule: {
    color: '#B4C8DC',
    spacing: 9.02,
    topGap: 14.1,
    weightPt: 0.9,
  },
  margin: {
    color: '#DC9696',
    left: 24.8,
    weightPt: 1.1,
  },
  text: {
    left: 31.5,
    right: 200,
    leadingRules: 1,
  },
}

// Warm-gray ruled US Letter, kept so a second sheet style is exercised end to end.
const preset1A: SheetPreset = {
  id: '1A',
  name: 'Wide ruled (warm gray)',
  width: 215.9,
  height: 279.4,
  background: '#FCFBF7',
  rule: {
    color: '#E1DFDF',
    spacing: 6.48,
    topGap: 16.9,
    weightPt: 0.8,
  },
  margin: {
    color: '#DCC6C9',
    left: 16.1,
    weightPt: 1.0,
  },
  text: {
    left: 20.7,
    right: 205,
    leadingRules: 1.5,
  },
}

// A square grid on A4, the cell doubling as the writing line so a line of writing sits two
// cells tall. No margin rule; writing starts near the left edge.
const presetGrid: SheetPreset = {
  id: 'grid',
  name: 'Grid',
  style: 'grid',
  width: 210,
  height: 297,
  background: '#FDFBF4',
  rule: { color: '#D7DCE2', spacing: 5, topGap: 10, weightPt: 0.6 },
  margin: { color: '#D7DCE2', left: 0, weightPt: 0 },
  text: { left: 9, right: 201, leadingRules: 2 },
}

// A field of dots on A4, the same cell as the grid but marked only at the crossings, so the
// page guides without lines running across it.
const presetDots: SheetPreset = {
  id: 'dots',
  name: 'Dotted',
  style: 'dots',
  width: 210,
  height: 297,
  background: '#FDFBF4',
  rule: { color: '#C4CAD2', spacing: 5, topGap: 10, weightPt: 0.9 },
  margin: { color: '#C4CAD2', left: 0, weightPt: 0 },
  text: { left: 9, right: 201, leadingRules: 2 },
}

// Plain A4 with nothing printed on it. The writing grid is still there, unseen, so lines stay
// evenly spaced.
const presetBlank: SheetPreset = {
  id: 'blank',
  name: 'Blank',
  style: 'blank',
  width: 210,
  height: 297,
  background: '#FDFBF4',
  rule: { color: '#00000000', spacing: 9.02, topGap: 14.1, weightPt: 0 },
  margin: { color: '#00000000', left: 0, weightPt: 0 },
  text: { left: 12, right: 198, leadingRules: 1 },
}

export const sheetPresets: Record<string, SheetPreset> = {
  [preset1C.id]: preset1C,
  [preset1A.id]: preset1A,
  [presetGrid.id]: presetGrid,
  [presetDots.id]: presetDots,
  [presetBlank.id]: presetBlank,
}

export const defaultPresetId = preset1C.id

export function getPreset(id: string): SheetPreset {
  return sheetPresets[id] ?? preset1C
}

/** Y positions of every horizontal rule from the top edge, in millimetres. */
export function ruleYs(preset: SheetPreset): number[] {
  return ruleYsForHeight(preset, preset.height)
}

/** Rule positions for a page of an arbitrary height, so a page can grow as it fills. */
export function ruleYsForHeight(preset: SheetPreset, heightMm: number): number[] {
  const ys: number[] = []
  for (let y = preset.rule.topGap; y <= heightMm - preset.rule.spacing; y += preset.rule.spacing) {
    ys.push(Number(y.toFixed(4)))
  }
  return ys
}

/** How many lines of writing fit on one page for the preset. */
export function linesPerPage(preset: SheetPreset): number {
  return Math.floor(ruleYs(preset).length / preset.text.leadingRules)
}
