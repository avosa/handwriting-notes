// Renders the document to a vector PDF that matches the screen: the ruled sheet as
// real lines, the writing in the embedded handwriting fonts with its colours and
// emphasis, the tables and callouts ruled by hand, the diagrams as the same pen
// paths, and the ink on top. Nothing is rasterised, so the ruling stays uniform.
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { Block, CalloutBox, NoteDocument, Page, Stroke, TextRole, TextRun } from '@/types'
import { getPreset, ptToMm, ruleYsForHeight, type SheetPreset } from '@/paper/sheetSpec'
import { textMetrics, type TextMetrics } from '@/editor/alignment'
import { fontFiles, getHandwriting } from '@/handwriting/registry'
import { renderDiagram } from '@/diagrams/render'
import { rect as wobbleRect, line as wobbleLine, hashSeed } from '@/diagrams/wobble'
import { penProfile } from '@/tools/penTypes'
import { useSettings } from '@/store/settings'
import { listMarkers } from '@/util/listMarker'
import { joinSplitParagraphs } from './continuations'

const MM_TO_PT = 72 / 25.4
const mm = (v: number) => v * MM_TO_PT

function color(hex: string): RGB {
  const clean = hex.replace('#', '')
  const n = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

interface KitFont {
  unitsPerEm: number
  layout(text: string): {
    glyphs: { codePoints: number[] }[]
    positions: { xAdvance: number; xOffset: number }[]
    advanceWidth: number
  }
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
  return {
    pdf: await pdf.embedFont(bytes, { subset: false }),
    kit: (fontkit as unknown as { create(b: Uint8Array): KitFont }).create(bytes),
  }
}

function measure(face: Face, text: string, size: number): number {
  return face.kit.layout(text).advanceWidth * (size / face.kit.unitsPerEm)
}

// Draw a run at its shaped glyph positions so letter spacing matches the screen.
function drawShaped(
  page: PDFPage,
  face: Face,
  text: string,
  size: number,
  x: number,
  baselineFromTop: number,
  ink: RGB,
  bold: boolean,
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
        if (bold)
          page.drawText(chars, { x: penX + pos.xOffset * scale + size * 0.02, y, size, font: face.pdf, color: ink })
      } catch {
        // A codepoint the font has no glyph for is left blank.
      }
    }
    penX += pos.xAdvance * scale
  }
}

interface Word {
  text: string
  run: TextRun
}
function runsToWords(runs: TextRun[]): Word[] {
  const words: Word[] = []
  for (const run of runs) {
    const parts = run.text.split(/(\s+)/).filter((p) => p !== '')
    for (const part of parts) if (part.trim()) words.push({ text: part, run })
  }
  return words
}

function wrapWords(face: Face, words: Word[], size: number, maxWidth: number): Word[][] {
  const lines: Word[][] = [[]]
  let width = 0
  const space = measure(face, ' ', size)
  for (const word of words) {
    const w = measure(face, word.text, size)
    if (width + w > maxWidth && lines[lines.length - 1].length) {
      lines.push([])
      width = 0
    }
    lines[lines.length - 1].push(word)
    width += w + space
  }
  return lines
}

function drawWordLine(
  page: PDFPage,
  face: Face,
  words: Word[],
  size: number,
  left: number,
  baselineFromTop: number,
  maxWidth: number,
  defaultColor: string,
  align: 'left' | 'center' | 'justify',
) {
  const space = measure(face, ' ', size)
  const total = words.reduce((s, w) => s + measure(face, w.text, size), 0) + space * (words.length - 1)
  let x = left
  if (align === 'center') x = left + (maxWidth - total) / 2
  for (const word of words) {
    const ink = color(word.run.color ?? defaultColor)
    drawShaped(page, face, word.text, size, x, baselineFromTop, ink, !!word.run.bold)
    const w = measure(face, word.text, size)
    if (word.run.underline) {
      page.drawLine({
        start: { x, y: page.getHeight() - (baselineFromTop + size * 0.12) },
        end: { x: x + w, y: page.getHeight() - (baselineFromTop + size * 0.12) },
        thickness: size * 0.04,
        color: ink,
      })
    }
    x += w + space
  }
}

