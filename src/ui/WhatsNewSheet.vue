<script setup lang="ts">
// A card that lists what has changed lately, grouped by release. Reachable from the command
// bar; closes on Escape or a click outside like the other dialogs.
import { ref } from 'vue'
import { changelog } from '@/content/changelog'
import { useFocusTrap } from './useFocusTrap'

const emit = defineEmits<{ (e: 'close'): void }>()

const card = ref<HTMLElement | null>(null)
useFocusTrap(card, () => emit('close'))
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="card" class="sheet" role="dialog" aria-modal="true" aria-label="What's new" tabindex="-1">
      <h2 class="head">What's new</h2>
      <div v-for="release in changelog" :key="release.version" class="release">
        <div class="rel-head">
          <span class="ver">{{ release.version }}</span>
          <span class="date">{{ release.date }}</span>
        </div>
        <ul class="items">
          <li v-for="(item, i) in release.items" :key="i">{{ item }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 10vh;
  background: rgba(20, 20, 28, 0.32);
  backdrop-filter: blur(2px);
}
.sheet {
  width: min(480px, calc(100vw - 24px));
  max-height: 72vh;
  overflow-y: auto;
  background: var(--surface, #fff);
  color: var(--ink, #23232e);
  border-radius: 14px;
  box-shadow: var(--pop-shadow, 0 18px 50px rgba(0, 0, 0, 0.3));
  padding: 20px 22px 22px;
}
.head {
  margin: 0 0 14px;
  font-size: 17px;
  font-weight: 700;
}
.release + .release {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--hairline, rgba(0, 0, 0, 0.08));
}
.rel-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}
.ver {
  font-weight: 700;
  font-size: 14px;
}
.date {
  font-size: 12px;
  opacity: 0.5;
}
.items {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.items li {
  font-size: 14px;
  line-height: 1.4;
}
</style>
