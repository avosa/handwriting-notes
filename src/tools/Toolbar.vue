<script setup lang="ts">
// The floating instrument tray: pick a pen, set its width, and switch between
// drawing and writing. Kept quiet and compact so the paper stays the focus.
import { computed } from 'vue'
import { useSettings } from '@/store/settings'
import { penOrder, penProfile } from '@/tools/penTypes'
import type { PenType } from '@/types'
import PenPalette from './PenPalette.vue'

const props = defineProps<{ mode: 'write' | 'draw' }>()
const emit = defineEmits<{ (e: 'update:mode', value: 'write' | 'draw'): void }>()

const settings = useSettings()

const glyphs: Record<PenType, string> = {
  pencil: '✏️',
  fine: '🖊️',
  marker: '🖍️',
  highlighter: '🖌️',
  eraser: '🧽',
}

const activeProfile = computed(() => penProfile(settings.activeTool))

function pickTool(tool: PenType) {
  settings.selectTool(tool)
  emit('update:mode', 'draw')
}
</script>

<template>
  <div class="toolbar">
    <div class="group modes">
      <button :class="{ active: props.mode === 'write' }" title="Write text" @click="emit('update:mode', 'write')">
        <span class="glyph">✎</span><span class="label">Write</span>
      </button>
      <button :class="{ active: props.mode === 'draw' }" title="Draw" @click="emit('update:mode', 'draw')">
        <span class="glyph">✐</span><span class="label">Draw</span>
      </button>
    </div>

    <div class="group pens">
      <button
        v-for="tool in penOrder"
        :key="tool"
        :class="{ active: props.mode === 'draw' && settings.activeTool === tool }"
        :title="penProfile(tool).name"
        @click="pickTool(tool)"
      >
        <span class="glyph">{{ glyphs[tool] }}</span>
      </button>
    </div>

    <div class="group width">
      <input
        type="range"
        :min="activeProfile.minWidth"
        :max="activeProfile.maxWidth"
        :step="0.1"
        :value="settings.activeWidth"
        title="Nib width"
        @input="settings.setWidth(Number(($event.target as HTMLInputElement).value))"
      />
    </div>

    <PenPalette />
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(51, 51, 76, 0.12);
  border-radius: 14px;
  box-shadow: 0 6px 24px rgba(51, 51, 76, 0.14);
}
.group {
  display: flex;
  align-items: center;
  gap: 4px;
}
.group + .group {
  padding-left: 12px;
  border-left: 1px solid rgba(51, 51, 76, 0.1);
}
button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  border-radius: 9px;
  padding: 6px 9px;
  cursor: pointer;
  color: #33334c;
  font-size: 14px;
  transition: background 0.12s ease;
}
button:hover {
  background: rgba(74, 114, 176, 0.12);
}
button.active {
  background: rgba(74, 114, 176, 0.2);
}
.glyph {
  font-size: 16px;
  line-height: 1;
}
.label {
  font-size: 13px;
}
.width input {
  width: 90px;
  accent-color: #4a72b0;
}
</style>