function drawSheet(page: PDFPage, preset: SheetPreset, heightMm: number) {
  const h = page.getHeight()
  page.drawRectangle({ x: 0, y: 0, width: mm(preset.width), height: mm(heightMm), color: color(preset.background) })
  const style = preset.style ?? 'lined'
  if (style === 'blank') return

  const ruleColor = color(preset.rule.color)
  if (style === 'grid' || style === 'dots') {
    const s = preset.rule.spacing
    if (style === 'grid') {
      const w = mm(ptToMm(preset.rule.weightPt))
      for (let y = 0; y <= heightMm + 0.001; y += s) {
        page.drawLine({
          start: { x: 0, y: h - mm(y) },
          end: { x: mm(preset.width), y: h - mm(y) },
          thickness: w,
          color: ruleColor,
        })
      }
      for (let x = 0; x <= preset.width + 0.001; x += s) {
        page.drawLine({ start: { x: mm(x), y: h }, end: { x: mm(x), y: 0 }, thickness: w, color: ruleColor })
      }
    } else {
      const r = mm(Math.max(0.18, ptToMm(preset.rule.weightPt) * 0.7))
      for (let y = 0; y <= heightMm + 0.001; y += s) {
        for (let x = 0; x <= preset.width + 0.001; x += s) {
          page.drawCircle({ x: mm(x), y: h - mm(y), size: r, color: ruleColor })
        }
      }
    }
    return
  }

  const ruleWidth = mm(ptToMm(preset.rule.weightPt))
  for (const y of ruleYsForHeight(preset, heightMm)) {
    page.drawLine({
      start: { x: 0, y: h - mm(y) },
      end: { x: mm(preset.width), y: h - mm(y) },
      thickness: ruleWidth,
      color: ruleColor,
    })
  }
  page.drawLine({
    start: { x: mm(preset.margin.left), y: h },
    end: { x: mm(preset.margin.left), y: 0 },
    thickness: mm(ptToMm(preset.margin.weightPt)),
    color: color(preset.margin.color),
  })
}

function roleFont(role: TextRole, fonts: Fonts): Face {
  return role === 'title' || role === 'heading' ? fonts.header : fonts.body
}
function roleColor(role: TextRole, palette: ReturnType<typeof getHandwriting>['palette']): string {
  if (role === 'title') return palette.title
  if (role === 'heading' || role === 'subheading') return palette.heading
  return palette.ink
}

function drawDiagram(
  page: PDFPage,
  block: Extract<Block, { type: 'diagram' }>,
  x: number,
  topFromTop: number,
  colWidth: number,
  heightPt: number,
  face: Face,
) {
  const h = page.getHeight()
  const rendered = renderDiagram(block.spec, hashSeed(block.id))
  const scale = Math.min(colWidth / rendered.width, heightPt / rendered.height)
  const offsetX = (colWidth - rendered.width * scale) / 2
  const offsetY = (heightPt - rendered.height * scale) / 2
  const originYTop = topFromTop + offsetY
  for (const path of rendered.paths) {
    page.drawSvgPath(path.d, {
      x: x + offsetX,
      y: h - originYTop,
      scale,
      borderColor: path.stroke === 'none' ? undefined : color(path.stroke),
      borderWidth: rendered.strokeWidth * scale,
      color: path.fill === 'none' ? undefined : color(path.fill),
    })
  }
  for (const label of rendered.labels) {
    const size = label.size * scale * (block.scale ?? 1)
    const width = measure(face, label.text, size)
    let lx = x + offsetX + label.x * scale
    if (label.anchor === 'middle') lx -= width / 2
    else if (label.anchor === 'end') lx -= width
    drawShaped(page, face, label.text, size, lx, originYTop + label.y * scale, color(label.color), false)
  }
}

