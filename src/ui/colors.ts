// The colours a picker offers by default. The first row is the ink palette the sample
// notes use, so the familiar look is one tap away; the rest is a broad spectrum so a
// user can colour a heading, a word, a pen, or a diagram however they like.
export const inkSwatches: string[] = [
  '#33334C', // ink navy
  '#29297E', // title blue
  '#B73B3A', // heading red
  '#4A72B0', // pen blue
  '#3F8F5C', // pen green
  '#7E3F8A', // pen purple
  '#C8792E', // amber
  '#1F1F28', // near black
]

export const spectrumSwatches: string[] = [
  '#000000',
  '#444444',
  '#7A7A85',
  '#B0B0B8',
  '#FFFFFF',
  '#E23B3B',
  '#E86A2C',
  '#E8B22C',
  '#5BA84f',
  '#2E9E8F',
  '#3E7BD0',
  '#3F4FB0',
  '#7E3F8A',
  '#C0468C',
  '#8A5A3C',
  '#B73B3A',
  '#4A72B0',
  '#3F8F5C',
  '#29297E',
  '#33334C',
]

export const defaultSwatches: string[] = [...inkSwatches]

/** Saved swatches, then recents that are not already saved, then the spectrum. */
export function pickerRows(
  saved: string[],
  recents: string[],
): { saved: string[]; recent: string[]; spectrum: string[] } {
  const savedKeys = new Set(saved.map((c) => c.toLowerCase()))
  return {
    saved,
    recent: recents.filter((c) => !savedKeys.has(c.toLowerCase())).slice(0, 8),
    spectrum: spectrumSwatches,
  }
}
