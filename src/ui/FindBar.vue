<script setup lang="ts">
// A small bar for finding text in the note and, if opened, replacing it. Matches are read
// from the rendered lines, stepped through with the arrows, and lit with the CSS highlight
// overlay so the found text glows in place without dropping an editable caret into the page.
// Replace swaps the one in view; replace all sweeps the whole note at once.
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
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
  paint()
}

// The exact letters of a match, as a DOM range spanning however many text nodes it crosses.
function rangeFor(match: Match): Range | null {
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
      return range
    }
    pos += len
    node = walker.nextNode()
  }
  return null
}

const canHighlight = typeof CSS !== 'undefined' && 'highlights' in CSS

// Light every match with the highlight overlay, the one in view brighter than the rest, and
// bring it into view. The overlay paints over the letters without selecting them, so the page
// keeps no caret and typing elsewhere never overwrites a found word.
function paint() {
  const active = matches.value[current.value]
  if (canHighlight) {
    const rest = new Highlight()
    const here = new Highlight()
    matches.value.forEach((m, i) => {
      const range = rangeFor(m)
      if (range) (i === current.value ? here : rest).add(range)
    })
    CSS.highlights.set('find-match', rest)
    CSS.highlights.set('find-current', here)
  } else if (active) {
    // Older browsers without the overlay fall back to a plain selection of the current match.
    const range = rangeFor(active)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    if (range) selection?.addRange(range)
  }
  active?.el.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

function clearPaint() {
  if (canHighlight) {
    CSS.highlights.delete('find-match')
    CSS.highlights.delete('find-current')
  }
}

function step(delta: number) {
  if (!matches.value.length) return
  current.value = (current.value + delta + matches.value.length) % matches.value.length
  paint()
}

function replaceOne() {
  if (current.value < 0) return
  const range = rangeFor(matches.value[current.value])
  if (!range) return
  // Select just this match for the swap, then let recompute repaint the overlay.
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  document.execCommand('insertText', false, replacement.value)
  selection?.removeAllRanges()
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
onUnmounted(clearPaint)
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

<style>
/* The find overlay. Named highlights are registered per document, so these rules must be
   global rather than scoped to the bar. */
::highlight(find-match) {
  background-color: rgba(255, 214, 82, 0.4);
}
::highlight(find-current) {
  background-color: rgba(255, 170, 24, 0.85);
  color: #1b1b1b;
}
</style>
