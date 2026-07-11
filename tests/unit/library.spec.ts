import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLibrary } from '@/store/library'

describe('library tags', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('toggles a tag on a note, keeps it unique and lowercase, and lists all tags', () => {
    const lib = useLibrary()
    lib.hydrate(
      [
        { id: 'a', title: 'A', createdAt: 0, updatedAt: 2, favorite: false },
        { id: 'b', title: 'B', createdAt: 0, updatedAt: 1, favorite: false },
      ],
      'a',
    )
    lib.toggleTag('a', 'Physics')
    lib.toggleTag('a', 'physics') // same tag lowercased -> removes it
    expect(lib.entries[0].tags).toEqual([])
    lib.toggleTag('a', 'Maths')
    lib.toggleTag('b', 'physics')
    expect(lib.entries[0].tags).toEqual(['maths'])
    expect(lib.allTags).toEqual(['maths', 'physics'])
  })
})

describe('library trash', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const lib = useLibrary()
    lib.hydrate(
      [
        { id: 'a', title: 'A', createdAt: 0, updatedAt: 2, favorite: false, tags: ['keep'] },
        { id: 'b', title: 'B', createdAt: 0, updatedAt: 1, favorite: true },
      ],
      'x', // no open note, so soft-delete never touches IndexedDB
    )
    return lib
  }

  it('soft-deletes a note out of every live list but keeps it in the trash', async () => {
    const lib = seed()
    await lib.deleteNote('a')
    expect(lib.recent.map((e) => e.id)).toEqual(['b'])
    expect(lib.favorites.map((e) => e.id)).toEqual(['b'])
    expect(lib.trash.map((e) => e.id)).toEqual(['a'])
    // A trashed note's tags drop out of the filter row.
    expect(lib.allTags).toEqual([])
  })

  it('restores a note back into the live library', async () => {
    const lib = seed()
    await lib.deleteNote('a')
    await lib.restoreNote('a')
    expect(lib.trash).toEqual([])
    expect(lib.recent.map((e) => e.id)).toContain('a')
    expect(lib.allTags).toEqual(['keep'])
  })

  it('orders the trash by when each note was deleted, newest first', async () => {
    const lib = seed()
    await lib.deleteNote('a')
    lib.entries.find((e) => e.id === 'a')!.deletedAt = 100
    await lib.deleteNote('b')
    lib.entries.find((e) => e.id === 'b')!.deletedAt = 200
    expect(lib.trash.map((e) => e.id)).toEqual(['b', 'a'])
  })
})

describe('library archive and pin', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const lib = useLibrary()
    lib.hydrate(
      [
        { id: 'a', title: 'Alpha', createdAt: 0, updatedAt: 2, favorite: false, tags: ['keep'] },
        { id: 'b', title: 'Bravo', createdAt: 0, updatedAt: 1, favorite: false },
      ],
      'x',
    )
    return lib
  }

  it('archives a note out of the main list into its own view, and brings it back', async () => {
    const lib = seed()
    await lib.archiveNote('a')
    expect(lib.recent.map((e) => e.id)).toEqual(['b'])
    expect(lib.archived.map((e) => e.id)).toEqual(['a'])
    expect(lib.allTags).toEqual([])
    await lib.unarchiveNote('a')
    expect(lib.archived).toEqual([])
    expect(lib.recent.map((e) => e.id)).toContain('a')
    expect(lib.allTags).toEqual(['keep'])
  })

  it('archiving clears a pin so a filed note does not float when it returns unpinned', async () => {
    const lib = seed()
    lib.togglePin('a')
    expect(lib.entries.find((e) => e.id === 'a')!.pinned).toBe(true)
    await lib.archiveNote('a')
    expect(lib.entries.find((e) => e.id === 'a')!.pinned).toBe(false)
  })

  it('a trashed or archived note is not counted among the live library', async () => {
    const lib = seed()
    await lib.archiveNote('a')
    await lib.deleteNote('b')
    expect(lib.recent).toEqual([])
    expect(lib.archived.map((e) => e.id)).toEqual(['a'])
    expect(lib.trash.map((e) => e.id)).toEqual(['b'])
  })
})

describe('library folders', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const lib = useLibrary()
    lib.hydrate(
      [
        { id: 'a', title: 'A', createdAt: 0, updatedAt: 2, favorite: false },
        { id: 'b', title: 'B', createdAt: 0, updatedAt: 1, favorite: false },
      ],
      'x',
      [],
    )
    return lib
  }

  it('nests folders and reads the path from the top down', () => {
    const lib = seed()
    const work = lib.createFolder('Work', null)
    const proj = lib.createFolder('Project', work)
    expect(lib.foldersIn(null).map((f) => f.name)).toEqual(['Work'])
    expect(lib.foldersIn(work).map((f) => f.name)).toEqual(['Project'])
    expect(lib.folderPath(proj).map((f) => f.name)).toEqual(['Work', 'Project'])
  })

  it('files a note into a folder and back to the top level', () => {
    const lib = seed()
    const work = lib.createFolder('Work', null)
    lib.moveNoteToFolder('a', work)
    expect(lib.entries.find((e) => e.id === 'a')!.folderId).toBe(work)
    lib.moveNoteToFolder('a', null)
    expect(lib.entries.find((e) => e.id === 'a')!.folderId).toBe(null)
  })

  it('deleting a folder lifts its notes and subfolders up to the parent', () => {
    const lib = seed()
    const work = lib.createFolder('Work', null)
    const proj = lib.createFolder('Project', work)
    lib.moveNoteToFolder('a', proj)
    lib.deleteFolder(proj)
    // The note and any child rise to Project's parent, Work.
    expect(lib.entries.find((e) => e.id === 'a')!.folderId).toBe(work)
    expect(lib.folders.some((f) => f.id === proj)).toBe(false)
  })

  it('folderPath does not hang on a broken parent loop', () => {
    const lib = seed()
    const one = lib.createFolder('One', null)
    const two = lib.createFolder('Two', one)
    // Force a cycle and make sure the walk still terminates.
    lib.folders.find((f) => f.id === one)!.parentId = two
    expect(lib.folderPath(two).length).toBeLessThanOrEqual(2)
  })
})
