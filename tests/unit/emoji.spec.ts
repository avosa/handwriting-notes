import { describe, it, expect } from 'vitest'
import { emojiGroups, searchEmoji } from '@/ui/emojiData'

describe('emoji picker data', () => {
  it('offers grouped emoji and finds them by keyword', () => {
    expect(emojiGroups.length).toBeGreaterThan(0)
    // Every entry carries a character and keywords to search by.
    for (const group of emojiGroups) for (const e of group.emoji) expect(e.char && e.keywords).toBeTruthy()
    // An empty query returns everything; a keyword narrows it.
    const all = searchEmoji('')
    expect(all.length).toBe(emojiGroups.flatMap((g) => g.emoji).length)
    expect(searchEmoji('heart')).toContain('❤️')
    expect(searchEmoji('done')).toContain('✅')
    expect(searchEmoji('zzzzz')).toEqual([])
  })
})
