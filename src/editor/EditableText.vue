<script setup lang="ts">
// One editable run of handwriting. It shows the stored runs, lets the browser handle
// caret and selection, and reads the DOM back into runs on every change so the
// document stays plain data. Enter and an empty Backspace are surfaced to the parent
// so paragraphs and list items behave the way a writer expects.
import { onMounted, ref, watch } from 'vue'
import type { TextRun } from '@/types'
import { htmlToRuns, plainText, runsToHtml } from '@/ui/richText'

const model = defineModel<TextRun[]>({ required: true })
const props = defineProps<{ placeholder?: string; singleLine?: boolean }>()
const emit = defineEmits<{
  (e: 'enter'): void
  (e: 'empty-backspace'): void
  (e: 'focus'): void
  (e: 'blur'): void
  (e: 'select-all-note'): void
}>()

const el = ref<HTMLElement | null>(null)
let editing = false

function render() {
  if (el.value && !editing) el.value.innerHTML = runsToHtml(model.value)
}

onMounted(render)
watch(model, render, { deep: true })

function onInput() {
  if (!el.value) return
  editing = true
  model.value = htmlToRuns(el.value)
}
function onFocus() {
  editing = true
  emit('focus')
}
function onBlur() {
  editing = false
  emit('blur')
  // The DOM is left as the browser has it. Re-rendering here would replace the text
  // nodes and detach a selection a colour picker needs to keep, so a colour applied
  // from a menu would land on nothing. The model already holds the canonical content.
}
function selectAll() {
  if (!el.value) return
  const range = document.createRange()
  range.selectNodeContents(el.value)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

function onKeydown(event: KeyboardEvent) {
  // Select the whole line; a second press, when the line is already fully selected,
  // reaches for the whole note instead.
  if ((event.key === 'a' || event.key === 'A') && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    const full = plainText(model.value).length
    const selected = window.getSelection()?.toString().length ?? 0
    if (full > 0 && selected >= full) emit('select-all-note')
    else selectAll()
    return
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    emit('enter')
    return
  }
  if (event.key === 'Backspace' && plainText(model.value) === '') {
    event.preventDefault()
    emit('empty-backspace')
  }
}

defineExpose({
  focus: () => el.value?.focus(),
})
</script>

<template>
  <div
    ref="el"
    class="editable"
    :class="{ empty: plainText(model) === '' }"
    contenteditable="true"
    spellcheck="false"
    :data-placeholder="props.placeholder ?? ''"
    @input="onInput"
    @focus="onFocus"
    @blur="onBlur"
    @keydown="onKeydown"
  />
</template>

<style scoped>
.editable {
  position: relative;
  outline: none;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  min-height: 1em;
  cursor: text;
}
/* The hint is absolutely placed so it never pushes the caret; the caret rests at the
   start of the line, and the hint sits behind it. */
.editable.empty::before {
  content: attr(data-placeholder);
  position: absolute;
  left: 0;
  top: 0;
  color: rgba(51, 51, 76, 0.32);
  pointer-events: none;
}
</style>
