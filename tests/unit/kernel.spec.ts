import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { can, localOwner } from '@/kernel/policy'
import type { Actor, Resource } from '@/kernel/types'
import { perform, query, mutate, tools } from '@/kernel/kernel'
import { useLibrary } from '@/store/library'

const viewer: Actor = { kind: 'human', id: 'guest', role: 'viewer' }
const agentEditor: Actor = { kind: 'agent', id: 'bot', role: 'editor' }
const note: Resource = { kind: 'note', noteId: 'a' }

describe('kernel policy', () => {
  it('lets an owner do everything and a viewer only read and retrieve', () => {
    expect(can(localOwner, 'write', note)).toBe(true)
    expect(can(localOwner, 'delete', note)).toBe(true)
    expect(can(viewer, 'read', note)).toBe(true)
    expect(can(viewer, 'retrieve', note)).toBe(true)
    expect(can(viewer, 'write', note)).toBe(false)
    expect(can(viewer, 'delete', note)).toBe(false)
  })

  it('treats an agent as a first-class actor, gated by its role', () => {
    expect(can(agentEditor, 'write', note)).toBe(true)
    expect(can(agentEditor, 'delete', note)).toBe(false) // editors cannot delete
  })
})

describe('kernel tools', () => {
  it('describes every tool so an agent can discover them', () => {
    const names = tools().map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining(['note.read', 'note.list', 'note.tag', 'block.remove', 'search', 'generate']),
    )
    // Each tool carries a capability and an input description.
    for (const t of tools()) {
      expect(['read', 'write', 'delete', 'retrieve', 'generate', 'admin']).toContain(t.capability)
      expect(typeof t.description).toBe('string')
    }
  })
})

describe('kernel perform', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('runs an allowed action and denies a forbidden one', async () => {
    const library = useLibrary()
    library.hydrate([{ id: 'a', title: 'Alpha', createdAt: 0, updatedAt: 1, favorite: false }], 'a')

    // Owner may list notes.
    const list = await perform<{ id: string }[]>('note.list')
    expect(list.map((n) => n.id)).toEqual(['a'])

    // Owner may tag; the change lands on the store.
    await perform('note.tag', { tag: 'Exam' })
    expect(library.entries[0].tags).toEqual(['exam'])

    // A viewer may not tag.
    await expect(perform('note.tag', { tag: 'nope' }, viewer)).rejects.toThrow(/may not write/)
  })

  it('enforces intent: query cannot run a write tool, mutate cannot run a read tool', async () => {
    await expect(query('note.tag', { tag: 'x' })).rejects.toThrow(/not usable here/)
    await expect(mutate('note.list')).rejects.toThrow(/not usable here/)
  })

  it('rejects an unknown tool', async () => {
    await expect(perform('does.not.exist')).rejects.toThrow(/Unknown tool/)
  })
})
