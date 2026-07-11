// The shelf of notes. It holds the list shown on the home screen and which note is
// open, and it moves between notes: starting a new one, opening, renaming, duplicating,
// deleting, and marking a favourite. The open note itself lives in the document store;
// this keeps that in step with the list and with what is saved on disk.
import { defineStore } from 'pinia'
import type { LibraryEntry, NoteDocument } from '@/types'
import { blankDocument, noteFromTemplate } from '@/content/blankDocument'
import { uid } from '@/util/id'
import { useDocument } from './document'
import {
  loadNote,
  saveNote,
  deleteNote as removeNote,
  deleteBlob,
  exportAll,
  importAll,
  loadLibrary,
} from './persistence'

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
    // Every label used across the library, sorted, for a filter row.
    allTags(): string[] {
      const set = new Set<string>()
      for (const e of this.entries) for (const t of e.tags ?? []) set.add(t)
      return [...set].sort()
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
      // Free the pictures the note held before dropping it, so a deleted note leaves nothing
      // behind in storage. A deleted note cannot be brought back, so its blobs are safe to go.
      const doc = await loadNote(id)
      await removeNote(id)
      if (doc) {
        for (const page of doc.pages) {
          for (const block of page.blocks) {
            if (block.type === 'image') await deleteBlob(block.blobRef)
          }
        }
      }
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
    // Add or remove a label on a note, trimmed and kept unique, so the library can be filtered by it.
    toggleTag(id: string, tag: string) {
      const clean = tag.trim().toLowerCase()
      if (!clean) return
      const entry = this.entries.find((e) => e.id === id)
      if (!entry) return
      const tags = entry.tags ?? []
      entry.tags = tags.includes(clean) ? tags.filter((t) => t !== clean) : [...tags, clean]
    },
    // Write the whole library out to a file the writer can keep or move to another device.
    async exportBackup() {
      await this.parkCurrent()
      const data = await exportAll()
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const stamp = new Date(Date.now()).toISOString().slice(0, 10)
      const a = document.createElement('a')
      a.href = url
      a.download = `handwriting-notes-backup-${stamp}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
    // Restore a backup file, merging it in, then refresh the list so the restored notes appear.
    async importBackup(file: File): Promise<boolean> {
      try {
        const data = JSON.parse(await file.text())
        if (!data || typeof data !== 'object' || !Array.isArray(data.notes)) return false
        await importAll(data)
        this.entries = await loadLibrary()
        return true
      } catch {
        return false
      }
    },
  },
})
