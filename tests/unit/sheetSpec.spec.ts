import { describe, it, expect } from 'vitest'
import { getPreset, ruleYs, defaultPresetId, sheetPresets } from '@/paper/sheetSpec'

describe('sheet presets', () => {
  it('defaults to the 1C A4 preset', () => {
    const preset = getPreset(defaultPresetId)
    expect(preset.id).toBe('1C')
    expect(preset.width).toBe(210)
    expect(preset.height).toBe(297)
    expect(preset.rule.spacing).toBeCloseTo(9.02, 2)
    expect(preset.margin.left).toBeCloseTo(24.8, 2)
  })

  it('spaces every rule uniformly within a tenth of a millimetre', () => {
    for (const preset of Object.values(sheetPresets)) {
      const ys = ruleYs(preset)
      expect(ys.length).toBeGreaterThan(10)
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i] - ys[i - 1]).toBeCloseTo(preset.rule.spacing, 1)
      }
    }
  })

  it('starts the first rule at the top gap', () => {
    const preset = getPreset('1C')
    expect(ruleYs(preset)[0]).toBeCloseTo(preset.rule.topGap, 2)
  })

  it('falls back to 1C for an unknown preset id', () => {
    expect(getPreset('nope').id).toBe('1C')
  })
})
