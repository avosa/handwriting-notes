<script setup lang="ts">
// A small card of facts about the open note: its size in words and characters, how long it
// would take to read, how many pages it spans, and when it was started and last touched.
import { computed, ref } from 'vue'
import { useDocument } from '@/store/document'
import { noteStats } from '@/util/noteStats'
import { useFocusTrap } from './useFocusTrap'

const emit = defineEmits<{ (e: 'close'): void }>()
const documentStore = useDocument()

const card = ref<HTMLElement | null>(null)
useFocusTrap(card, () => emit('close'))

const stats = computed(() => noteStats(documentStore.doc))

function when(ms: number | undefined): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const rows = computed(() => [
  { label: 'Words', value: stats.value.words.toLocaleString() },
  { label: 'Characters', value: stats.value.characters.toLocaleString() },
  { label: 'Reading time', value: stats.value.readingMinutes ? `${stats.value.readingMinutes} min` : '—' },
  { label: 'Pages', value: String(stats.value.pages) },
  { label: 'Created', value: when(documentStore.doc.createdAt) },
  { label: 'Last edited', value: when(documentStore.doc.updatedAt) },
])
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="card" class="sheet" role="dialog" aria-modal="true" aria-label="Note info" tabindex="-1">
      <h2 class="head">Note info</h2>
      <div v-for="row in rows" :key="row.label" class="row">
        <span class="label">{{ row.label }}</span>
        <span class="value">{{ row.value }}</span>
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
  padding-top: 14vh;
  background: rgba(20, 20, 28, 0.32);
  backdrop-filter: blur(2px);
}
.sheet {
  width: min(360px, calc(100vw - 24px));
  background: var(--surface, #fff);
  color: var(--ink, #23232e);
  border-radius: 14px;
  box-shadow: var(--pop-shadow, 0 18px 50px rgba(0, 0, 0, 0.3));
  padding: 18px 20px 12px;
}
.head {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 700;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 8px 0;
  border-top: 1px solid var(--hairline, rgba(0, 0, 0, 0.07));
  font-size: 14px;
}
.row:first-of-type {
  border-top: none;
}
.label {
  opacity: 0.6;
}
.value {
  font-weight: 600;
}
</style>
