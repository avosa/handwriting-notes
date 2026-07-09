<script setup lang="ts">
// A small menu that appears over a text selection, the way a phone shows actions when
// you long-press a word. It offers emphasis, a colour, turning the line into a title or
// heading, and asking the AI to rewrite the line. It never steals the selection.
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { TextRole } from '@/types'
import { useDocument } from '@/store/document'
import { useSettings } from '@/store/settings'
import { useAi } from '@/compose/useAi'
import { toggleBold, toggleItalic, toggleUnderline, setTextColor, rememberSelection } from './marks'
import Icon from '@/ui/Icon.vue'
import Popover from '@/ui/Popover.vue'
import ColorPicker from '@/ui/ColorPicker.vue'

const documentStore = useDocument()
const settings = useSettings()
const { rewriteLine, refining, error } = useAi()

const visible = ref(false)
const x = ref(0)
const y = ref(0)

// The ask input keeps the menu open while the writer types, holding onto the line it
// was opened for even though moving focus to the input collapses the text selection.
// The line it will rewrite stays lit the whole time so the target is never in doubt.
const asking = ref(false)
const askText = ref('')
const askInput = ref<HTMLInputElement | null>(null)
// The exact line to rewrite, captured as its editable element so the reply can drop back
// into whatever it is: a paragraph, a list item, a table cell, or a free note.
let litLine: HTMLElement | null = null

function editableAround(node: Node | null): HTMLElement | null {
  let el = node instanceof Element ? node : (node?.parentElement ?? null)
  while (el) {
    if (el.classList?.contains('editable') || el.classList?.contains('cell')) return el as HTMLElement
    el = el.parentElement
  }
  return null
}
function litOn(el: HTMLElement | null) {
  litLine?.classList.remove('ai-asking')
  litLine = el
  litLine?.classList.add('ai-asking')
}
function litOff() {
  litLine?.classList.remove('ai-asking')
  litLine = null
}

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
  documentStore.setSelectionRole(role)
}
// Size whatever line the selection sits in, whether it is a block or a free note; the
// selection is left untouched so the writer can keep nudging up or down and watch it grow.
function nudgeSize(delta: number) {
  documentStore.nudgeSelectionFontScale(delta)
}

async function startAsk() {
  // Capture the line before focus leaves it, and keep it lit while the writer types.
  const selection = window.getSelection()
  litOn(editableAround(selection?.anchorNode ?? null))
  asking.value = true
  askText.value = ''
  error.value = null
  await nextTick()
  askInput.value?.focus()
}
async function sendAsk() {
  if (!askText.value.trim() || refining.value) return
  if (!litLine) {
    error.value = 'Select a line first.'
    return
  }
  const original = litLine.textContent ?? ''
  const rewritten = await rewriteLine(original, askText.value.trim())
  if (rewritten === null) return // The error is shown in the bar; the line stays lit.

  // Drop the reply straight into the same editable and let it sync to the note, so this
  // works the same whether the line is a paragraph, a list item, a cell, or a free note.
  litLine.textContent = rewritten
  litLine.dispatchEvent(new InputEvent('input', { bubbles: true }))
  asking.value = false
  visible.value = false
  litOff()
}
function cancelAsk() {
  asking.value = false
  visible.value = false
  error.value = null
  litOff()
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
        <button class="size" title="Smaller" @mousedown.prevent="nudgeSize(-0.1)">A−</button>
        <button class="size big" title="Larger" @mousedown.prevent="nudgeSize(0.1)">A+</button>
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
        <button class="go" :class="{ busy: refining }" :disabled="!askText.trim() || refining" @click="sendAsk">
          <span v-if="refining" class="spinner" />
          <span v-else>Go</span>
        </button>
        <button class="go ghost" @click="cancelAsk"><Icon name="close" :size="15" /></button>
        <span v-if="error" class="ask-error">{{ error }}</span>
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
  transition:
    transform 0.1s ease,
    filter 0.12s ease;
}
.ai:hover {
  filter: brightness(1.08);
}
/* A quick press-in so a tap plainly registers before the AI answers. */
.ai:active,
.go:active:not(:disabled) {
  transform: scale(0.9);
}
.word {
  font-size: 13px;
  min-width: auto;
}
.size {
  font-weight: 700;
  font-size: 12px;
  min-width: 30px;
}
.size.big {
  font-size: 15px;
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
  min-width: 44px;
  font-size: 13px;
  font-weight: 600;
  padding: 7px 14px;
  background: linear-gradient(135deg, #4a72b0, #7e3f8a);
  transition:
    transform 0.1s ease,
    filter 0.12s ease;
}
.go:hover:not(:disabled) {
  filter: brightness(1.1);
}
.go.busy {
  background: rgba(255, 255, 255, 0.16);
}
.go.ghost {
  min-width: auto;
  padding: 7px 8px;
  background: rgba(255, 255, 255, 0.12);
}
.go:disabled {
  opacity: 0.6;
  cursor: default;
}
.spinner {
  display: inline-block;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.ask-error {
  flex-basis: 100%;
  text-align: center;
  color: #ff9d9b;
  font-size: 12px;
  padding: 2px 4px 0;
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