function drawTable(
  page: PDFPage,
  block: Extract<Block, { type: 'table' }>,
  x: number,
  topFromTop: number,
  colWidth: number,
  rowHeightPt: number,
  ink: RGB,
  face: Face,
) {
  const cols = block.header.length
  const rowCount = block.rows.length + 1
  const height = rowCount * rowHeightPt
  const seed = hashSeed(block.id)
  const h = page.getHeight()
  const stroke = Math.max(colWidth, height) * 0.004
  const draw = (d: string) => page.drawSvgPath(d, { x, y: h - topFromTop, borderColor: ink, borderWidth: stroke })
  draw(wobbleRect(1, 1, colWidth - 2, height - 2, seed))
  for (let c = 1; c < cols; c++)
    draw(wobbleLine((colWidth / cols) * c, 1, (colWidth / cols) * c, height - 1, seed + c * 7))
  for (let r = 1; r < rowCount; r++)
    draw(wobbleLine(1, (height / rowCount) * r, colWidth - 1, (height / rowCount) * r, seed + r * 13 + 100))
  const cellW = colWidth / cols
  const size = rowHeightPt * 0.5 * (block.scale ?? 1)
  const cell = (text: string, ci: number, ri: number) => {
    if (!text) return
    const w = measure(face, text, size)
    drawShaped(
      page,
      face,
      text,
      size,
      x + cellW * ci + (cellW - w) / 2,
      topFromTop + rowHeightPt * ri + rowHeightPt * 0.68,
      ink,
      ri === 0,
    )
  }
  block.header.forEach((t, c) => cell(t, c, 0))
  block.rows.forEach((row, r) => row.forEach((t, c) => cell(t, c, r + 1)))
}

function drawCallouts(
  page: PDFPage,
  boxes: CalloutBox[],
  id: string,
  x: number,
  topFromTop: number,
  colWidth: number,
  rowHeightPt: number,
  face: Face,
  fontScale = 1,
): number {
  const gap = mm(4)
  const boxWidth = (colWidth - gap * (boxes.length - 1)) / boxes.length
  const maxLines = Math.max(...boxes.map((b) => b.items.length)) + 1
  const height = (maxLines + 1.5) * rowHeightPt
  const h = page.getHeight()
  const seed = hashSeed(id)
  boxes.forEach((box, i) => {
    const bx = x + i * (boxWidth + gap)
    const scaleW = boxWidth
    const scaleH = height
    page.drawSvgPath(wobbleRect(1.5, 1.5, scaleW - 3, scaleH - 3, seed + i * 31), {
      x: bx,
      y: h - topFromTop,
      borderColor: color(box.color),
      borderWidth: Math.max(scaleW, scaleH) * 0.004,
    })
    const headSize = rowHeightPt * 0.6 * fontScale
    const headText = box.heading.map((r) => r.text).join('')
    const hw = measure(face, headText, headSize)
    drawShaped(
      page,
      face,
      headText,
      headSize,
      bx + (boxWidth - hw) / 2,
      topFromTop + rowHeightPt * 1.1,
      color(box.color),
      true,
    )
    box.items.forEach((item, li) => {
      const text = item.map((r) => r.text).join('')
      drawShaped(
        page,
        face,
        text,
        rowHeightPt * 0.55 * fontScale,
        bx + mm(4),
        topFromTop + rowHeightPt * (2 + li),
        color('#33334C'),
        false,
      )
    })
  })
  return height
}

