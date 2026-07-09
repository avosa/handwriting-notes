// The handwritings a writer can choose. Each pairs a body font with a header font and
// a starting colour scheme, and names the font files the PDF exporter embeds. A new
// hand is one more entry here; nothing else changes.
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

const order: Handwriting[] = [
  { id: 'everyday', name: 'Everyday', bodyFont: 'Kalam', headerFont: 'Kalam', palette: notePalette },
  { id: 'neat', name: 'Neat', bodyFont: 'Handlee', headerFont: 'Handlee', palette: notePalette },
  { id: 'print', name: 'Print', bodyFont: 'Patrick Hand', headerFont: 'Patrick Hand', palette: notePalette },
  { id: 'notebook', name: 'Notebook', bodyFont: 'Caveat', headerFont: 'Indie Flower', palette: notePalette },
]

// The font files the exporter embeds for each family, so a PDF carries the writing.
export const fontFiles: Record<string, string> = {
  Kalam: '/fonts/kalam.ttf',
  Handlee: '/fonts/handlee.ttf',
  'Patrick Hand': '/fonts/patrickhand.ttf',
  Caveat: '/fonts/caveat.ttf',
  'Indie Flower': '/fonts/indie-flower.ttf',
}

export const handwritingList = order
export const handwritings: Record<string, Handwriting> = Object.fromEntries(order.map((h) => [h.id, h]))
export const defaultHandwritingId = order[0].id

export function getHandwriting(id: string): Handwriting {
  return handwritings[id] ?? order[0]
}
