// The drawing instruments and how each lays ink down. Widths are in millimetres so
// a stroke is the same thickness on screen and in an exported page.
import type { PenType } from '@/types'

export interface PenProfile {
  id: PenType
  name: string
  /** Default nib width in millimetres. */
  width: number
  /** Range the width slider allows for this instrument. */
  minWidth: number
  maxWidth: number
  /** Ink opacity; the highlighter is translucent so writing shows through. */
  opacity: number
  /** Highlighters sit behind ink so the strokes below stay readable. */
  blend: 'normal' | 'multiply'
}

export const penProfiles: Record<PenType, PenProfile> = {
  pencil: { id: 'pencil', name: 'Pencil', width: 0.5, minWidth: 0.2, maxWidth: 1.5, opacity: 0.85, blend: 'normal' },
  fine: { id: 'fine', name: 'Fine pen', width: 0.4, minWidth: 0.2, maxWidth: 1.2, opacity: 1, blend: 'normal' },
  marker: { id: 'marker', name: 'Marker', width: 1.6, minWidth: 0.8, maxWidth: 4, opacity: 1, blend: 'normal' },
  highlighter: { id: 'highlighter', name: 'Highlighter', width: 5, minWidth: 3, maxWidth: 9, opacity: 0.35, blend: 'multiply' },
  eraser: { id: 'eraser', name: 'Eraser', width: 4, minWidth: 1, maxWidth: 12, opacity: 1, blend: 'normal' },
}

export const penOrder: PenType[] = ['pencil', 'fine', 'marker', 'highlighter', 'eraser']

export function penProfile(tool: PenType): PenProfile {
  return penProfiles[tool]
}
