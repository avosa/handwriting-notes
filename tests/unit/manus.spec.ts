import { describe, it, expect } from 'vitest'
import { manusText, manusError, manus } from '@/ai/providers/manus'
import { getProvider, providerList } from '@/ai/providers'

describe('manus provider', () => {
  it('is registered as a provider the writer can pick', () => {
    expect(providerList.map((p) => p.id)).toContain('manus')
    expect(getProvider('manus')).toBe(manus)
    expect(manus.name).toBe('Manus')
  })

  it("reads the assistant's reply out of a task's message events", () => {
    const text = manusText([
      { type: 'user_message' },
      { type: 'assistant_message', assistant_message: { content: 'First part. ' } },
      { type: 'assistant_message', assistant_message: { content: [{ text: 'Second part.' }] } },
    ])
    expect(text).toBe('First part. Second part.')
  })

  it('returns an empty string when a task has not spoken yet', () => {
    expect(manusText([{ type: 'user_message' }])).toBe('')
  })

  it('surfaces a reported error, such as a spent quota', () => {
    const messages = [
      { type: 'user_message' },
      {
        type: 'error_message',
        error_message: { content: "You don't have enough credits.", error_type: 'quota_limit' },
      },
    ]
    expect(manusError(messages)).toBe("You don't have enough credits.")
    expect(manusError([{ type: 'assistant_message', assistant_message: { content: 'hi' } }])).toBeNull()
  })
})
