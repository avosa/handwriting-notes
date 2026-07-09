// The shelf of notes. It holds the list shown on the home screen and which note is
// open, and it moves between notes: starting a new one, opening, renaming, duplicating,
// deleting, and marking a favourite. The open note itself lives in the document store;
// this keeps that in step with the list and with what is saved on disk.
import { defineStore } from 'pinia'
import type { LibraryEntry, NoteDocument } from '@/types'
import { blankDocument, noteFromTemplate } from '@/content/blankDocument'
import { uid } from '@/util/id'
import { useDocument } from './document'
import { loadNote, saveNote, deleteNote as removeNote } from './persistence'

interface LibraryState {
  entries: LibraryEntry[]
  currentId: string
}

function entryFor(doc: NoteDocument, favorite = false): LibraryEntry {
  return { id: doc.id, title: doc.title, createdAt: doc.createdAt, updatedAt: doc.updatedAt, favorite }
}

export const useLibrary = defineStore('library', {
  state: (): LibraryState => ({ entries: [], currentId: '' }),
  getters: {
    recent: (state) => [...state.entries].sort((a, b) => b.updatedAt - a.updatedAt),
    favorites(): LibraryEntry[] {
      return this.recent.filter((e) => e.favorite)
    },
    current: (state) => state.entries.find((e) => e.id === state.currentId) ?? null,
  },
  actions: {
    hydrate(entries: LibraryEntry[], currentId: string) {
      this.entries = entries
      this.currentId = currentId
    },
    // Keep a note's list row in step as it is edited.
    touch(id: string, title: string, updatedAt: number) {
      const entry = this.entries.find((e) => e.id === id)
      if (entry) {
        entry.title = title
        entry.updatedAt = updatedAt
      }
    },
    // Save the open note and keep its list row in step before moving away from it.
    async parkCurrent() {
      const documentStore = useDocument()
      this.touch(documentStore.doc.id, documentStore.doc.title, documentStore.doc.updatedAt)
      await saveNote(documentStore.doc)
    },
    async openNote(id: string) {
      const documentStore = useDocument()
      if (id === this.currentId) return
      await this.parkCurrent()
      const doc = await loadNote(id)
      if (!doc) return
      documentStore.hydrate(doc)
      this.currentId = id
    },
    async createNote(template = 'blank') {
      const documentStore = useDocument()
      await this.parkCurrent()
      const doc = template === 'blank' ? blankDocument() : noteFromTemplate(template)
      await saveNote(doc)
      this.entries.push(entryFor(doc))
      documentStore.hydrate(doc)
      this.currentId = doc.id
      return doc.id
    },
    async duplicateNote(id: string) {
      if (id === this.currentId) await this.parkCurrent()
      const source = await loadNote(id)
      if (!source) return
      const now = Date.now()
      const copy: NoteDocument = {
        ...JSON.parse(JSON.stringify(source)),
        id: uid('doc'),
        title: `${source.title} copy`,
        createdAt: now,
        updatedAt: now,
      }
      await saveNote(copy)
      this.entries.push(entryFor(copy))
    },
    async deleteNote(id: string) {
      await removeNote(id)
      this.entries = this.entries.filter((e) => e.id !== id)
      if (id === this.currentId) {
        if (this.entries.length) await this.openInto(this.recent[0].id)
        else await this.createNote('blank')
      }
    },
    async openInto(id: string) {
      const documentStore = useDocument()
      const doc = await loadNote(id)
      if (doc) {
        documentStore.hydrate(doc)
        this.currentId = id
      }
    },
    rename(id: string, title: string) {
      const documentStore = useDocument()
      const clean = title.trim() || 'Untitled notes'
      if (id === this.currentId) documentStore.setTitle(clean)
      this.touch(id, clean, Date.now())
    },
    toggleFavorite(id: string) {
      const entry = this.entries.find((e) => e.id === id)
      if (entry) entry.favorite = !entry.favorite
    },
  },
})
