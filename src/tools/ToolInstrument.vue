<script setup lang="ts">
// A drawing instrument drawn to look like the real thing, so a glance tells you it is
// a pencil, a pen, a marker, a highlighter, an eraser, or a fill bucket. The parts
// that hold ink take the current colour; the active tool lifts out of the tray.
import { computed } from 'vue'
import type { PenType } from '@/types'

const props = defineProps<{ tool: PenType; color: string; active: boolean }>()

// A darker shade of the ink for caps and shadows, so a coloured barrel still reads.
const dark = computed(() => shade(props.color, -0.35))
function shade(hex: string, amt: number): string {
  const c = hex.replace('#', '')
  const n = parseInt(c.length === 3 ? c.replace(/(.)/g, '$1$1') : c, 16)
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt * 255))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt * 255))
  const b = Math.max(0, Math.min(255, (n & 255) + amt * 255))
  return `rgb(${r | 0},${g | 0},${b | 0})`
}
</script>

<template>
  <svg class="instrument" :class="{ active }" viewBox="0 0 44 132" xmlns="http://www.w3.org/2000/svg">
    <template v-if="tool === 'pencil'">
      <rect x="15" y="6" width="14" height="12" rx="3" fill="#F28B82" />
      <rect x="15" y="16" width="14" height="7" fill="#D8D8DE" />
      <rect x="17" y="17" width="10" height="1.5" fill="#AFAFB8" />
      <rect x="15" y="22" width="14" height="82" rx="1.5" fill="#F5B301" />
      <rect x="15" y="22" width="4" height="82" fill="#E39E00" opacity="0.55" />
      <polygon points="15,104 29,104 25,120 19,120" fill="#EBCB93" />
      <polygon points="19,120 25,120 22,128" fill="#3A3A44" />
    </template>

    <template v-else-if="tool === 'fine'">
      <path d="M15 8 h14 v4 l-2 3 h-10 l-2 -3 z" :fill="dark" />
      <rect x="18" y="6" width="3" height="12" rx="1.5" fill="#E8E8EE" />
      <rect x="15" y="16" width="14" height="86" rx="6" :fill="color" />
      <rect x="16" y="16" width="4" height="86" rx="2" fill="#ffffff" opacity="0.25" />
      <polygon points="16,102 28,102 22,126" :fill="dark" />
      <rect x="21" y="118" width="2" height="10" :fill="color" />
    </template>

    <template v-else-if="tool === 'marker'">
      <rect x="12" y="6" width="20" height="20" rx="4" :fill="dark" />
      <rect x="12" y="24" width="20" height="74" rx="5" :fill="color" />
      <rect x="14" y="24" width="5" height="74" fill="#ffffff" opacity="0.22" />
      <polygon points="14,98 30,98 27,118 17,118" :fill="dark" />
      <rect x="17" y="116" width="10" height="8" rx="1.5" :fill="color" />
    </template>

    <template v-else-if="tool === 'highlighter'">
      <rect x="11" y="6" width="22" height="16" rx="3" :fill="dark" opacity="0.85" />
      <rect x="10" y="20" width="24" height="72" rx="6" :fill="color" opacity="0.5" />
      <rect x="13" y="20" width="6" height="72" fill="#ffffff" opacity="0.35" />
      <polygon points="12,92 32,92 30,112 14,112" :fill="color" opacity="0.75" />
      <rect x="14" y="110" width="16" height="7" rx="1.5" :fill="color" opacity="0.9" />
    </template>

    <template v-else-if="tool === 'eraser'">
      <!-- A classic school rubber: a short, chunky block held at a slight angle, its lower
           corner worn from use, with the familiar pink body, blue ink end, and a kraft paper
           sleeve — so a glance reads "eraser", not another pen. -->
      <g transform="rotate(-15 22 74)">
        <!-- pink body with a worn, bevelled bottom corner -->
        <path d="M10 44 h24 v46 l-6 6 h-12 l-6 -6 z" fill="#F48FB1" />
        <!-- blue ink-eraser end -->
        <path d="M10 44 h24 v14 h-24 z" fill="#5C9CE6" />
        <!-- kraft paper sleeve across the middle -->
        <rect x="8" y="60" width="28" height="20" rx="2" fill="#E7D3A8" />
        <line x1="8" y1="66" x2="36" y2="66" stroke="#CBB584" stroke-width="1.2" />
        <line x1="8" y1="74" x2="36" y2="74" stroke="#CBB584" stroke-width="1.2" />
        <!-- soft highlight down the left edge -->
        <rect x="12" y="46" width="5" height="48" rx="2.5" fill="#ffffff" opacity="0.28" />
      </g>
    </template>

    <template v-else-if="tool === 'fill'">
      <g transform="rotate(-18 22 60)">
        <path d="M12 46 h20 v34 a4 4 0 0 1 -4 4 h-12 a4 4 0 0 1 -4 -4 z" :fill="color" />
        <ellipse cx="22" cy="46" rx="10" ry="4" :fill="dark" />
        <path d="M12 50 a10 4 0 0 0 20 0" fill="#ffffff" opacity="0.25" />
      </g>
      <path d="M30 40 q10 6 6 20 q-2 8 -8 8 q-6 0 -6 -8 q0 -8 8 -20 z" :fill="color" />
    </template>
  </svg>
</template>

<style scoped>
.instrument {
  width: 100%;
  height: 100%;
  display: block;
  transition:
    transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1),
    filter 0.16s ease;
  transform: translateY(6px);
  filter: drop-shadow(0 2px 3px rgba(51, 51, 76, 0.18));
}
.instrument.active {
  transform: translateY(-10px) scale(1.04);
  filter: drop-shadow(0 8px 10px rgba(51, 51, 76, 0.26));
}
</style>
