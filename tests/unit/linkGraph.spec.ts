import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseWikiLinks } from '@/home/linkGraph'

// Three notes: Alpha links to Beta and Gamma; Beta links back to Alpha; Gamma links nowhere.
vi.mock('@/store/persistence', () => ({
  loadAllNotes: async () => [
    { id: 'a', title: 'Alpha' },
    { id: 'b', title: 'Beta' },
    { id: 'g', title: 'Gamma' },
  ],
}))
vi.mock('@/export/toText', () => ({
  toPlainText: (n: { id: string }) =>
    n.id === 'a'
      ? 'See [[Beta]] and also [[gamma]] for more.'
      : n.id === 'b'
        ? 'Back to [[Alpha]].'
        : 'A leaf note with no links.',
}))

import { buildLinkIndex, useLinkGraph } from '@/home/linkGraph'

describe('parseWikiLinks', () => {
  it('pulls every bracketed title out, trimmed and lowercased', () => {
    expect(parseWikiLinks('a [[One]] then [[ two ]] end')).toEqual(['one', 'two'])
    expect(parseWikiLinks('no links here')).toEqual([])
  })
})

describe('link graph', () => {
  beforeEach(async () => {
    await buildLinkIndex()
  })

  it('resolves outgoing links by title, case-insensitively', () => {
    const { linksOut } = useLinkGraph()
    expect(
      linksOut('a')
        .map((n) => n.id)
        .sort(),
    ).toEqual(['b', 'g'])
    expect(linksOut('g')).toEqual([])
  })

  it('finds the notes that link back to a note', () => {
    const { backlinks } = useLinkGraph()
    expect(backlinks('a').map((n) => n.id)).toEqual(['b'])
    expect(backlinks('b').map((n) => n.id)).toEqual(['a'])
    expect(backlinks('g').map((n) => n.id)).toEqual(['a'])
  })

  it('builds a graph of only the notes that take part in a link', () => {
    const { graph } = useLinkGraph()
    const g = graph()
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'g'])
    // Alpha->Beta, Alpha->Gamma, Beta->Alpha.
    expect(g.edges.length).toBe(3)
  })
})
