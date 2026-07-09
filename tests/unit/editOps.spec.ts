import { describe, it, expect } from 'vitest'
import { commonPrefixLength, commonSuffixLength } from '@/util/textDiff'
import { parseEdits, isEditReply } from '@/ai/editOps'

describe('text diff', () => {
  it('measures the shared start so only the changed tail is erased', () => {
    expect(commonPrefixLength('powerhouse of teh cell', 'powerhouse of the cell')).toBe(15)
    expect(commonPrefixLength('abc', 'abc')).toBe(3)
    expect(commonPrefixLength('xyz', 'abc')).toBe(0)
  })
  it('measures the shared end without overlapping the shared start', () => {
    expect(commonSuffixLength('the cell', 'teh cell', 0)).toBe(5) // " cell" shared at the end
  })
})

describe('edit reply', () => {
  it('recognises an edit reply and parses each operation', () => {
    const reply = {
      edits: [
        { op: 'replace', id: 'b3', content: 'Corrected line' },
        { op: 'delete', id: 'b5' },
        { op: 'insertAfter', id: 'b3', blocks: [{ type: 'text', role: 'body', content: 'A new line' }] },
      ],
    }
    expect(isEditReply(reply)).toBe(true)
    const ops = parseEdits(reply)
    expect(ops).toHaveLength(3)
    expect(ops[0]).toMatchObject({ op: 'replace', id: 'b3' })
    expect(ops[0].op === 'replace' && ops[0].runs[0].text).toBe('Corrected line')
    expect(ops[1]).toEqual({ op: 'delete', id: 'b5' })
    expect(ops[2].op === 'insertAfter' && ops[2].blocks[0].type).toBe('text')
  })
  it('treats a pages reply as not an edit reply', () => {
    expect(isEditReply({ title: 'X', pages: [[]] })).toBe(false)
  })
  it('accepts a single inserted block as well as an array', () => {
    const ops = parseEdits({
      edits: [{ op: 'insertAfter', id: 'b1', block: { type: 'text', role: 'body', content: 'One' } }],
    })
    expect(ops[0].op === 'insertAfter' && ops[0].blocks).toHaveLength(1)
  })
})
