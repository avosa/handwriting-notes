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
