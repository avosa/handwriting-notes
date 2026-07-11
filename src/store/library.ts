// The shelf of notes. It holds the list shown on the home screen and which note is
// open, and it moves between notes: starting a new one, opening, renaming, duplicating,
// deleting, and marking a favourite. The open note itself lives in the document store;
// this keeps that in step with the list and with what is saved on disk.
import { defineStore } from 'pinia'
import type { Folder, LibraryEntry, NoteDocument, SavedSearch } from '@/types'
import { blankDocument, noteFromTemplate, documentFromBlocks } from '@/content/blankDocument'
import type { Block } from '@/types'
import { uid } from '@/util/id'
import { APP_SLUG } from '@/brand'
import { useDocument } from './document'
import {
  loadNote,
  saveNote,
  deleteNote as removeNote,
  deleteBlob,
  exportAll,
  importAll,
  loadLibrary,
  saveVersion,
  getVersion,
  deleteVersionsFor,
  deleteVectorsForNote,
  deleteCardsForNote,
} from './persistence'

interface LibraryState {
  entries: LibraryEntry[]
  folders: Folder[]
  savedSearches: SavedSearch[]
  currentId: string
}

function entryFor(doc: NoteDocument, favorite = false): LibraryEntry {
  return { id: doc.id, title: doc.title, createdAt: doc.createdAt, updatedAt: doc.updatedAt, favorite }
}

