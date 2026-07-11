// A quick read on how much a note holds: how many words and characters it carries, how long
// it would take to read at an easy pace, and how many pages it spans. Counted from the same
// plain-text rendering the exporter uses, so what is counted is what a reader would read.
import type { NoteDocument } from '@/types'
import { toPlainText } from '@/export/toText'

const WORDS_PER_MINUTE = 200

export interface NoteStats {
  words: number
  characters: number
  readingMinutes: number
  pages: number
}

export function noteStats(doc: NoteDocument): NoteStats {
  const text = toPlainText(doc).trim()
  const words = text ? text.split(/\s+/).length : 0
  const characters = text.replace(/\s/g, '').length
  return {
    words,
    characters,
    readingMinutes: words ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0,
    pages: doc.pages.length,
  }
}
