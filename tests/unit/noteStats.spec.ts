import { describe, it, expect } from 'vitest'
import { noteStats } from '@/util/noteStats'
import type { NoteDocument } from '@/types'

function docWith(words: number): NoteDocument {
  const text = Array.from({ length: words }, (_, i) => `w${i}`).join(' ')
  return {
    id: 'd',
    title: '',
    createdAt: 0,
    updatedAt: 0,
    pages: [
      { id: 'p', index: 0, blocks: [{ id: 't', type: 'text', text: { id: 'x', role: 'body', runs: [{ text }] } }] },
    ],
  } as NoteDocument
}

describe('note stats', () => {
  it('counts words and rounds a reading time at an easy pace', () => {
    const s = noteStats(docWith(400))
    expect(s.words).toBe(400)
    expect(s.readingMinutes).toBe(2)
    expect(s.pages).toBe(1)
  })

  it('never rounds a short note down to zero minutes', () => {
    expect(noteStats(docWith(12)).readingMinutes).toBe(1)
  })

  it('reads an empty note as nothing to read', () => {
    const s = noteStats(docWith(0))
    expect(s.words).toBe(0)
    expect(s.readingMinutes).toBe(0)
  })
})
