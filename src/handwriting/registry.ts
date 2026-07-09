// Available handwritings. A handwriting pairs a body font with a header font and a
// colour scheme. The default reproduces the look the notes are matched against.
import type { ColorScheme, Handwriting } from '@/types'

// The math set symbols the notes use are absent from the handwriting fonts, so the
// browser falls back per glyph to a font that has them. Appending the fallback keeps
// the handwriting for letters while showing the symbols correctly.
const MATH_FALLBACK = "'STIX Two Math', 'Cambria Math', 'Noto Sans Math', serif"

export const sanobiaPalette: ColorScheme = {
  title: '#29297E',
  heading: '#B73B3A',
  ink: '#33334C',
  penBlue: '#4A72B0',
  penGreen: '#3F8F5C',
  penRed: '#B73B3A',
}

export function bodyFontStack(handwriting: Handwriting): string {
  return `'${handwriting.bodyFont}', ${MATH_FALLBACK}`
}

export function headerFontStack(handwriting: Handwriting): string {
  return `'${handwriting.headerFont}', ${MATH_FALLBACK}`
}

const sanobia: Handwriting = {
  id: 'sanobia',
  name: "Sanobia's handwriting",
  bodyFont: 'Caveat',
  headerFont: 'Indie Flower',
  palette: sanobiaPalette,
}

export const handwritings: Record<string, Handwriting> = {
  [sanobia.id]: sanobia,
}

export const defaultHandwritingId = sanobia.id

export function getHandwriting(id: string): Handwriting {
  return handwritings[id] ?? sanobia
}
