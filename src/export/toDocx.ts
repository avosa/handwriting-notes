// Renders the document to a DOCX. Word cannot draw the ruled sheet as live vectors,
// so each page is a section whose background is the sheet, with the writing set in the
// handwriting fonts over it, real tables, and each figure placed as a crisp rendering
// of the same pen-drawn shape. The text stays real, selectable text.
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun as DocxTextRun,
  WidthType,
  type ISectionOptions,
} from 'docx'
import type { Block, NoteDocument, Page, TextRole, TextRun } from '@/types'
import { getPreset, ruleYs, type SheetPreset } from '@/paper/sheetSpec'
import { getHandwriting } from '@/handwriting/registry'
import { renderDiagram } from '@/diagrams/render'
import { getBlob } from '@/store/persistence'
import { hashSeed } from '@/diagrams/wobble'
import { useSettings } from '@/store/settings'
import { triggerDownload } from './toPdf'

const MM_TO_TWIP = 1440 / 25.4
const twip = (v: number) => Math.round(v * MM_TO_TWIP)
const px = (mmValue: number) => Math.round(mmValue * (96 / 25.4))

// The image formats Word can embed, mapped from a blob's mime; anything else is left out
// rather than embedded as the wrong kind.
function imageKind(mime: string): 'png' | 'jpg' | 'gif' | 'bmp' | null {
  if (mime.includes('png')) return 'png'
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('gif')) return 'gif'
  if (mime.includes('bmp')) return 'bmp'
  return null
}

const ROLE_SIZE: Record<TextRole, number> = {
  title: 40,
  subtitle: 26,
  heading: 30,
  subheading: 26,
  body: 24,
  caption: 20,
}

function fontFor(role: TextRole, bodyFont: string, headerFont: string): string {
  return role === 'title' || role === 'heading' ? headerFont : bodyFont
}
function roleColor(role: TextRole, palette: ReturnType<typeof getHandwriting>['palette']): string {
  return (
    role === 'title' ? palette.title : role === 'heading' || role === 'subheading' ? palette.heading : palette.ink
  ).replace('#', '')
}
function alignment(a: string | undefined, role: TextRole) {
  const value = a ?? (role === 'caption' || role === 'subtitle' ? 'center' : 'left')
  return value === 'justify' ? AlignmentType.JUSTIFIED : value === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT
}

function runs(list: TextRun[], font: string, size: number, fallbackColor: string): (DocxTextRun | ExternalHyperlink)[] {
  return (list.length ? list : [{ text: '' }]).map((r) => {
    const textRun = new DocxTextRun({
      text: r.text,
      font,
      size,
      bold: r.bold,
      italics: r.italic,
      underline: r.underline || r.link ? {} : undefined,
      color: r.link ? '4A72B0' : (r.color ?? fallbackColor).replace('#', ''),
      highlight: undefined,
      shading: r.highlight ? { fill: r.highlight.replace('#', '') } : undefined,
    })
    return r.link ? new ExternalHyperlink({ children: [textRun], link: r.link }) : textRun
  })
}

function sheetSvg(preset: SheetPreset): string {
  const style = preset.style ?? 'lined'
  const paper = `<rect width="${preset.width}" height="${preset.height}" fill="${preset.background}"/>`
  const svg = (inner: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${preset.width} ${preset.height}">${paper}${inner}</svg>`

  if (style === 'blank') return svg('')
  if (style === 'grid' || style === 'dots') {
    const s = preset.rule.spacing
    const mark =
      style === 'grid'
        ? `<path d="M ${s} 0 L 0 0 0 ${s}" fill="none" stroke="${preset.rule.color}" stroke-width="0.24"/>`
        : `<circle cx="0" cy="0" r="0.32" fill="${preset.rule.color}"/>`
    return svg(
      `<defs><pattern id="p" width="${s}" height="${s}" patternUnits="userSpaceOnUse">${mark}</pattern></defs>` +
        `<rect width="${preset.width}" height="${preset.height}" fill="url(#p)"/>`,
    )
  }
  const rules = ruleYs(preset)
    .map(
      (y) =>
        `<line x1="0" y1="${y}" x2="${preset.width}" y2="${y}" stroke="${preset.rule.color}" stroke-width="0.32"/>`,
    )
    .join('')
  return svg(
    `${rules}<line x1="${preset.margin.left}" y1="0" x2="${preset.margin.left}" y2="${preset.height}" stroke="${preset.margin.color}" stroke-width="0.4"/>`,
  )
}

function diagramSvg(block: Extract<Block, { type: 'diagram' }>, fontFamily: string, fontScale = 1): string {
  const d = renderDiagram(block.spec, hashSeed(block.id))
  const paths = d.paths
    .map(
      (p) =>
        `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${d.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`,
    )
    .join('')
  const labels = d.labels
    .map(
      (l) =>
        `<text x="${l.x}" y="${l.y}" fill="${l.color}" font-size="${l.size * fontScale}" text-anchor="${l.anchor}" font-family="${fontFamily}">${escapeXml(l.text)}</text>`,
    )
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}">${paths}${labels}</svg>`
}
function escapeXml(text: string): string {
  return text.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'))
}

