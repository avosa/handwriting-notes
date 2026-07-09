// Editor settings: which handwriting is active, the pen palette, and the current
// tool. The palette feeds both the drawing instruments and the accents the AI uses
// in generated diagrams, so a colour edited here changes both at once.
import { defineStore } from 'pinia'
import type { PenType, Settings } from '@/types'
import { defaultHandwritingId, sanobiaPalette } from '@/handwriting/registry'
import { penProfile } from '@/tools/penTypes'

function defaultSettings(): Settings {
  return {
    activeHandwritingId: defaultHandwritingId,
    penColors: [sanobiaPalette.penBlue, sanobiaPalette.penRed, sanobiaPalette.penGreen, sanobiaPalette.ink],
    activeTool: 'fine',
    activeColor: sanobiaPalette.penBlue,
    activeWidth: penProfile('fine').width,
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
    },
    setWidth(width: number) {
      this.activeWidth = width
    },
    setPaletteColor(index: number, color: string) {
      if (index >= 0 && index < this.penColors.length) this.penColors[index] = color
    },
    addPaletteColor(color: string) {
      this.penColors.push(color)
    },
    removePaletteColor(index: number) {
      this.penColors.splice(index, 1)
    },
    selectHandwriting(id: string) {
      this.activeHandwritingId = id
    },
    hydrate(saved: Settings) {
      this.$patch(saved)
    },
  },
})
