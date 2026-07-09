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
function onKeydown(event: KeyboardEvent) {
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
  outline: none;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  min-height: 1em;
  cursor: text;
}
.editable.empty::before {
  content: attr(data-placeholder);
  color: rgba(51, 51, 76, 0.32);
  pointer-events: none;
}
</style>