export const useLibrary = defineStore('library', {
  state: (): LibraryState => ({ entries: [], folders: [], savedSearches: [], currentId: '' }),
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
    // The subfolders directly inside a folder (or the top level when null), sorted by name.
    foldersIn(state) {
      return (parentId: string | null): Folder[] =>
        state.folders.filter((f) => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name))
    },
    folderById(state) {
      return (id: string | null): Folder | null => (id ? (state.folders.find((f) => f.id === id) ?? null) : null)
    },
    // The trail from the top level down to a folder, for a breadcrumb. Guards against a broken
    // parent chain so a stray loop can never hang the walk.
    folderPath(state) {
      return (id: string | null): Folder[] => {
        const trail: Folder[] = []
        const seen = new Set<string>()
        let current = id
        while (current && !seen.has(current)) {
          seen.add(current)
          const folder = state.folders.find((f) => f.id === current)
          if (!folder) break
          trail.unshift(folder)
          current = folder.parentId
        }
        return trail
      }
    },
  },
  actions: {
    hydrate(entries: LibraryEntry[], currentId: string, folders: Folder[] = [], savedSearches: SavedSearch[] = []) {
      this.entries = entries
      this.folders = folders
      this.savedSearches = savedSearches
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
    // Save the open note and keep its list row in step before moving away from it. Leaving a
    // note is a natural moment to record a snapshot, so the history gathers a point each editing
    // session; saveVersion decides for itself whether enough has changed to be worth keeping.
    async parkCurrent() {
      const documentStore = useDocument()
      this.touch(documentStore.doc.id, documentStore.doc.title, documentStore.doc.updatedAt)
      await saveNote(documentStore.doc)
      await saveVersion(documentStore.doc)
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
    async createNote(template = 'blank', folderId: string | null = null) {
      const documentStore = useDocument()
      await this.parkCurrent()
      const doc = template === 'blank' ? blankDocument() : noteFromTemplate(template)
      await saveNote(doc)
      const entry = entryFor(doc)
      if (folderId) entry.folderId = folderId
      this.entries.push(entry)
      documentStore.hydrate(doc)
      this.currentId = doc.id
      return doc.id
    },
    // Bring in a note built from blocks that came from outside — an imported document, a paste, or
    // an agent — as a new note, opened. The single seam every ingestion path lands on.
    async importNote(title: string, blocks: Block[]): Promise<string> {
      const documentStore = useDocument()
      await this.parkCurrent()
      const doc = documentFromBlocks(title, blocks)
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
      await deleteVersionsFor(id)
      await deleteVectorsForNote(id)
      await deleteCardsForNote(id)
      if (doc) {
        for (const page of doc.pages) {
          for (const block of page.blocks) {
            if (block.type === 'image') await deleteBlob(block.blobRef)
          }
        }
      }
      this.entries = this.entries.filter((e) => e.id !== id)
    },
    // Record a snapshot of the open note on demand, so the writer can mark a point to come back
    // to. Forced, so it is kept even if little has changed since the last one.
    async snapshotCurrent() {
      const documentStore = useDocument()
      await saveNote(documentStore.doc)
      await saveVersion(documentStore.doc, true)
    },
    // Roll the open note back to an earlier snapshot. The current state is snapshotted first, so
    // a restore is itself undoable from the history; then the old version is loaded and saved.
    async restoreVersion(versionId: string) {
      const documentStore = useDocument()
      const version = await getVersion(versionId)
      if (!version || version.noteId !== this.currentId) return
      await saveVersion(documentStore.doc, true)
      // Bring the old content back as a fresh edit, so the restored note sits at the top of the
      // library rather than sinking to where its original timestamp would put it.
      const restored: NoteDocument = { ...JSON.parse(JSON.stringify(version.doc)), updatedAt: Date.now() }
      documentStore.hydrate(restored)
      await saveNote(restored)
      this.touch(restored.id, restored.title, restored.updatedAt)
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
    // Make a folder inside another (or at the top level when parentId is null) and return its id.
    createFolder(name: string, parentId: string | null = null): string {
      const clean = name.trim() || 'New folder'
      const folder: Folder = { id: uid('fol'), name: clean, parentId, createdAt: Date.now() }
      this.folders.push(folder)
      return folder.id
    },
    renameFolder(id: string, name: string) {
      const folder = this.folders.find((f) => f.id === id)
      if (folder) folder.name = name.trim() || folder.name
    },
    // Remove a folder, lifting whatever it held up to its own parent so nothing is lost: its
    // notes move to the parent folder and its subfolders are reparented there too.
    deleteFolder(id: string) {
      const folder = this.folders.find((f) => f.id === id)
      if (!folder) return
      const up = folder.parentId
      for (const child of this.folders) if (child.parentId === id) child.parentId = up
      for (const entry of this.entries) if (entry.folderId === id) entry.folderId = up
      this.folders = this.folders.filter((f) => f.id !== id)
    },
    // File a note into a folder, or to the top level when folderId is null.
    moveNoteToFolder(noteId: string, folderId: string | null) {
      const entry = this.entries.find((e) => e.id === noteId)
      if (entry) entry.folderId = folderId
    },
    // Keep a search — its text and tag — under a name, so a smart collection is one tap away.
    saveSearch(name: string, query: string, tag: string | null): string {
      const search: SavedSearch = { id: uid('search'), name: name.trim() || 'Saved search', query, tag }
      this.savedSearches.push(search)
      return search.id
    },
    deleteSavedSearch(id: string) {
      this.savedSearches = this.savedSearches.filter((s) => s.id !== id)
    },
    // Bulk actions over a set of notes, so a multi-selection can be filed, favourited, or
    // cleared in one move. Each defers to the single-note action so all the edge handling
    // (reopening the current note on delete, clearing a pin on archive) stays in one place.
    async deleteNotes(ids: string[]) {
      for (const id of ids) await this.deleteNote(id)
    },
    async archiveNotes(ids: string[]) {
      for (const id of ids) await this.archiveNote(id)
    },
    moveNotesToFolder(ids: string[], folderId: string | null) {
      for (const id of ids) this.moveNoteToFolder(id, folderId)
    },
    // Favourite every note in the set, or unfavourite them when they are all already favourites,
    // so the button toggles the whole selection the obvious way.
    favoriteNotes(ids: string[]) {
      const allFav = ids.every((id) => this.entries.find((e) => e.id === id)?.favorite)
      for (const id of ids) {
        const entry = this.entries.find((e) => e.id === id)
        if (entry) entry.favorite = !allFav
      }
    },
    tagNotes(ids: string[], tag: string) {
      const clean = tag.trim().toLowerCase()
      if (!clean) return
      for (const id of ids) {
        const entry = this.entries.find((e) => e.id === id)
        if (!entry) continue
        const tags = entry.tags ?? []
        if (!tags.includes(clean)) entry.tags = [...tags, clean]
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
      a.download = `${APP_SLUG}-backup-${stamp}.json`
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