async function svgToPng(svg: string, w: number, h: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('A figure could not be drawn.'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(image, 0, 0, w, h)
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function blockToChildren(
  block: Block,
  preset: SheetPreset,
  bodyFont: string,
  headerFont: string,
  palette: ReturnType<typeof getHandwriting>['palette'],
): Promise<(Paragraph | Table)[]> {
  const colWidthMm = preset.text.right - preset.text.left
  const lineTwip = twip(preset.rule.spacing * preset.text.leadingRules)
  // The block's font-size dial scales its writing on the exported page too.
  const s = block.scale ?? 1
  const sized = (base: number) => Math.round(base * s)

  if (block.type === 'text') {
    const t = block.text
    return [
      new Paragraph({
        alignment: alignment(t.align, t.role),
        spacing: { line: lineTwip, lineRule: 'exact', before: 0, after: 0 },
        children: runs(
          t.runs,
          fontFor(t.role, bodyFont, headerFont),
          sized(ROLE_SIZE[t.role]),
          roleColor(t.role, palette),
        ),
      }),
    ]
  }
  if (block.type === 'list') {
    return block.items.map((item, i) => {
      // A task list writes a plain checkbox marker before each line rather than a bullet, so
      // the tick state travels into the document even where a checkbox control cannot.
      if (block.checked) {
        const box = block.checked[i] ? '[x] ' : '[ ] '
        return new Paragraph({
          spacing: { line: lineTwip, lineRule: 'exact' },
          children: [
            new DocxTextRun({
              text: box,
              font: bodyFont,
              size: sized(ROLE_SIZE.body),
              color: palette.ink.replace('#', ''),
            }),
            ...runs(item, bodyFont, sized(ROLE_SIZE.body), palette.ink),
          ],
        })
      }
      return new Paragraph({
        spacing: { line: lineTwip, lineRule: 'exact' },
        bullet: block.ordered ? undefined : { level: 0 },
        numbering: block.ordered ? { reference: 'ordered', level: 0 } : undefined,
        children: runs(item, bodyFont, sized(ROLE_SIZE.body), palette.ink),
        ...(block.ordered ? { text: `${i + 1}.` } : {}),
      })
    })
  }
  if (block.type === 'table') {
    const makeRow = (cells: string[], head: boolean) =>
      new TableRow({
        children: cells.map(
          (c) =>
            new TableCell({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new DocxTextRun({
                      text: c,
                      font: bodyFont,
                      size: sized(ROLE_SIZE.body),
                      bold: head,
                      color: palette.ink.replace('#', ''),
                    }),
                  ],
                }),
              ],
            }),
        ),
      })
    const rows = [makeRow(block.header, true), ...block.rows.map((r) => makeRow(r, false))]
    const out: (Paragraph | Table)[] = []
    if (block.caption)
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new DocxTextRun({
              text: block.caption,
              font: bodyFont,
              size: ROLE_SIZE.caption,
              color: palette.ink.replace('#', ''),
            }),
          ],
        }),
      )
    out.push(new Table({ width: { size: px(colWidthMm) * 15, type: WidthType.DXA }, rows }))
    return out
  }
  if (block.type === 'callouts') {
    const row = new TableRow({
      children: block.boxes.map(
        (box) =>
          new TableCell({
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: runs(box.heading, bodyFont, sized(ROLE_SIZE.body), box.color),
              }),
              ...box.items.map(
                (it) => new Paragraph({ children: runs(it, bodyFont, sized(ROLE_SIZE.body), palette.ink) }),
              ),
            ],
          }),
      ),
    })
    const out: (Paragraph | Table)[] = []
    if (block.caption)
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new DocxTextRun({
              text: block.caption,
              font: bodyFont,
              size: ROLE_SIZE.caption,
              color: palette.ink.replace('#', ''),
            }),
          ],
        }),
      )
    out.push(new Table({ width: { size: px(colWidthMm) * 15, type: WidthType.DXA }, rows: [row] }))
    return out
  }
  if (block.type === 'quote') {
    return [
      new Paragraph({
        spacing: { line: lineTwip, lineRule: 'exact' },
        indent: { left: twip(6) },
        border: { left: { style: 'single', size: 18, space: 8, color: '4A72B0' } },
        children: runs(block.runs, bodyFont, sized(ROLE_SIZE.body), palette.ink),
      }),
    ]
  }
  if (block.type === 'code') {
    return block.text.split('\n').map(
      (line) =>
        new Paragraph({
          spacing: { line: lineTwip, lineRule: 'exact' },
          shading: { fill: 'F0F2F6' },
          children: [new DocxTextRun({ text: line || ' ', font: 'Consolas', size: sized(ROLE_SIZE.body) })],
        }),
    )
  }
  if (block.type === 'divider') {
    return [
      new Paragraph({
        spacing: { line: lineTwip, lineRule: 'exact' },
        border: { bottom: { style: 'single', size: 8, space: 1, color: 'AAAAAA' } },
        children: [new DocxTextRun({ text: '', font: bodyFont })],
      }),
    ]
  }
  if (block.type === 'image') {
    const blob = await getBlob(block.blobRef)
    const kind = blob && imageKind(blob.type)
    if (!blob || !kind) return []
    const data = new Uint8Array(await blob.arrayBuffer())
    const imageHeightMm = block.heightRules * preset.rule.spacing * preset.text.leadingRules
    return [
      new Paragraph({
        children: [
          new ImageRun({ data, type: kind, transformation: { width: px(colWidthMm), height: px(imageHeightMm) } }),
        ],
      }),
    ]
  }
  // diagram
  const heightMm = block.heightRules * preset.rule.spacing * preset.text.leadingRules
  const png = await svgToPng(diagramSvg(block, bodyFont, s), Math.round(colWidthMm * 4), Math.round(heightMm * 4))
  return [
    new Paragraph({
      children: [
        new ImageRun({ data: png, type: 'png', transformation: { width: px(colWidthMm), height: px(heightMm) } }),
      ],
    }),
  ]
}

