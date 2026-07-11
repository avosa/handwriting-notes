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
