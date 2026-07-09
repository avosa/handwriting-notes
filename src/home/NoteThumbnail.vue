<script setup lang="ts">
// A small ruled card standing in for a note on the home screen. It shows the note's
// title in the handwriting on the familiar cream sheet with the salmon margin, so a
// note is recognised at a glance without loading the whole thing.
import { computed } from 'vue'
import { getPreset } from '@/paper/sheetSpec'
import { getHandwriting, headerFontStack } from '@/handwriting/registry'
import { useSettings } from '@/store/settings'

const props = defineProps<{ title: string }>()
const settings = useSettings()
const preset = getPreset('1C')
const hand = computed(() => getHandwriting(settings.activeHandwritingId))
const rules = computed(() => Array.from({ length: 9 }, (_, i) => 18 + i * 11))
</script>

<template>
  <div class="thumb" :style="{ background: preset.background }">
    <svg class="rules" viewBox="0 0 100 130" preserveAspectRatio="none">
      <line
        v-for="y in rules"
        :key="y"
        x1="0"
        :x2="100"
        :y1="y"
        :y2="y"
        :stroke="preset.rule.color"
        stroke-width="0.5"
      />
      <line x1="14" y1="0" x2="14" y2="130" :stroke="preset.margin.color" stroke-width="0.7" />
    </svg>
    <div class="title" :style="{ fontFamily: headerFontStack(hand), color: hand.palette.title }">
      {{ props.title || 'Untitled' }}
    </div>
  </div>
</template>

<style scoped>
.thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(51, 51, 76, 0.08);
}
.rules {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.title {
  position: absolute;
  left: 12%;
  right: 8%;
  top: 9%;
  font-size: clamp(11px, 3.4vw, 17px);
  line-height: 1.15;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
