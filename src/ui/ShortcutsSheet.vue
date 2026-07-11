<script setup lang="ts">
// A small card that lists the keyboard shortcuts. It reads the platform once so the modifier
// shows as the command key on a Mac and the control key elsewhere, and it closes on Escape or
// a click outside like the other dialogs.
import { computed, ref } from 'vue'
import { useFocusTrap } from './useFocusTrap'

const emit = defineEmits<{ (e: 'close'): void }>()

const card = ref<HTMLElement | null>(null)
useFocusTrap(card, () => emit('close'))

const onMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)
const mod = onMac ? '⌘' : 'Ctrl'
const shift = onMac ? '⇧' : 'Shift'

const groups = computed(() => [
  {
    name: 'Everywhere',
    rows: [
      { keys: [`${mod}`, 'K'], label: 'Open the command bar' },
      { keys: [`${mod}`, 'F'], label: 'Find and replace in the note' },
      { keys: ['/'], label: 'Open the block menu on an empty line' },
      { keys: [`${mod}`, 'Z'], label: 'Undo' },
      { keys: [`${shift}${mod}`, 'Z'], label: 'Redo' },
      { keys: ['?'], label: 'Show this help' },
      { keys: ['Esc'], label: 'Close a dialog or clear a selection' },
    ],
  },
  {
    name: 'In a dialog',
    rows: [
      { keys: ['Tab'], label: 'Move to the next control' },
      { keys: [`${shift}`, 'Tab'], label: 'Move to the previous control' },
    ],
  },
])
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="card" class="sheet" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" tabindex="-1">
      <h2 class="head">Keyboard shortcuts</h2>
      <div v-for="group in groups" :key="group.name" class="group">
        <div class="group-name">{{ group.name }}</div>
        <div v-for="(row, i) in group.rows" :key="i" class="row">
          <span class="label">{{ row.label }}</span>
          <span class="keys">
            <kbd v-for="(k, j) in row.keys" :key="j">{{ k }}</kbd>
          </span>
        </div>
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
  padding-top: 12vh;
  background: rgba(20, 20, 28, 0.32);
  backdrop-filter: blur(2px);
}
.sheet {
  width: min(440px, calc(100vw - 24px));
  background: var(--surface, #fff);
  color: var(--ink, #23232e);
  border-radius: 14px;
  box-shadow: var(--pop-shadow, 0 18px 50px rgba(0, 0, 0, 0.3));
  padding: 18px 20px 20px;
}
.head {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 700;
}
.group + .group {
  margin-top: 14px;
}
.group-name {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.5;
  margin-bottom: 6px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
}
.label {
  font-size: 14px;
}
.keys {
  display: inline-flex;
  gap: 4px;
}
kbd {
  font: inherit;
  font-size: 12px;
  min-width: 22px;
  text-align: center;
  padding: 3px 7px;
  border-radius: 6px;
  background: var(--accent-wash-2, rgba(74, 114, 176, 0.14));
  border: 1px solid var(--hairline, rgba(0, 0, 0, 0.1));
}
</style>
