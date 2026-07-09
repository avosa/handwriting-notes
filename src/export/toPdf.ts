// Renders the document to a vector PDF that matches the screen: the ruled sheet as
// real lines, the writing in the embedded handwriting fonts, the diagrams as the same
// pen-drawn paths, and the ink on top. Nothing is rasterised, so the ruling stays as
// uniform on paper as it is on screen.
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { Block, NoteDocument, Page, Stroke, TextRole } from '@/types'
import { getPreset, ptToMm, ruleYs, type SheetPreset } from '@/paper/sheetSpec'
import { textMetrics } from '@/editor/alignment'
import { getHandwriting } from '@/handwriting/registry'
import { renderDiagram } from '@/diagrams/render'
import { penProfile } from '@/tools/penTypes'
import { useSettings } from '@/store/settings'

const MM_TO_PT = 72 / 25.4

function mm(value: number): number {
  return value * MM_TO_PT
}

function color(hex: string): RGB {
  const clean = hex.replace('#', '')
  const n = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

// A face pairs the embedded font used for drawing with a fontkit font used for
// shaping. The handwriting fonts space their letters with GPOS, which pdf-lib's plain
// text drawing ignores; shaping first and placing each glyph at its shaped position
// keeps the writing as tight on paper as it is on screen.
interface ShapedFont {
  create(bytes: Uint8Array): KitFont
}
interface KitGlyph {
  codePoints: number[]
}
interface KitPosition {
  xAdvance: number
  xOffset: number
}
interface KitFont {
  unitsPerEm: number
  layout(text: string): { glyphs: KitGlyph[]; positions: KitPosition[]; advanceWidth: number }
}

interface Face {
  pdf: PDFFont
  kit: KitFont
}
interface Fonts {
  body: Face
  header: Face
}

async function loadFace(pdf: PDFDocument, url: string): Promise<Face> {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
  const embedded = await pdf.embedFont(bytes, { subset: false })
  const kit = (fontkit as unknown as ShapedFont).create(bytes)
  return { pdf: embedded, kit }
}

function measure(face: Face, text: string, size: number): number {
  return face.kit.layout(text).advanceWidth * (size / face.kit.unitsPerEm)
}

/** Break a paragraph into lines that fit the column at the given size. */
function wrap(face: Face, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (measure(face, candidate, size) > maxWidth && line) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
    }
    lines.push(line)
  }
  return lines
}

function fontForRole(role: TextRole, fonts: Fonts): Face {
  return role === 'body' ? fonts.body : fonts.header
}

// Draw a run at its shaped glyph positions so letter spacing matches the font's own
// design instead of pdf-lib's unkerned advances.
function drawShaped(
  page: PDFPage,
  face: Face,
  text: string,
  size: number,
  x: number,
  baselineFromTop: number,
  ink: RGB,
) {
  const run = face.kit.layout(text)
  const scale = size / face.kit.unitsPerEm
  const y = page.getHeight() - baselineFromTop
  let penX = x
  for (let i = 0; i < run.glyphs.length; i++) {
    const glyph = run.glyphs[i]
    const pos = run.positions[i]
    const chars = glyph.codePoints.length ? String.fromCodePoint(...glyph.codePoints) : ''
    if (chars.trim()) {
      try {
        page.drawText(chars, { x: penX + pos.xOffset * scale, y, size, font: face.pdf, color: ink })
      } catch {
        // A codepoint the font has no glyph for is simply left blank.
      }
    }
    penX += pos.xAdvance * scale
  }
}

function drawTextLine(
  page: PDFPage,
  face: Face,
  line: string,
  size: number,
  x: number,
  baselineFromTop: number,
  ink: RGB,
  justify: boolean,
  maxWidth: number,
) {
  const words = line.split(' ').filter(Boolean)
  if (!justify || words.length < 2) {
    drawShaped(page, face, line, size, x, baselineFromTop, ink)
    return
  }
  const wordsWidth = words.reduce((sum, w) => sum + measure(face, w, size), 0)
  const gap = (maxWidth - wordsWidth) / (words.length - 1)
  let cursor = x
  for (const word of words) {
    drawShaped(page, face, word, size, cursor, baselineFromTop, ink)
    cursor += measure(face, word, size) + gap
  }
}

function drawSheet(page: PDFPage, preset: SheetPreset) {
  const pageHeight = page.getHeight()
  page.drawRectangle({
    x: 0,
    y: 0,
    width: mm(preset.width),
    height: mm(preset.height),
    color: color(preset.background),
  })
  const ruleWidth = mm(ptToMm(preset.rule.weightPt))
  for (const y of ruleYs(preset)) {
    page.drawLine({
      start: { x: 0, y: pageHeight - mm(y) },
      end: { x: mm(preset.width), y: pageHeight - mm(y) },
      thickness: ruleWidth,
      color: color(preset.rule.color),
    })
  }
  page.drawLine({
    start: { x: mm(preset.margin.left), y: pageHeight },
    end: { x: mm(preset.margin.left), y: 0 },
    thickness: mm(ptToMm(preset.margin.weightPt)),
    color: color(preset.margin.color),
  })
}

