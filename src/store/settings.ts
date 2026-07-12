// Editor settings: which handwriting is active, the colour palette, and the current
// tool. The palette and recent colours feed every colour picker in the app, from pen
// ink to headings to diagram accents, so a colour chosen anywhere is offered again.
import { defineStore } from 'pinia'
import type { PenType, ProviderId, Settings, ThemeChoice } from '@/types'
import { defaultHandwritingId } from '@/handwriting/registry'
import { penProfile } from '@/tools/penTypes'
import { defaultSwatches } from '@/ui/colors'

function defaultSettings(): Settings {
  return {
    activeHandwritingId: defaultHandwritingId,
    theme: 'system',
    activeProvider: 'anthropic',
    penColors: [...defaultSwatches],
    recentColors: [],
    activeTool: 'fine',
    activeColor: '#4A72B0',
    activeWidth: penProfile('fine').width,
    // On-device AI is off until the writer turns it on. Kept in the defaults so it is always a
    // stable, saved field and, once turned on, stays on across reloads rather than reverting.
    localAiEnabled: false,
  }
}

export const useSettings = defineStore('settings', {
  state: (): Settings => defaultSettings(),
  actions: {
    selectTool(tool: PenType) {
      this.activeTool = tool
      this.activeWidth = penProfile(tool).width
    },
    selectColor(color: string) {
      this.activeColor = color
      this.rememberColor(color)
    },
    setWidth(width: number) {
      this.activeWidth = width
    },
    rememberColor(color: string) {
      const key = color.toLowerCase()
      this.recentColors = [color, ...this.recentColors.filter((c) => c.toLowerCase() !== key)].slice(0, 12)
    },
    savePaletteColor(color: string) {
      if (!this.penColors.some((c) => c.toLowerCase() === color.toLowerCase())) this.penColors.push(color)
    },
    removePaletteColor(index: number) {
      this.penColors.splice(index, 1)
    },
    selectHandwriting(id: string) {
      this.activeHandwritingId = id
    },
    setTheme(theme: ThemeChoice) {
      this.theme = theme
    },
    setProvider(provider: ProviderId) {
      this.activeProvider = provider
    },
    // Turn the on-device model on or off, and choose which one to run.
    setLocalAiEnabled(enabled: boolean) {
      this.localAiEnabled = enabled
    },
    setLocalModel(id: string) {
      this.localModelId = id
    },
    // Flip one accessibility preference on or off, keeping the others as they are.
    toggleA11y(key: 'rtl' | 'highContrast' | 'readerSpacing') {
      const current = this.a11y ?? {}
      this.a11y = { ...current, [key]: !current[key] }
    },
    // Dial the writing size up or down a step, within sensible bounds, for the whole note.
    nudgeTextScale(delta: number) {
      const next = Math.round(((this.textScale ?? 1) + delta) * 100) / 100
      this.textScale = Math.max(0.8, Math.min(1.6, next))
    },
    resetTextScale() {
      this.textScale = 1
    },
    hydrate(saved: Settings) {
      this.$patch({
        ...saved,
        recentColors: saved.recentColors ?? [],
        theme: saved.theme ?? 'system',
        activeProvider: saved.activeProvider ?? 'anthropic',
      })
    },
  },
})
