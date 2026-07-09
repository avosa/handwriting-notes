// A fresh document: one empty page with a single line ready to type into. Everything
// beyond this the writer builds with the tools, so the page starts as clean paper.
import type { NoteDocument, Page } from '@/types'
import { defaultPresetId } from '@/paper/sheetSpec'
import { uid } from '@/util/id'

export function blankPage(index = 0): Page {
  return {
    id: uid('p'),
    index,
    presetId: defaultPresetId,
    blocks: [{ id: uid('b'), type: 'text', text: { id: uid('t'), role: 'body', runs: [{ text: '' }] } }],
    strokes: [],
  }
}

export function blankDocument(): NoteDocument {
  const now = Date.now()
  return {
    id: uid('doc'),
    title: 'Untitled notes',
    pages: [blankPage(0)],
    createdAt: now,
    updatedAt: now,
  }
}
