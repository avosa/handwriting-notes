import { describe, it, expect } from 'vitest'
import { BlockStreamer } from '@/ai/blockStreamer'

const reply = JSON.stringify({
  title: 'Fractions',
  pages: [
    [
      { type: 'text', role: 'title', content: 'Fractions' },
      { type: 'text', role: 'body', content: 'A part of a whole.' },
      {
        type: 'diagram',
        heightRules: 8,
        spec: {
          kind: 'venn-disjoint',
          universeLabel: 'U',
          left: { label: 'A', color: '#000' },
          right: { label: 'B', color: '#111' },
          caption: 'apart',
        },
      },
    ],
  ],
})

describe('BlockStreamer', () => {
  it('emits each block once, as its object finishes', () => {
    const streamer = new BlockStreamer()
    const seen = []
    for (let i = 0; i < reply.length; i += 7) seen.push(...streamer.push(reply.slice(i, i + 7)))
    expect(seen).toHaveLength(3)
    expect(seen[0].type).toBe('text')
    expect(seen[2].type).toBe('diagram')
    expect(streamer.title).toBe('Fractions')
  })

  it('does not emit a block until it is complete', () => {
    const streamer = new BlockStreamer()
    const early = streamer.push('{"pages":[[{"type":"text","role":"body","content":"half ')
    expect(early).toHaveLength(0)
    const rest = streamer.push('of it"}]]}')
    expect(rest).toHaveLength(1)
    expect(rest[0].type === 'text' && rest[0].text.runs[0].text).toBe('half of it')
  })

  it('keeps braces inside strings from ending a block early', () => {
    const streamer = new BlockStreamer()
    const out = streamer.push('{"pages":[[{"type":"text","role":"body","content":"use { and } freely"}]]}')
    expect(out).toHaveLength(1)
    expect(out[0].type === 'text' && out[0].text.runs[0].text).toBe('use { and } freely')
  })
})