function drawStrokes(page: PDFPage, strokes: Stroke[]) {
  const h = page.getHeight()
  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue
    const profile = penProfile(stroke.tool)
    const d = stroke.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${mm(p.x)} ${mm(p.y)}`).join(' ')
    if (stroke.fill) page.drawSvgPath(d + ' Z', { x: 0, y: h, color: color(stroke.fill), opacity: 0.45 })
    page.drawSvgPath(d, {
      x: 0,
      y: h,
      borderColor: color(stroke.color),
      borderWidth: mm(stroke.width),
      borderOpacity: profile.opacity,
    })
  }
}

function pageHeightMm(page: Page, preset: SheetPreset, metrics: TextMetrics, fonts: Fonts): number {
  // A dry run of the layout to learn how tall the grown page needs to be.
  let cursor = metrics.firstBaseline - metrics.lineHeight
  cursor = layoutBlocks(page, metrics, fonts, null, cursor)
  const grown =
    preset.rule.topGap +
    Math.ceil(Math.max(0, cursor + 12 - preset.rule.topGap) / preset.rule.spacing) * preset.rule.spacing
  return Math.max(preset.height, grown)
}

// Walk the blocks, drawing them if a page is given, and return the bottom cursor in mm.
function layoutBlocks(
  page: Page,
  metrics: TextMetrics,
  fonts: Fonts,
  pdfPage: PDFPage | null,
  startMm: number,
): number {
  const handwriting = getHandwriting(useSettings().activeHandwritingId)
  const left = metrics.left
  const colWidth = metrics.width
  const lineH = metrics.lineHeight
  let cursor = startMm

  for (const block of page.blocks) {
    if (block.type === 'text') {
      const t = block.text
      cursor += Math.round(metrics.roleLeadIn[t.role]) * lineH
      const size = metrics.fontSize[t.role] * (block.scale ?? 1)
      const face = roleFont(t.role, fonts)
      const ink = roleColor(t.role, handwriting.palette)
      const words = runsToWords(t.runs)
      const lines = words.length ? wrapWords(face, words, mm(size), mm(colWidth)) : [[]]
      const align = t.align ?? (t.role === 'caption' || t.role === 'subtitle' ? 'center' : 'left')
      for (const line of lines) {
        if (pdfPage && line.length)
          drawWordLine(pdfPage, face, line, mm(size), mm(left), mm(cursor + lineH * 0.78), mm(colWidth), ink, align)
        cursor += lineH
      }
    } else if (block.type === 'list') {
      const size = metrics.fontSize.body * (block.scale ?? 1)
      const face = fonts.body
      const levels = block.items.map((_, i) => block.levels?.[i] ?? 0)
      const markers = listMarkers(block.ordered, levels)
      const INDENT_MM = 6
      block.items.forEach((item, i) => {
        // Nesting steps the whole item in, marker and words together, and narrows its wrap.
        const inset = INDENT_MM * levels[i]
        const marker = block.checked ? (block.checked[i] ? '[x]' : '[ ]') : markers[i]
        if (pdfPage)
          drawShaped(
            pdfPage,
            face,
            marker,
            mm(size),
            mm(left + inset),
            mm(cursor + lineH * 0.78),
            color(handwriting.palette.ink),
            false,
          )
        const words = runsToWords(item)
        const textLeft = left + inset + 6
        const textWidth = colWidth - inset - 6
        const lines = words.length ? wrapWords(face, words, mm(size), mm(textWidth)) : [[]]
        lines.forEach((line, li) => {
          if (pdfPage && line.length)
            drawWordLine(
              pdfPage,
              face,
              line,
              mm(size),
              mm(textLeft),
              mm(cursor + lineH * 0.78),
              mm(textWidth),
              handwriting.palette.ink,
              'left',
            )
          cursor += lineH
          void li
        })
      })
    } else if (block.type === 'table') {
      if (block.caption && pdfPage) {
        const w = measure(fonts.body, block.caption, mm(metrics.fontSize.caption))
        drawShaped(
          pdfPage,
          fonts.body,
          block.caption,
          mm(metrics.fontSize.caption),
          mm(left) + (mm(colWidth) - w) / 2,
          mm(cursor + lineH * 0.7),
          color(handwriting.palette.ink),
          false,
        )
      }
      if (block.caption) cursor += lineH
      if (pdfPage)
        drawTable(
          pdfPage,
          block,
          mm(left),
          mm(cursor),
          mm(colWidth),
          mm(lineH),
          color(handwriting.palette.ink),
          fonts.body,
        )
      cursor += (block.rows.length + 1) * lineH
    } else if (block.type === 'callouts') {
      if (block.caption) cursor += lineH
      const usedPt = pdfPage
        ? drawCallouts(
            pdfPage,
            block.boxes,
            block.id,
            mm(left),
            mm(cursor),
            mm(colWidth),
            mm(lineH),
            fonts.body,
            block.scale ?? 1,
          )
        : (Math.max(...block.boxes.map((b) => b.items.length)) + 2.5) * mm(lineH)
      cursor += usedPt / MM_TO_PT
    } else if (block.type === 'diagram') {
      const heightPt = block.heightRules * mm(lineH)
      if (pdfPage) drawDiagram(pdfPage, block, mm(left), mm(cursor), mm(colWidth), heightPt, fonts.body)
      cursor += block.heightRules * lineH
    } else if (block.type === 'quote') {
      const size = metrics.fontSize.body
      const words = runsToWords(block.runs)
      const lines = words.length ? wrapWords(fonts.body, words, mm(size), mm(colWidth - 6)) : [[]]
      const barTop = cursor
      for (const line of lines) {
        if (pdfPage && line.length)
          drawWordLine(
            pdfPage,
            fonts.body,
            line,
            mm(size),
            mm(left + 6),
            mm(cursor + lineH * 0.78),
            mm(colWidth - 6),
            handwriting.palette.ink,
            'left',
          )
        cursor += lineH
      }
      if (pdfPage)
        pdfPage.drawRectangle({
          x: mm(left),
          y: pdfPage.getHeight() - mm(cursor),
          width: mm(1),
          height: mm(cursor - barTop),
          color: color('#4A72B0'),
        })
    } else if (block.type === 'code') {
      const size = metrics.fontSize.body * 0.9
      const codeLines = block.text.split('\n')
      for (const codeLine of codeLines) {
        if (pdfPage && codeLine)
          drawShaped(
            pdfPage,
            fonts.body,
            codeLine,
            mm(size),
            mm(left + 3),
            mm(cursor + lineH * 0.78),
            color(handwriting.palette.ink),
            false,
          )
        cursor += lineH
      }
    } else if (block.type === 'divider') {
      if (pdfPage)
        pdfPage.drawLine({
          start: { x: mm(left), y: pdfPage.getHeight() - mm(cursor + lineH * 0.5) },
          end: { x: mm(left + colWidth), y: pdfPage.getHeight() - mm(cursor + lineH * 0.5) },
          thickness: mm(0.5),
          color: color('#999999'),
        })
      cursor += lineH
    }
  }
  return cursor
}

export async function documentToPdf(doc: NoteDocument): Promise<Uint8Array> {
  doc = joinSplitParagraphs(doc)
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const hand = getHandwriting(useSettings().activeHandwritingId)
  const fonts: Fonts = {
    body: await loadFace(pdf, fontFiles[hand.bodyFont] ?? '/fonts/kalam.ttf'),
    header: await loadFace(pdf, fontFiles[hand.headerFont] ?? '/fonts/kalam.ttf'),
  }
  for (const page of doc.pages) {
    const preset = getPreset(page.presetId)
    const metrics = textMetrics(preset)
    const heightMm = pageHeightMm(page, preset, metrics, fonts)
    const pdfPage = pdf.addPage([mm(preset.width), mm(heightMm)])
    drawSheet(pdfPage, preset, heightMm)
    layoutBlocks(page, metrics, fonts, pdfPage, metrics.firstBaseline - metrics.lineHeight)
    drawStrokes(pdfPage, page.strokes)
    const palette = getHandwriting(useSettings().activeHandwritingId).palette
    for (const note of page.notes ?? []) {
      const text = note.runs.map((r) => r.text).join('')
      if (text.trim()) {
        const role = note.role ?? 'body'
        drawShaped(
          pdfPage,
          roleFont(role, fonts),
          text,
          mm(metrics.fontSize[role] * (note.scale ?? 1)),
          mm(note.x),
          mm(note.y - metrics.lineHeight * 0.22),
          color(note.color ?? roleColor(role, palette)),
          false,
        )
      }
    }
  }
  return pdf.save()
}

export async function downloadPdf(doc: NoteDocument): Promise<void> {
  const bytes = await documentToPdf(doc)
  triggerDownload(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${doc.title || 'notes'}.pdf`)
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
