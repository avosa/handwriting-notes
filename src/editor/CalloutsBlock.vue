<script setup lang="ts">
// One or more coloured boxes side by side, each with a heading and a few lines. Used
// for the kind of "this versus that" callouts the notes lean on. The box is ruled by
// hand so it matches the paper, and its contents are editable text.
import { computed } from 'vue'
import type { Block } from '@/types'
import { rect, hashSeed } from '@/diagrams/wobble'
import EditableText from './EditableText.vue'

const props = defineProps<{
  block: Extract<Block, { type: 'callouts' }>
  fontStack: string
  editable: boolean
}>()
const emit = defineEmits<{ (e: 'focus'): void }>()

const seed = computed(() => hashSeed(props.block.id))
function box(i: number): string {
  return rect(1.5, 1.5, 97, 97, seed.value + i * 31)
}
</script>

<template>
  <div class="callouts">
    <div v-for="(b, i) in block.boxes" :key="i" class="box">
      <svg class="frame" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path :d="box(i)" fill="none" :stroke="b.color" stroke-width="0.5" stroke-linejoin="round" />
      </svg>
      <div class="inner" :style="{ fontFamily: fontStack }">
        <EditableText
          v-model="b.heading"
          class="heading"
          :style="{ color: b.color }"
          placeholder="Heading"
          @focus="emit('focus')"
        />
        <EditableText
          v-for="(_, j) in b.items"
          :key="j"
          v-model="b.items[j]"
          class="item"
          placeholder="Line"
          @focus="emit('focus')"
        />
      </div>
    </div>
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
  color: #33334c;
}
</style>
