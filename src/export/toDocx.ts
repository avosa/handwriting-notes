// Renders the document to a DOCX. Word cannot draw the ruled sheet as live vectors,
// so each page becomes a section whose background is the sheet, with the writing set
// in the handwriting fonts over it and each diagram placed as a crisp rendering of the
// same pen-drawn figure. The text stays real, selectable text.
import { AlignmentType, Document, ImageRun, Packer, Paragraph, TextRun, type ISectionOptions } from 'docx'
import type { Block, NoteDocument, Page, TextRole } from '@/types'
import { getPreset, ruleYs, type SheetPreset } from '@/paper/sheetSpec'
import { getHandwriting } from '@/handwriting/registry'
import { renderDiagram } from '@/diagrams/render'
import { useSettings } from '@/store/settings'
import { triggerDownload } from './toPdf'

const MM_TO_TWIP = 1440 / 25.4

function twip(mm: number): number {
  return Math.round(mm * MM_TO_TWIP)
}

function fontName(role: TextRole, bodyFont: string, headerFont: string): string {
  return role === 'body' ? bodyFont : headerFont
}

function roleColor(role: TextRole, palette: ReturnType<typeof getHandwriting>['palette']): string {
  return (role === 'title' ? palette.title : role === 'heading' ? palette.heading : palette.ink).replace('#', '')
}

// Half-point font sizes tuned to sit close to the on-screen writing.
const ROLE_SIZE: Record<TextRole, number> = { title: 40, heading: 30, body: 24 }

/** Draw the ruled sheet to an SVG string used as the page background image. */
function sheetSvg(preset: SheetPreset): string {
  const rules = ruleYs(preset)
    .map(
      (y) =>
        `<line x1="0" y1="${y}" x2="${preset.width}" y2="${y}" stroke="${preset.rule.color}" stroke-width="0.32"/>`,
    )
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${preset.width} ${preset.height}"><rect width="${preset.width}" height="${preset.height}" fill="${preset.background}"/>${rules}<line x1="${preset.margin.left}" y1="0" x2="${preset.margin.left}" y2="${preset.height}" stroke="${preset.margin.color}" stroke-width="0.4"/></svg>`
}

/** Rasterise an SVG string to PNG bytes in the browser. */
async function svgToPng(svg: string, widthPx: number, heightPx: number): Promise<Uint8Array> {
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('The figure could not be drawn.'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = widthPx
    canvas.height = heightPx
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0, widthPx, heightPx)
    const pngBlob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
    return new Uint8Array(await pngBlob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Build an SVG for a diagram scene, sized to the writing column. */
function diagramSvg(
  spec: Extract<Block, { type: 'diagram' }>['spec'],
  widthMm: number,
  heightMm: number,
  fontFamily: string,
): string {
  const rendered = renderDiagram(spec)
  const paths = rendered.paths
    .map(
      (p) =>
        `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${rendered.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`,
    )
    .join('')
  const labels = rendered.labels
    .map(
      (l) =>
        `<text x="${l.x}" y="${l.y}" fill="${l.color}" font-size="${l.size}" text-anchor="${l.anchor}" font-family="${fontFamily}">${escapeXml(l.text)}</text>`,
    )
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rendered.width} ${rendered.height}" width="${widthMm}mm" height="${heightMm}mm">${paths}${labels}</svg>`
}

function escapeXml(text: string): string {
  return text.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'))
}

async function pageChildren(
  page: Page,
  bodyFont: string,
  headerFont: string,
  palette: ReturnType<typeof getHandwriting>['palette'],
): Promise<Paragraph[]> {
  const preset = getPreset(page.presetId)
  const colWidthMm = preset.text.right - preset.text.left
  const children: Paragraph[] = []

  for (const block of page.blocks) {
    if (block.type === 'text') {
      const t = block.text
      children.push(
        new Paragraph({
          alignment: t.align === 'justify' ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
          spacing: {
            line: twip(preset.rule.spacing * preset.text.leadingRules),
            lineRule: 'exact',
            before: 0,
            after: 0,
          },
          indent: t.indent ? { left: twip(t.indent) } : undefined,
          children: [
            new TextRun({
              text: t.content,
              font: fontName(t.role, bodyFont, headerFont),
              size: ROLE_SIZE[t.role],
              bold: t.bold,
              color: t.color ? t.color.replace('#', '') : roleColor(t.role, palette),
            }),
          ],
        }),
      )
    } else {
      const heightMm = block.heightRules * preset.rule.spacing * preset.text.leadingRules
      const svg = diagramSvg(block.spec, colWidthMm, heightMm, bodyFont)
      const png = await svgToPng(svg, Math.round(colWidthMm * 4), Math.round(heightMm * 4))
      children.push(
        new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [
            new ImageRun({
              data: png,
              type: 'png',
              transformation: {
                width: Math.round(colWidthMm * (96 / 25.4)),
                height: Math.round(heightMm * (96 / 25.4)),
              },
            }),
          ],
        }),
      )
    }
  }
  return children
}

export async function documentToDocx(doc: NoteDocument): Promise<Blob> {
  const settings = useSettings()
  const handwriting = getHandwriting(settings.activeHandwritingId)
  const bodyFont = handwriting.bodyFont
  const headerFont = handwriting.headerFont
  const preset = getPreset(doc.pages[0]?.presetId ?? '1C')

  const background = await svgToPng(sheetSvg(preset), Math.round(preset.width * 4), Math.round(preset.height * 4))

  const sections: ISectionOptions[] = []
  for (const page of doc.pages) {
    const p = getPreset(page.presetId)
    sections.push({
      properties: {
        page: {
          size: { width: twip(p.width), height: twip(p.height) },
          margin: {
            top: twip(p.rule.topGap),
            bottom: twip(12),
            left: twip(p.text.left),
            right: twip(p.width - p.text.right),
          },
        },
      },
      children: [
        new Paragraph({
          frame: {
            type: 'absolute',
            position: { x: 0, y: 0 },
            width: twip(p.width),
            height: twip(p.height),
            anchor: { horizontal: 'page', vertical: 'page' },
          },
          children: [
            new ImageRun({
              data: background,
              type: 'png',
              transformation: { width: Math.round(p.width * (96 / 25.4)), height: Math.round(p.height * (96 / 25.4)) },
            }),
          ],
        }),
        ...(await pageChildren(page, bodyFont, headerFont, handwriting.palette)),
      ],
    })
  }

  const docx = new Document({ sections })
  return Packer.toBlob(docx)
}

export async function downloadDocx(doc: NoteDocument): Promise<void> {
  const blob = await documentToDocx(doc)
  triggerDownload(blob, `${doc.title || 'notes'}.docx`)
}
