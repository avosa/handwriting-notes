<script setup lang="ts">
// A small menu that appears over a text selection, the way a phone shows actions when
// you long-press a word. It offers emphasis, a colour, turning the line into a title or
// heading, and asking the AI to rewrite the line. It never steals the selection.
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { TextRole } from '@/types'
import { useDocument } from '@/store/document'
import { useSettings } from '@/store/settings'
import { useClaude } from '@/compose/useClaude'
import { toggleBold, toggleItalic, toggleUnderline, setTextColor, rememberSelection } from './marks'
import Icon from '@/ui/Icon.vue'
import Popover from '@/ui/Popover.vue'
import ColorPicker from '@/ui/ColorPicker.vue'

const documentStore = useDocument()
const settings = useSettings()
const { refine, refining } = useClaude()

const visible = ref(false)
const x = ref(0)
const y = ref(0)

// The ask input keeps the menu open while the writer types, holding onto the line it
// was opened for even though typing collapses the text selection.
const asking = ref(false)
const askText = ref('')
const askBlockId = ref<string | null>(null)
const askInput = ref<HTMLInputElement | null>(null)

function insideEditor(node: Node | null): boolean {
  let el = node instanceof Element ? node : node?.parentElement
  while (el) {
    if (el.classList?.contains('editable') || el.classList?.contains('cell')) return true
    el = el.parentElement
  }
  return false
}

function update() {
  if (asking.value) return
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
  requestAnimationFrame(update)
}
onMounted(() => document.addEventListener('selectionchange', onSelectionChange))
onBeforeUnmount(() => document.removeEventListener('selectionchange', onSelectionChange))

function makeRole(role: TextRole) {
  if (documentStore.selectedBlockId) documentStore.setRole(documentStore.selectedBlockId, role)
}

async function startAsk() {
  askBlockId.value = documentStore.selectedBlockId
  asking.value = true
  askText.value = ''
  await nextTick()
  askInput.value?.focus()
}
async function sendAsk() {
  if (!askText.value.trim() || !askBlockId.value) return
  const ok = await refine(askBlockId.value, askText.value.trim())
  if (ok) {
    asking.value = false
    visible.value = false
  }
}
function cancelAsk() {
  asking.value = false
  visible.value = false
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
      <template v-if="!asking">
        <button class="ai" title="Ask AI to rewrite this line" @click="startAsk">
          <Icon name="sparkleEdit" :size="16" /> Ask AI
        </button>
        <span class="sep" />
        <button title="Bold" @click="toggleBold"><Icon name="bold" :size="17" /></button>
        <button title="Italic" @click="toggleItalic"><Icon name="italic" :size="17" /></button>
        <button title="Underline" @click="toggleUnderline"><Icon name="underline" :size="17" /></button>
        <span class="sep" />
        <button class="word" @click="makeRole('title')">Title</button>
        <button class="word" @click="makeRole('heading')">Heading</button>
        <button class="word" @click="makeRole('body')">Body</button>
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
      </template>

      <template v-else>
        <Icon name="sparkleEdit" :size="16" class="ai-glyph" />
        <input
          ref="askInput"
          v-model="askText"
          class="ask"
          :disabled="!!refining"
          placeholder="Fix, shorten, clarify…"
          @keydown.enter.prevent="sendAsk"
          @keydown.esc="cancelAsk"
        />
        <button class="go" :disabled="!askText.trim() || !!refining" @click="sendAsk">
          {{ refining ? '…' : 'Go' }}
        </button>
        <button class="go ghost" @click="cancelAsk"><Icon name="close" :size="15" /></button>
      </template>
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
  max-width: calc(100vw - 16px);
  flex-wrap: wrap;
  justify-content: center;
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
.ai {
  gap: 6px;
  min-width: auto;
  font-size: 13px;
  font-weight: 500;
  background: linear-gradient(135deg, #4a72b0, #7e3f8a);
}
.ai:hover {
  filter: brightness(1.08);
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
.ai-glyph {
  color: #b99ae0;
  margin: 0 4px 0 4px;
}
.ask {
  width: 190px;
  border: none;
  outline: none;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
}
.ask::placeholder {
  color: rgba(255, 255, 255, 0.5);
}
.go {
  min-width: auto;
  font-size: 13px;
  font-weight: 500;
  padding: 7px 12px;
  background: rgba(255, 255, 255, 0.16);
}
.go.ghost {
  padding: 7px 8px;
}
.go:disabled {
  opacity: 0.5;
  cursor: default;
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

@media (max-width: 720px) {
  .selection-menu {
    max-width: calc(100vw - 12px);
  }
  .selection-menu button {
    min-width: 40px;
    min-height: 40px;
  }
  .ask {
    width: min(190px, 44vw);
  }
}
</style>