function drawStrokes(page: PDFPage, strokes: Stroke[]) {
  const pageHeight = page.getHeight()
  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue
    const profile = penProfile(stroke.tool)
    const d = stroke.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${mm(p.x)} ${mm(p.y)}`).join(' ')
    page.drawSvgPath(d, {
      x: 0,
      y: pageHeight,
      borderColor: color(stroke.color),
      borderWidth: mm(stroke.width),
      borderOpacity: profile.opacity,
    })
  }
}

function renderPage(pdfPage: PDFPage, page: Page, fonts: Fonts) {
  const preset = getPreset(page.presetId)
  const metrics = textMetrics(preset)
  drawSheet(pdfPage, preset)

  const handwriting = getHandwriting(useSettings().activeHandwritingId)
  const left = mm(metrics.left)
  const colWidth = mm(metrics.width)
  const lineHeight = mm(metrics.lineHeight)
  let cursorTop = mm(metrics.firstBaseline - metrics.lineHeight)

  for (const block of page.blocks) {
    if (block.type === 'text') {
      const t = block.text
      const leadRules = Math.round(metrics.roleLeadIn[t.role])
      cursorTop += leadRules * lineHeight
      const size = mm(metrics.fontSize[t.role])
      const font = fontForRole(t.role, fonts)
      const ink = color(
        t.color ??
          (t.role === 'title'
            ? handwriting.palette.title
            : t.role === 'heading'
              ? handwriting.palette.heading
              : handwriting.palette.ink),
      )
      const indent = mm(t.indent ?? 0)
      const lines = wrap(font, t.content, size, colWidth - indent)
      lines.forEach((line, i) => {
        const isLast = i === lines.length - 1
        drawTextLine(
          pdfPage,
          font,
          line,
          size,
          left + indent,
          cursorTop + lineHeight * 0.78,
          ink,
          t.align === 'justify' && !isLast,
          colWidth - indent,
        )
        cursorTop += lineHeight
      })
    } else {
      const heightPt = block.heightRules * lineHeight
      // The figure occupies a whole number of ruled lines, supplied here in points.
      drawDiagramScaled(pdfPage, block, left, cursorTop, colWidth, heightPt, fonts.body)
      cursorTop += heightPt
    }
  }

  drawStrokes(pdfPage, page.strokes)
}

// Diagram drawing with the height supplied directly in points, so the caller controls
// exactly how many rules of vertical space the figure occupies.
function drawDiagramScaled(
  page: PDFPage,
  block: Extract<Block, { type: 'diagram' }>,
  x: number,
  topFromTop: number,
  colWidth: number,
  heightPt: number,
  face: Face,
) {
  const pageHeight = page.getHeight()
  const rendered = renderDiagram(block.spec)
  const scale = Math.min(colWidth / rendered.width, heightPt / rendered.height)
  const offsetX = (colWidth - rendered.width * scale) / 2
  const offsetY = (heightPt - rendered.height * scale) / 2
  const originYTop = topFromTop + offsetY
  for (const path of rendered.paths) {
    page.drawSvgPath(path.d, {
      x: x + offsetX,
      y: pageHeight - originYTop,
      scale,
      borderColor: path.stroke === 'none' ? undefined : color(path.stroke),
      borderWidth: rendered.strokeWidth * scale,
      color: path.fill === 'none' ? undefined : color(path.fill),
    })
  }
  for (const label of rendered.labels) {
    const size = label.size * scale
    const textWidth = measure(face, label.text, size)
    let lx = x + offsetX + label.x * scale
    if (label.anchor === 'middle') lx -= textWidth / 2
    else if (label.anchor === 'end') lx -= textWidth
    drawShaped(page, face, label.text, size, lx, originYTop + label.y * scale, color(label.color))
  }
}

export async function documentToPdf(doc: NoteDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const fonts: Fonts = {
    body: await loadFace(pdf, '/fonts/caveat.ttf'),
    header: await loadFace(pdf, '/fonts/indie-flower.ttf'),
  }
  for (const page of doc.pages) {
    const preset = getPreset(page.presetId)
    const pdfPage = pdf.addPage([mm(preset.width), mm(preset.height)])
    renderPage(pdfPage, page, fonts)
  }
  return pdf.save()
}

export async function downloadPdf(doc: NoteDocument): Promise<void> {
  const bytes = await documentToPdf(doc)
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  triggerDownload(blob, `${doc.title || 'notes'}.pdf`)
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
