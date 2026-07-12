<script setup lang="ts">
// The list of reminders: what is coming up and what has already fired. Each can be opened to its
// note or cleared. Reminders are local and alert while the app is open.
import { onMounted, ref } from 'vue'
import { useReminders } from '@/reminders/useReminders'
import Icon from './Icon.vue'
import { useFocusTrap } from './useFocusTrap'

const emit = defineEmits<{ (e: 'close'): void; (e: 'open', id: string): void }>()
const { upcoming, past, remove, refresh } = useReminders()

const card = ref<HTMLElement | null>(null)
useFocusTrap(card, () => emit('close'))

onMounted(refresh)

// A short, human due time: a day and time for something further out, just the time for today.
function when(ms: number): string {
  const d = new Date(ms)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `Today, ${time}`
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`
}

function open(id: string) {
  emit('open', id)
  emit('close')
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <aside ref="card" class="panel" role="dialog" aria-modal="true" aria-label="Reminders" tabindex="-1">
      <header class="head">
        <h2>Reminders</h2>
        <button class="close" title="Close" @click="emit('close')"><Icon name="close" :size="16" /></button>
      </header>

      <div v-if="upcoming().length || past().length" class="list">
        <template v-if="upcoming().length">
          <div class="section-label">Upcoming</div>
          <div v-for="r in upcoming()" :key="r.id" class="item">
            <button class="body" @click="open(r.noteId)">
              <span class="title">{{ r.title }}</span>
              <span class="due">{{ when(r.due) }}</span>
            </button>
            <button class="drop" title="Remove" @click="remove(r.id)"><Icon name="close" :size="14" /></button>
          </div>
        </template>

        <template v-if="past().length">
          <div class="section-label">Past</div>
          <div v-for="r in past()" :key="r.id" class="item past">
            <button class="body" @click="open(r.noteId)">
              <span class="title">{{ r.title }}</span>
              <span class="due">{{ when(r.due) }}</span>
            </button>
            <button class="drop" title="Remove" @click="remove(r.id)"><Icon name="close" :size="14" /></button>
          </div>
        </template>
      </div>

      <p v-else class="empty">No reminders yet. Set one from a note to be nudged about it later.</p>
    </aside>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  justify-content: flex-end;
  background: rgba(20, 20, 28, 0.32);
  backdrop-filter: blur(2px);
}
.panel {
  width: min(340px, calc(100vw - 24px));
  height: 100%;
  background: var(--surface, #fff);
  color: var(--ink, #23232e);
  box-shadow: var(--pop-shadow, 0 18px 50px rgba(0, 0, 0, 0.3));
  display: flex;
  flex-direction: column;
  padding: 16px 12px calc(16px + env(safe-area-inset-bottom));
  padding-top: max(16px, env(safe-area-inset-top));
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 10px;
}
.head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.close {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 5px;
  border-radius: 8px;
}
.close:hover {
  background: var(--surface-sunken);
  color: var(--text);
}
.list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.section-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: 12px 10px 4px;
}
.item {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 10px;
}
.item:hover {
  background: var(--accent-wash);
}
.item.past {
  opacity: 0.65;
}
.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: var(--text);
  font: inherit;
  padding: 9px 10px;
  border-radius: 10px;
}
.title {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.due {
  font-size: 12px;
  color: var(--text-muted);
}
.drop {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 7px;
  border-radius: 8px;
}
.drop:hover {
  background: var(--surface-sunken);
  color: var(--danger, #c0392b);
}
.empty {
  padding: 20px 12px;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.4;
}
</style>
