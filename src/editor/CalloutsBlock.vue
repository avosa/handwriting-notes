<script setup lang="ts">
// One or more coloured boxes side by side, each with a heading and a few lines. Used
// for the kind of "this versus that" callouts the notes lean on. The box is ruled by
// hand so it matches the paper, and its contents are editable text.
import { computed } from 'vue'
import type { Block } from '@/types'
import { rect, hashSeed } from '@/diagrams/wobble'
import { useDocument } from '@/store/document'
import EditableText from './EditableText.vue'
import Icon from '@/ui/Icon.vue'

const props = defineProps<{
  block: Extract<Block, { type: 'callouts' }>
  fontStack: string
  editable: boolean
}>()
const emit = defineEmits<{ (e: 'focus'): void }>()
const documentStore = useDocument()

const seed = computed(() => hashSeed(props.block.id))
function box(i: number): string {
  return rect(1.5, 1.5, 97, 97, seed.value + i * 31)
}
</script>

<template>
  <div class="callouts" :class="{ editable }">
    <div v-for="(b, i) in block.boxes" :key="i" class="box">
      <svg class="frame" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path :d="box(i)" fill="none" :stroke="b.color" stroke-width="0.5" stroke-linejoin="round" />
      </svg>
      <button
        v-if="editable && block.boxes.length > 1"
        class="del-box"
        title="Remove box"
        @click="documentStore.removeCalloutBox(block.id, i)"
      >
        <Icon name="close" :size="12" />
      </button>
      <div class="inner" :style="{ fontFamily: fontStack }">
        <EditableText
          v-model="b.heading"
          class="heading"
          :style="{ color: b.color }"
          placeholder="Heading"
          @focus="emit('focus')"
        />
        <div v-for="(_, j) in b.items" :key="j" class="line">
          <EditableText v-model="b.items[j]" class="item" placeholder="Line" @focus="emit('focus')" />
          <button
            v-if="editable && b.items.length > 1"
            class="del-line"
            title="Remove line"
            @click="documentStore.removeCalloutItem(block.id, i, j)"
          >
            <Icon name="close" :size="11" />
          </button>
        </div>
        <button v-if="editable" class="add-line" @click="documentStore.addCalloutItem(block.id, i)">
          <Icon name="plus" :size="12" /> Line
        </button>
      </div>
    </div>
    <button v-if="editable" class="add-box" title="Add box" @click="documentStore.addCalloutBox(block.id)">
      <Icon name="plus" :size="16" />
    </button>
  </div>
</template>

<style scoped>
.callouts {
  display: flex;
  gap: 14px;
  width: 100%;
}
.box {
  position: relative;
  flex: 1;
  min-width: 0;
}
.frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.inner {
  position: relative;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.heading {
  text-align: center;
  font-weight: 600;
  margin-bottom: 4px;
}
.item {
  flex: 1;
  color: #33334c;
}
.line {
  display: flex;
  align-items: center;
  gap: 4px;
}
.del-line {
  flex-shrink: 0;
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted, #9a9aa8);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.line:hover .del-line {
  opacity: 1;
}
.del-line:hover {
  color: var(--danger, #b73b3a);
}
.add-line {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  border: none;
  background: transparent;
  color: var(--accent, #4a72b0);
  font-size: 11px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.box:hover .add-line,
.callouts.editable .box:focus-within .add-line {
  opacity: 0.85;
}
.del-box {
  position: absolute;
  top: -9px;
  right: -9px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: var(--text-muted, #9a9aa8);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease;
  z-index: 2;
}
.box:hover .del-box {
  opacity: 1;
}
.del-box:hover {
  background: var(--danger, #b73b3a);
}
.add-box {
  flex-shrink: 0;
  align-self: center;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px dashed var(--border, rgba(51, 51, 76, 0.28));
  border-radius: 10px;
  background: transparent;
  color: var(--accent, #4a72b0);
  cursor: pointer;
}
.add-box:hover {
  background: var(--accent-wash, rgba(74, 114, 176, 0.08));
}
</style>
