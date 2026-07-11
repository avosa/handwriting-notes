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

  it('nudges the text scale within bounds and resets it', () => {
    const s = useSettings()
    expect(s.textScale).toBeUndefined()
    s.nudgeTextScale(0.1)
    expect(s.textScale).toBeCloseTo(1.1)
    for (let i = 0; i < 20; i++) s.nudgeTextScale(0.1)
    expect(s.textScale).toBeLessThanOrEqual(1.6)
    for (let i = 0; i < 30; i++) s.nudgeTextScale(-0.1)
    expect(s.textScale).toBeGreaterThanOrEqual(0.8)
    s.resetTextScale()
    expect(s.textScale).toBe(1)
  })
})
