<script setup lang="ts">
// The bar shown when a run of lines is selected across blocks. It styles every chosen line
// together, changes their case, or merges them into a single paragraph, then clears. It
// never takes focus, so the selection it acts on stays lit while the writer works it.
import { computed } from 'vue'
import { useDocument } from '@/store/document'
import { useSettings } from '@/store/settings'
import Icon from '@/ui/Icon.vue'
import Popover from '@/ui/Popover.vue'
import ColorPicker from '@/ui/ColorPicker.vue'

const documentStore = useDocument()
const settings = useSettings()

const count = computed(() => documentStore.lineSelection?.refs.length ?? 0)
</script>

<template>
  <div class="line-bar" @mousedown.prevent>
    <span class="label">{{ count }} line{{ count === 1 ? '' : 's' }}</span>
    <span class="sep" />
    <button title="Bold" @click="documentStore.applyMarkToLines('bold')"><Icon name="bold" :size="17" /></button>
    <button title="Italic" @click="documentStore.applyMarkToLines('italic')"><Icon name="italic" :size="17" /></button>
    <button title="Underline" @click="documentStore.applyMarkToLines('underline')">
      <Icon name="underline" :size="17" />
    </button>
    <Popover align="center">
      <template #trigger>
        <button title="Colour"><Icon name="textColour" :size="17" /></button>
      </template>
      <template #default>
        <ColorPicker
          :model-value="settings.activeColor"
          @update:model-value="
            (c: string) => {
              documentStore.setColorForLines(c)
              settings.rememberColor(c)
            }
          "
        />
      </template>
    </Popover>
    <span class="sep" />
    <button class="case" title="UPPERCASE" @click="documentStore.setCaseForLines('upper')">AA</button>
    <button class="case" title="lowercase" @click="documentStore.setCaseForLines('lower')">aa</button>
    <button class="case" title="Capitalise" @click="documentStore.setCaseForLines('title')">Aa</button>
    <span class="sep" />
    <button
      class="word"
      title="Merge into one paragraph"
      :disabled="count < 2"
      @click="documentStore.mergeSelectedLines()"
    >
      Merge
    </button>
    <button class="ghost" title="Done" @click="documentStore.clearLineSelection()">
      <Icon name="close" :size="15" />
    </button>
  </div>
</template>

<style scoped>
.line-bar {
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
.case {
  font-weight: 600;
  font-size: 12px;
  min-width: 30px;
  letter-spacing: 0.02em;
}
.word {
  min-width: auto;
  font-size: 13px;
  font-weight: 600;
}
.word:disabled {
  opacity: 0.45;
  cursor: default;
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
