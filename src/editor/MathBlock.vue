<script setup lang="ts">
// A block of typeset mathematics. The source is LaTeX; the math engine draws it. It shows the
// rendered formula, and reveals a source box on click so it can be edited in place. Rendering is
// sanitised: the engine is told never to trust input, so no markup or script can slip through.
import { computed, nextTick, ref } from 'vue'
import katex from 'katex'
import 'katex/dist/katex.min.css'

const props = defineProps<{ latex: string; editable: boolean }>()
const emit = defineEmits<{ (e: 'update', latex: string): void; (e: 'focus'): void }>()

// A fresh, empty block opens straight into its source box so the writer can start typing.
const editing = ref(!props.latex.trim())
const box = ref<HTMLTextAreaElement | null>(null)

// The formula as safe HTML, or a short note in place of a broken one so the block never throws.
const rendered = computed(() => {
  if (!props.latex.trim()) return ''
  try {
    return katex.renderToString(props.latex, {
      displayMode: true,
      throwOnError: false,
      trust: false,
      output: 'html',
    })
  } catch {
    return ''
  }
})

function edit() {
  if (!props.editable) return
  editing.value = true
  emit('focus')
  void nextTick(() => {
    if (box.value) {
      box.value.focus()
      grow()
    }
  })
}
// Grow the source box to fit its lines so a longer formula is never clipped behind a scrollbar.
function grow() {
  const el = box.value
  if (el) {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
}
function onInput(event: Event) {
  emit('update', (event.target as HTMLTextAreaElement).value)
  grow()
}
</script>

<template>
  <div class="math-block">
    <div v-if="!editing" class="math-render" :class="{ empty: !latex.trim() }" @click="edit">
      <!-- eslint-disable-next-line vue/no-v-html -- KaTeX output with trust:false is sanitised, no raw HTML or script -->
      <span v-if="rendered" v-html="rendered" />
      <span v-else class="math-placeholder">{{ latex.trim() ? latex : 'Click to write math (LaTeX)' }}</span>
    </div>
    <textarea
      v-else
      ref="box"
      class="math-source"
      :value="latex"
      spellcheck="false"
      rows="1"
      placeholder="e.g. \frac{a}{b} = c^2"
      @input="onInput"
      @blur="editing = false"
    />
  </div>
</template>

<style scoped>
.math-block {
  margin: 4px 0;
}
.math-render {
  cursor: text;
  overflow-x: auto;
  padding: 2px 0;
  text-align: center;
}
.math-render.empty {
  text-align: left;
}
.math-placeholder {
  opacity: 0.5;
  font-style: italic;
}
.math-source {
  display: block;
  width: 100%;
  box-sizing: border-box;
  resize: none;
  overflow: hidden;
  border: none;
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--accent-wash, rgba(74, 114, 176, 0.08));
  color: var(--ink, #33334c);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
}
.math-source:focus {
  outline: 2px solid var(--accent-wash-2, rgba(74, 114, 176, 0.2));
}
</style>
