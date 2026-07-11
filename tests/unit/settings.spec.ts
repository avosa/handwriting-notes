import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettings } from '@/store/settings'

describe('settings store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('toggles each accessibility preference independently', () => {
    const s = useSettings()
    expect(s.a11y).toBeUndefined()
    s.toggleA11y('highContrast')
    expect(s.a11y).toEqual({ highContrast: true })
    s.toggleA11y('rtl')
    expect(s.a11y).toEqual({ highContrast: true, rtl: true })
    s.toggleA11y('highContrast')
    expect(s.a11y).toEqual({ highContrast: false, rtl: true })
    s.toggleA11y('readerSpacing')
    expect(s.a11y?.readerSpacing).toBe(true)
  })
})
