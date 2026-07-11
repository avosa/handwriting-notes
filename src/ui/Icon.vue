<script setup lang="ts">
// Renders a named icon from the set as a stroked SVG that inherits the current colour and
// font size. Icons carry no colour of their own, so a button controls them. The icon's shapes
// are rendered as real elements rather than a string of markup.
import { computed } from 'vue'
import { iconShapes } from './icons'

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })
const shapes = computed(() => iconShapes(props.name))
</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <component :is="shape.tag" v-for="(shape, i) in shapes" :key="i" v-bind="shape.attrs" />
  </svg>
</template>

<style scoped>
.icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
