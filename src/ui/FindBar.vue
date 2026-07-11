<script setup lang="ts">
// A small bar for finding text in the note and, if opened, replacing it. Matches are read
// from the rendered lines, stepped through with the arrows, and lit by selecting them in
// place. Replace swaps the one in view; replace all sweeps the whole note at once.
import { nextTick, onMounted, ref, watch } from 'vue'
import { useDocument } from '@/store/document'
import Icon from './Icon.vue'

const emit = defineEmits<{ (e: 'close'): void }>()
const documentStore = useDocument()

const query = ref('')
const replacement = ref('')
const showReplace = ref(false)
const field = ref<HTMLInputElement | null>(null)

interface Match {
  el: HTMLElement
  start: number
}
const matches = ref<Match[]>([])
const current = ref(-1)

function recompute(keepIndex = false) {
  const needle = query.value.toLowerCase()
  const found: Match[] = []
  if (needle) {
    for (const el of Array.from(document.querySelectorAll('.stack .editable')) as HTMLElement[]) {
      const lower = (el.textContent ?? '').toLowerCase()
      let at = lower.indexOf(needle)
      while (at !== -1) {
        found.push({ el, start: at })
        at = lower.indexOf(needle, at + needle.length)
      }
    }
  }
  matches.value = found
  current.value = found.length ? (keepIndex ? Math.min(current.value, found.length - 1) : 0) : -1
  if (current.value >= 0) select(current.value)
}

// Light the match by selecting its letters in place, so the found text is shown exactly where
// it sits without changing the page.
function select(index: number) {
  const match = matches.value[index]
  if (!match) return
  const length = query.value.length
  const range = document.createRange()
  const walker = document.createTreeWalker(match.el, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  let pos = 0
  let started = false
  while (node) {
    const len = (node.textContent ?? '').length
    if (!started && pos + len >= match.start) {
      range.setStart(node, match.start - pos)
      started = true
    }
    if (started && pos + len >= match.start + length) {
      range.setEnd(node, match.start + length - pos)
      break
    }
    pos += len
    node = walker.nextNode()
  }
  if (!started) return
  match.el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function step(delta: number) {
  if (!matches.value.length) return
  current.value = (current.value + delta + matches.value.length) % matches.value.length
  select(current.value)
}

function replaceOne() {
  if (current.value < 0) return
  select(current.value)
  // Swap the selected match in place; the line serialises the change back into the note.
  document.execCommand('insertText', false, replacement.value)
  void nextTick(() => recompute(true))
}
function replaceAll() {
  const count = documentStore.replaceAll(query.value, replacement.value)
  if (count) void nextTick(() => recompute())
}

watch(query, () => recompute())
onMounted(() => {
  void nextTick(() => field.value?.focus())
})
</script>

<template>
  <div class="find-bar" @keydown.esc="emit('close')">
    <div class="row">
      <button class="toggle" :class="{ on: showReplace }" title="Replace" @click="showReplace = !showReplace">
        <Icon name="chevronDown" :size="14" :style="{ transform: showReplace ? 'rotate(0)' : 'rotate(-90deg)' }" />
      </button>
      <div class="field">
        <input
          ref="field"
          v-model="query"
          placeholder="Find in note"
          spellcheck="false"
          @keydown.enter.prevent="step(1)"
        />
        <span class="count">{{ matches.length ? `${current + 1}/${matches.length}` : '0' }}</span>
      </div>
      <button title="Previous" :disabled="!matches.length" @click="step(-1)">
        <Icon name="chevronUp" :size="16" />
      </button>
      <button title="Next" :disabled="!matches.length" @click="step(1)"><Icon name="chevronDown" :size="16" /></button>
      <button class="close" title="Close" @click="emit('close')"><Icon name="close" :size="15" /></button>
    </div>
    <div v-if="showReplace" class="row">
      <span class="toggle-spacer" />
      <div class="field">
        <input
          v-model="replacement"
          placeholder="Replace with"
          spellcheck="false"
          @keydown.enter.prevent="replaceOne"
        />
      </div>
      <button class="word" :disabled="!matches.length" @click="replaceOne">Replace</button>
      <button class="word" :disabled="!matches.length" @click="replaceAll">All</button>
    </div>
  </div>
</template>

<style scoped>
.find-bar {
  position: fixed;
  top: calc(max(10px, env(safe-area-inset-top)) + 58px);
  right: 16px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: var(--surface, #23232e);
  color: var(--ink, #23232e);
  border-radius: 12px;
  box-shadow: var(--pop-shadow, 0 12px 30px rgba(0, 0, 0, 0.28));
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.field {
  position: relative;
  display: flex;
  align-items: center;
}
.field input {
  width: 200px;
  border: none;
  outline: none;
  background: var(--accent-wash, rgba(74, 114, 176, 0.08));
  color: inherit;
  border-radius: 8px;
  padding: 8px 46px 8px 10px;
  font-size: 14px;
  font-family: inherit;
}
.count {
  position: absolute;
  right: 8px;
  font-size: 12px;
  opacity: 0.55;
}
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: inherit;
  border-radius: 8px;
  min-width: 30px;
  min-height: 30px;
  cursor: pointer;
}
button:hover:not(:disabled) {
  background: var(--accent-wash-2, rgba(74, 114, 176, 0.14));
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
.toggle,
.toggle-spacer {
  min-width: 24px;
  width: 24px;
}
.word {
  min-width: auto;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 600;
}
</style>
