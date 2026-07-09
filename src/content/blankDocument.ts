// A fresh document: one empty page with a single line ready to type into. Templates lay
// out a couple of starter lines so a common note begins with its shape, but everything
// stays plain editable blocks the writer can change.
import type { Block, NoteDocument, Page, TextRole } from '@/types'
import { defaultPresetId } from '@/paper/sheetSpec'
import { uid } from '@/util/id'

function textBlock(role: TextRole, text = ''): Block {
  return { id: uid('b'), type: 'text', text: { id: uid('t'), role, runs: [{ text }] } }
}

export function blankPage(index = 0): Page {
  return { id: uid('p'), index, presetId: defaultPresetId, blocks: [textBlock('body')], strokes: [] }
}

function pageOf(blocks: Block[]): Page {
  return { id: uid('p'), index: 0, presetId: defaultPresetId, blocks, strokes: [] }
}

function document(title: string, blocks: Block[]): NoteDocument {
  const now = Date.now()
  return { id: uid('doc'), title, pages: [pageOf(blocks)], createdAt: now, updatedAt: now }
}

export function blankDocument(): NoteDocument {
  return document('Untitled notes', [textBlock('body')])
}

export interface TemplateInfo {
  key: string
  name: string
  hint: string
}

export const templates: TemplateInfo[] = [
  { key: 'blank', name: 'Blank note', hint: 'A clean ruled page' },
  { key: 'titled', name: 'Titled note', hint: 'A title and a place to start' },
  { key: 'cornell', name: 'Cornell notes', hint: 'Cues, notes, and a summary' },
  { key: 'meeting', name: 'Meeting notes', hint: 'Agenda, notes, and actions' },
]

// Build a starter note for a template. Each is a normal note that can be edited freely.
export function noteFromTemplate(key: string): NoteDocument {
  switch (key) {
    case 'titled':
      return document('Untitled notes', [textBlock('title'), textBlock('body')])
    case 'cornell':
      return document('Cornell notes', [
        textBlock('title', 'Topic'),
        textBlock('heading', 'Cues'),
        textBlock('body'),
        textBlock('heading', 'Notes'),
        textBlock('body'),
        textBlock('heading', 'Summary'),
        textBlock('body'),
      ])
    case 'meeting':
      return document('Meeting notes', [
        textBlock('title', 'Meeting'),
        textBlock('heading', 'Agenda'),
        { id: uid('b'), type: 'list', ordered: true, items: [[{ text: '' }]] },
        textBlock('heading', 'Notes'),
        textBlock('body'),
        textBlock('heading', 'Actions'),
        { id: uid('b'), type: 'list', ordered: false, items: [[{ text: '' }]] },
      ])
    default:
      return blankDocument()
  }
}
