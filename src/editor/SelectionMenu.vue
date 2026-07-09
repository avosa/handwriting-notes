<script setup lang="ts">
// A small menu that appears over a text selection, the way a phone shows actions when
// you long-press a word. It offers the quick things: emphasis, a colour, and turning
// the line into a title, heading, or body. It never steals the selection.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { TextRole } from '@/types'
import { useDocument } from '@/store/document'
import { useSettings } from '@/store/settings'
import { toggleBold, toggleItalic, toggleUnderline, setTextColor, rememberSelection } from './marks'
import Icon from '@/ui/Icon.vue'
import Popover from '@/ui/Popover.vue'
import ColorPicker from '@/ui/ColorPicker.vue'

const documentStore = useDocument()
const settings = useSettings()

const visible = ref(false)
const x = ref(0)
const y = ref(0)

function insideEditor(node: Node | null): boolean {
  let el = node instanceof Element ? node : node?.parentElement
  while (el) {
    if (el.classList?.contains('editable') || el.classList?.contains('cell')) return true
    el = el.parentElement
  }
  return false
}

function update() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !insideEditor(sel.anchorNode)) {
    visible.value = false
    return
  }
  const rect = sel.getRangeAt(0).getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    visible.value = false
    return
  }
  x.value = rect.left + rect.width / 2
  y.value = rect.top - 10
  visible.value = true
}

function onSelectionChange() {
  // Let the selection settle before measuring it.
  requestAnimationFrame(update)
}

onMounted(() => document.addEventListener('selectionchange', onSelectionChange))
onBeforeUnmount(() => document.removeEventListener('selectionchange', onSelectionChange))

function makeRole(role: TextRole) {
  if (documentStore.selectedBlockId) documentStore.setRole(documentStore.selectedBlockId, role)
}
</script>

<template>
  <Transition name="rise">
    <div
      v-if="visible"
      class="selection-menu"
      :style="{ left: `${x}px`, top: `${y}px` }"
      @mousedown.prevent
      @touchstart.prevent
    >
      <button title="Bold" @click="toggleBold"><Icon name="bold" :size="17" /></button>
      <button title="Italic" @click="toggleItalic"><Icon name="italic" :size="17" /></button>
      <button title="Underline" @click="toggleUnderline"><Icon name="underline" :size="17" /></button>
      <span class="sep" />
      <button class="word" title="Make title" @click="makeRole('title')">Title</button>
      <button class="word" title="Make heading" @click="makeRole('heading')">Heading</button>
      <button class="word" title="Make body" @click="makeRole('body')">Body</button>
      <span class="sep" />
      <Popover align="center">
        <template #trigger>
          <button title="Colour" @mousedown="rememberSelection"><Icon name="palette" :size="17" /></button>
        </template>
        <template #default>
          <ColorPicker
            :model-value="settings.activeColor"
            @update:model-value="
              (c: string) => {
                setTextColor(c)
                settings.rememberColor(c)
              }
            "
          />
        </template>
      </Popover>
    </div>
  </Transition>
</template>

<style scoped>
.selection-menu {
  position: fixed;
  z-index: 70;
  transform: translate(-50%, -100%);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 6px;
  background: #23232e;
  border-radius: 12px;
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.3);
}
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #f4f4f8;
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
  min-width: 32px;
  min-height: 32px;
}
button:hover {
  background: rgba(255, 255, 255, 0.14);
}
.word {
  font-size: 13px;
  min-width: auto;
}
.sep {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.18);
  margin: 0 2px;
}
.rise-enter-active,
.rise-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}
.rise-enter-from,
.rise-leave-to {
  opacity: 0;
  transform: translate(-50%, -90%);
}
</style>
