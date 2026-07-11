// Snapshots one page of the note to a PNG image: the ruled sheet, the handwriting, and any
// ink, exactly as they sit on screen. Drawn at twice the pixel density so the image stays
// crisp, and on an opaque white ground so the sheet is not left transparent.
import { toPng } from 'html-to-image'
import { fileStem } from './toText'

export async function exportPageAsPng(page: HTMLElement, title: string): Promise<void> {
  const dataUrl = await toPng(page, { pixelRatio: 2, cacheBust: true, backgroundColor: '#ffffff' })
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `${fileStem(title)}.png`
  link.click()
}
