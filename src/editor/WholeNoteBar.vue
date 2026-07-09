<script setup lang="ts">
// The bar shown when the whole note is selected. It applies emphasis or a colour to
// every line at once, hands the whole note to the AI, or clears the selection.
import { useDocument } from '@/store/document'
import { useSettings } from '@/store/settings'
import Icon from '@/ui/Icon.vue'
import Popover from '@/ui/Popover.vue'
import ColorPicker from '@/ui/ColorPicker.vue'

const emit = defineEmits<{ (e: 'ask-ai'): void; (e: 'clear'): void }>()
const documentStore = useDocument()
const settings = useSettings()
</script>

<template>
  <div class="whole-bar" @mousedown.prevent>
    <span class="label">Whole note</span>
    <span class="sep" />
    <button title="Bold" @click="documentStore.applyMarkToAll('bold')"><Icon name="bold" :size="17" /></button>
    <button title="Italic" @click="documentStore.applyMarkToAll('italic')"><Icon name="italic" :size="17" /></button>
    <button title="Underline" @click="documentStore.applyMarkToAll('underline')">
      <Icon name="underline" :size="17" />
    </button>
    <Popover align="center">
      <template #trigger>
        <button title="Colour"><Icon name="textColour" :size="17" /></button>
      </template>
      <template #default>
        <ColorPicker :model-value="settings.activeColor" @update:model-value="documentStore.setColorForAll" />
      </template>
    </Popover>
    <span class="sep" />
    <button class="ai" title="Ask AI about the whole note" @click="emit('ask-ai')">
      <Icon name="wand" :size="16" /> Ask AI
    </button>
    <button class="ghost" title="Clear selection" @click="emit('clear')"><Icon name="close" :size="15" /></button>
  </div>
</template>

<style scoped>
.whole-bar {
  position: fixed;
  top: calc(max(10px, env(safe-area-inset-top)) + 58px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 55;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 5px 7px;
  background: #23232e;
  border-radius: 13px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
}
.label {
  font-size: 12px;
  font-weight: 600;
  color: #cfcfe0;
  padding: 0 6px;
}
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: #f4f4f8;
  border-radius: 8px;
  padding: 7px 9px;
  cursor: pointer;
  min-width: 32px;
  min-height: 32px;
}
button:hover {
  background: rgba(255, 255, 255, 0.14);
}
.ai {
  min-width: auto;
  font-size: 13px;
  font-weight: 500;
  background: linear-gradient(135deg, #4a72b0, #7e3f8a);
}
.ghost {
  min-width: auto;
}
.sep {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.18);
  margin: 0 3px;
}
</style>
