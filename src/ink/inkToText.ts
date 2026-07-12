// Turn handwriting drawn with the pen into editable text, using the browser's own on-device
// handwriting recogniser where it has one. Nothing leaves the device and no key is needed; where the
// browser has no recogniser the caller says so plainly rather than pretending. The recogniser wants
// pixel-scale coordinates, so the stroke points, which are stored in millimetres, are scaled up.
import type { Stroke } from '@/types'

interface HandwritingDrawing {
  addStroke: (stroke: { points: { x: number; y: number; t?: number }[] }) => void
  getPrediction: () => Promise<{ text: string }[]>
  clear?: () => void
}
interface HandwritingRecognizer {
  startDrawing: (hints?: Record<string, unknown>) => HandwritingDrawing
  finish?: () => void
}
interface HandwritingNavigator {
  createHandwritingRecognizer?: (constraint: { languages: string[] }) => Promise<HandwritingRecognizer>
}

const MM_TO_INK = 4

/** Whether this browser can recognise handwriting on the device. */
export function handwritingSupported(): boolean {
  return typeof navigator !== 'undefined' && 'createHandwritingRecognizer' in navigator
}

// Read a page's ink strokes as text. Returns the best transcription, or an empty string when the
// browser has no recogniser or nothing could be read.
export async function inkToText(strokes: Stroke[], language = navigator.language || 'en'): Promise<string> {
  const nav = navigator as unknown as HandwritingNavigator
  if (!nav.createHandwritingRecognizer) return ''
  const recognizer = await nav.createHandwritingRecognizer({ languages: [language] })
  const drawing = recognizer.startDrawing({ recognitionType: 'text' })
  let t = 0
  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue
    drawing.addStroke({
      points: stroke.points.map((p) => ({ x: p.x * MM_TO_INK, y: p.y * MM_TO_INK, t: (t += 15) })),
    })
  }
  const predictions = await drawing.getPrediction()
  drawing.clear?.()
  recognizer.finish?.()
  return predictions?.[0]?.text?.trim() ?? ''
}
