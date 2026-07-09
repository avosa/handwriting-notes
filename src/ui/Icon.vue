<script setup lang="ts">
// Renders a named icon from the set as a stroked SVG that inherits the current colour
// and font size. Icons carry no colour of their own, so a button controls them.
import { computed } from 'vue'
import { icons } from './icons'

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })
const markup = computed(() => icons[props.name] ?? '')
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- markup is a fixed icon from our own set, never user input -->
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
    v-html="markup"
  />
</template>

<style scoped>
.icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