async function pageChildren(
  page: Page,
  preset: SheetPreset,
  bodyFont: string,
  headerFont: string,
  palette: ReturnType<typeof getHandwriting>['palette'],
) {
  const children: (Paragraph | Table)[] = []
  for (const block of page.blocks)
    children.push(...(await blockToChildren(block, preset, bodyFont, headerFont, palette)))
  return children
}

export async function documentToDocx(doc: NoteDocument): Promise<Blob> {
  const handwriting = getHandwriting(useSettings().activeHandwritingId)
  const bodyFont = handwriting.bodyFont
  const headerFont = handwriting.headerFont
  const first = getPreset(doc.pages[0]?.presetId ?? '1C')
  const background = await svgToPng(sheetSvg(first), Math.round(first.width * 4), Math.round(first.height * 4))

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
              transformation: { width: px(p.width), height: px(p.height) },
            }),
          ],
        }),
        ...(await pageChildren(page, p, bodyFont, headerFont, handwriting.palette)),
      ],
    })
  }

  return Packer.toBlob(
    new Document({
      numbering: {
        config: [
          {
            reference: 'ordered',
            levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }],
          },
        ],
      },
      sections,
    }),
  )
}

export async function downloadDocx(doc: NoteDocument): Promise<void> {
  triggerDownload(await documentToDocx(doc), `${doc.title || 'notes'}.docx`)
}
