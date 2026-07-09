<script setup lang="ts">
// The brand mark: a cheerful pen that writes its own squiggle. It carries two outlines —
// a navy one for light surfaces, a cream one for dark — so it stays crisp on either. The
// resolved theme decides which one shows.
import { computed } from 'vue'
import { resolvedTheme } from '@/theme/useTheme'

const props = withDefaults(defineProps<{ size?: number }>(), { size: 30 })
const theme = resolvedTheme()
const src = computed(() => (theme.value === 'dark' ? '/brand/nib_logo_dark.png' : '/brand/nib_logo_light.png'))
</script>

<template>
  <img class="brand-logo" :src="src" :width="props.size" :height="props.size" alt="Notes" draggable="false" />
</template>

<style scoped>
.brand-logo {
  display: block;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}
</style>
