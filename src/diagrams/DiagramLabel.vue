<script setup lang="ts">
// One editable letter or word inside a diagram. It sits in the drawing's own coordinate
// space as a foreign object, exactly where the figure places it, and edits in place. The
// text is written into the element only when it is not being typed into, so the caret
// never jumps, the way the writing blocks behave.
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  x: number
  y: number
  text: string
  color: string
  size: number
  anchor: 'start' | 'middle' | 'end'
  fontStack: string
}>()
const emit = defineEmits<{ (e: 'edit', text: string): void }>()

// A generous box in scene units so a longer label still has room to grow.
const boxWidth = computed(() => props.size * 14)
const boxX = computed(() =>
  props.anchor === 'start' ? props.x : props.anchor === 'end' ? props.x - boxWidth.value : props.x - boxWidth.value / 2,
)

const el = ref<HTMLElement | null>(null)
let editing = false
function render() {
  if (el.value && !editing) el.value.textContent = props.text
}
onMounted(render)
watch(() => props.text, render)

function onInput() {
  if (!el.value) return
  editing = true
  emit('edit', el.value.textContent ?? '')
}
function onFocus() {
  editing = true
}
function onBlur() {
  editing = false
  render()
}
</script>

<template>
  <foreignObject :x="boxX" :y="y - size * 0.95" :width="boxWidth" :height="size * 1.7">
    <div
      ref="el"
      xmlns="http://www.w3.org/1999/xhtml"
      class="label"
      :class="anchor"
      contenteditable="true"
      spellcheck="false"
      :style="{ fontSize: `${size}px`, lineHeight: `${size * 1.7}px`, color, fontFamily: fontStack }"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @pointerdown.stop
      @mousedown.stop
    />
  </foreignObject>
</template>

<style scoped>
.label {
  height: 100%;
  outline: none;
  white-space: nowrap;
  cursor: text;
  border-radius: 3px;
}
.label.start {
  text-align: left;
}
.label.middle {
  text-align: center;
}
.label.end {
  text-align: right;
}
.label:hover,
.label:focus {
  background: rgba(74, 114, 176, 0.12);
}
</style>
