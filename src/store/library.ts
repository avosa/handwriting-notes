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
    // The live notes, newest first. Trashed and archived notes are held in `entries` but
    // kept out of the main list, so a note that was deleted or filed away disappears from
    // here until it is restored or unarchived.
    recent: (state) =>
      state.entries.filter((e) => !e.deletedAt && !e.archivedAt).sort((a, b) => b.updatedAt - a.updatedAt),
    favorites(): LibraryEntry[] {
      return this.recent.filter((e) => e.favorite)
    },
    // Notes filed away in the archive, most recently archived first.
    archived: (state) =>
      state.entries
        .filter((e) => !e.deletedAt && e.archivedAt)
        .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0)),
    // Notes in the trash, most recently deleted first, for the recently-deleted view.
    trash: (state) => state.entries.filter((e) => e.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    // Every label used across the live library, sorted, for a filter row.
    allTags(): string[] {
      const set = new Set<string>()
      for (const e of this.entries) if (!e.deletedAt && !e.archivedAt) for (const t of e.tags ?? []) set.add(t)
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
    // Move a note to the trash. The note and its pictures are kept so it can be brought
    // back; it simply leaves every list. If the open note is the one deleted, another live
    // note is opened, or a fresh one started when none remain.
    async deleteNote(id: string) {
      const entry = this.entries.find((e) => e.id === id)
      if (!entry) return
      entry.deletedAt = Date.now()
      if (id === this.currentId) {
        const next = this.recent[0]
        if (next) await this.openInto(next.id)
        else await this.createNote('blank')
      }
    },
    // Bring a note back from the trash into the live library.
    async restoreNote(id: string) {
      const entry = this.entries.find((e) => e.id === id)
      if (entry) {
        delete entry.deletedAt
        entry.updatedAt = Date.now()
      }
    },
    // Delete a note for good: drop its record and free the pictures it held, so it leaves
    // nothing behind in storage. This cannot be undone.
    async purgeNote(id: string) {
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
    },
    // Empty the whole trash at once, purging every note in it for good.
    async emptyTrash() {
      for (const entry of this.trash) await this.purgeNote(entry.id)
    },
    // Purge trashed notes older than the grace period, run once at startup so the trash
    // does not grow without bound. Thirty days matches the familiar recently-deleted window.
    async purgeExpiredTrash() {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
      for (const entry of this.trash) {
        if ((entry.deletedAt ?? 0) < cutoff) await this.purgeNote(entry.id)
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
    // Pin a note to the top of the library, or release it. Pinned notes lead every sort.
    togglePin(id: string) {
      const entry = this.entries.find((e) => e.id === id)
      if (entry) entry.pinned = !entry.pinned
    },
    // File a note away into the archive. Like the trash it leaves the main list, but it is a
    // tidy keep rather than a delete: it stays until unarchived and is never purged. If the
    // open note is archived, another live note is opened, or a fresh one started when none remain.
    async archiveNote(id: string) {
      const entry = this.entries.find((e) => e.id === id)
      if (!entry) return
      entry.archivedAt = Date.now()
      entry.pinned = false
      if (id === this.currentId) {
        const next = this.recent[0]
        if (next) await this.openInto(next.id)
        else await this.createNote('blank')
      }
    },
    // Bring an archived note back into the main library.
    async unarchiveNote(id: string) {
      const entry = this.entries.find((e) => e.id === id)
      if (entry) {
        delete entry.archivedAt
        entry.updatedAt = Date.now()
      }
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
