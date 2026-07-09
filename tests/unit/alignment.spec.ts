import { describe, it, expect } from 'vitest'
import { getPreset } from '@/paper/sheetSpec'
import { textMetrics } from '@/editor/alignment'

describe('text alignment', () => {
  it('sets one line of writing per rule for 1C', () => {
    const preset = getPreset('1C')
    const m = textMetrics(preset)
    expect(m.lineHeight).toBeCloseTo(preset.rule.spacing, 5)
    expect(m.left).toBeCloseTo(preset.text.left, 5)
  })

  it('sizes a heading larger than body and a title larger than a heading', () => {
    const m = textMetrics(getPreset('1C'))
    expect(m.fontSize.heading).toBeGreaterThan(m.fontSize.body)
    expect(m.fontSize.title).toBeGreaterThan(m.fontSize.heading)
  })

  it('uses the wider leading of the 1A preset', () => {
    const m = textMetrics(getPreset('1A'))
    expect(m.lineHeight).toBeCloseTo(getPreset('1A').rule.spacing * 1.5, 5)
  })
})
