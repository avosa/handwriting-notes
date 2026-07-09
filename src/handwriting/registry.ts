// Available handwritings. A handwriting pairs a body font with a header font and a
// starting colour scheme. One casual style ships now; more, including uploaded ones,
// slot in later without touching the rest of the app.
import type { ColorScheme, Handwriting } from '@/types'

// The math set symbols the notes use are absent from the handwriting fonts, so the
// browser falls back per glyph to a font that has them. Appending the fallback keeps
// the handwriting for letters while showing the symbols correctly.
const MATH_FALLBACK = "'STIX Two Math', 'Cambria Math', 'Noto Sans Math', serif"

export const notePalette: ColorScheme = {
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

const casual: Handwriting = {
  id: 'casual',
  name: 'Casual',
  bodyFont: 'Caveat',
  headerFont: 'Indie Flower',
  palette: notePalette,
}

export const handwritings: Record<string, Handwriting> = {
  [casual.id]: casual,
}

export const defaultHandwritingId = casual.id

export function getHandwriting(id: string): Handwriting {
  return handwritings[id] ?? casual
}
