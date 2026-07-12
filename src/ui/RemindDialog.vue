<script setup lang="ts">
// Set a reminder on the open note: a few quick times, or pick an exact one. When it comes due the
// app raises a notification (and an in-app banner) so the note is not forgotten. Reminders are
// local — they fire while the app is open.
import { computed, ref } from 'vue'
import { useDocument } from '@/store/document'
import { useReminders } from '@/reminders/useReminders'
import Icon from './Icon.vue'
import { useFocusTrap } from './useFocusTrap'

const emit = defineEmits<{ (e: 'close'): void }>()
const documentStore = useDocument()
const { add, permission } = useReminders()

const card = ref<HTMLElement | null>(null)
useFocusTrap(card, () => emit('close'))

const noteTitle = computed(() => documentStore.doc.title.trim() || 'Untitled note')

// A datetime-local value the writer can pick, and its floor of now so a past time cannot be set.
function toLocalInput(ms: number): string {
  const d = new Date(ms)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
const custom = ref(toLocalInput(Date.now() + 60 * 60 * 1000))
const minCustom = toLocalInput(Date.now())

// A handful of natural times. Evening is 6pm today, rolling to tomorrow once it has passed; morning
// is 9am tomorrow; the week jump is seven days out at 9am.
function atHour(daysAhead: number, hour: number): number {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}
const presets = computed(() => {
  const now = Date.now()
  const eveningToday = atHour(0, 18)
  return [
    { label: 'In 1 hour', due: now + 60 * 60 * 1000 },
    { label: 'This evening', due: eveningToday > now ? eveningToday : atHour(1, 18) },
    { label: 'Tomorrow morning', due: atHour(1, 9) },
    { label: 'Next week', due: atHour(7, 9) },
  ]
})

const saving = ref(false)
async function set(due: number) {
  if (saving.value || due <= Date.now()) return
  saving.value = true
  await add(documentStore.doc.id, noteTitle.value, due)
  emit('close')
}
function setCustom() {
  const due = new Date(custom.value).getTime()
  if (!Number.isNaN(due)) void set(due)
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="card" class="sheet" role="dialog" aria-modal="true" aria-label="Set a reminder" tabindex="-1">
      <header class="head">
        <h2>Remind me</h2>
        <button class="close" title="Close" @click="emit('close')"><Icon name="close" :size="16" /></button>
      </header>

      <p class="about">
        About <strong>“{{ noteTitle }}”</strong>
      </p>

      <div class="presets">
        <button v-for="p in presets" :key="p.label" class="preset" :disabled="saving" @click="set(p.due)">
          {{ p.label }}
        </button>
      </div>

      <label class="custom">
        <span>Or pick a time</span>
        <div class="custom-row">
          <input v-model="custom" type="datetime-local" :min="minCustom" />
          <button class="set" :disabled="saving" @click="setCustom">Set</button>
        </div>
      </label>

      <p v-if="permission === 'denied'" class="note">
        <Icon name="sun" :size="13" /> Notifications are blocked in your browser, so a reminder will show only inside
        the app. Allow notifications to be alerted in the background.
      </p>
      <p v-else class="note">Reminders alert you while the app is open.</p>
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
  width: min(400px, calc(100vw - 24px));
  background: var(--surface, #fff);
  color: var(--ink, #23232e);
  border-radius: 14px;
  box-shadow: var(--pop-shadow, 0 18px 50px rgba(0, 0, 0, 0.3));
  padding: 18px 20px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
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
.about {
  margin: 0 0 14px;
  font-size: 13.5px;
  color: var(--text-muted);
}
.about strong {
  color: var(--text);
}
.presets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.preset {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 11px;
  padding: 12px;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.preset:hover:not(:disabled) {
  background: var(--accent-wash);
  border-color: var(--accent);
}
.preset:disabled {
  opacity: 0.6;
  cursor: default;
}
.custom {
  display: block;
  margin: 14px 0 0;
}
.custom > span {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.custom-row {
  display: flex;
  gap: 8px;
}
.custom-row input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 10px;
  padding: 9px 11px;
  font: inherit;
  font-size: 14px;
}
.set {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--accent);
  border-radius: 10px;
  padding: 9px 16px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.set:hover:not(:disabled) {
  background: var(--accent-wash);
  border-color: var(--accent);
}
.note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}
</style>
