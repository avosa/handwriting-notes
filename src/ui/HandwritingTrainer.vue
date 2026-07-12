<script setup lang="ts">
// Train on your handwriting — the capture step. The writer copies each short prompt in their own
// hand on the pad below; every prompt is saved as ink on the device. Once the set is covered, the
// samples are ready for a personal font to be trained from them, which happens with the backend.
import { computed, onMounted, ref } from 'vue'
import type { Stroke, StrokePoint } from '@/types'
import { uid } from '@/util/id'
import { useSettings } from '@/store/settings'
import { TRAINING_PROMPTS } from '@/handwriting/samples'
import { putSample, countSamples, clearSamples } from '@/store/persistence'
import Icon from './Icon.vue'
import { useFocusTrap } from './useFocusTrap'

const emit = defineEmits<{ (e: 'close'): void }>()
const settings = useSettings()

const card = ref<HTMLElement | null>(null)
useFocusTrap(card, () => emit('close'))

const index = ref(0)
const savedCount = ref(0)
const done = computed(() => index.value >= TRAINING_PROMPTS.length)
const prompt = computed(() => TRAINING_PROMPTS[index.value] ?? '')
const progress = computed(() => Math.round((index.value / TRAINING_PROMPTS.length) * 100))

const pad = ref<HTMLCanvasElement | null>(null)
// Reactive so the Save button follows whether anything has been written yet.
const strokes = ref<Stroke[]>([])
let current: Stroke | null = null
let drawing = false

function ctx() {
  return pad.value?.getContext('2d') ?? null
}
function pointFrom(event: PointerEvent): StrokePoint {
  const rect = pad.value!.getBoundingClientRect()
  const pressure = event.pressure && event.pressure > 0 ? event.pressure : 0.5
  return { x: event.clientX - rect.left, y: event.clientY - rect.top, pressure: 0.4 + pressure * 0.9 }
}
function redraw() {
  const c = ctx()
  const el = pad.value
  if (!c || !el) return
  c.clearRect(0, 0, el.width, el.height)
  c.strokeStyle = settings.activeColor || '#33334C'
  c.lineWidth = 2.2
  c.lineCap = 'round'
  c.lineJoin = 'round'
  for (const stroke of current ? [...strokes.value, current] : strokes.value) {
    if (stroke.points.length < 2) continue
    c.beginPath()
    c.moveTo(stroke.points[0].x, stroke.points[0].y)
    for (const p of stroke.points) c.lineTo(p.x, p.y)
    c.stroke()
  }
}
function onDown(event: PointerEvent) {
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
  drawing = true
  current = { id: uid('s'), tool: 'fine', color: settings.activeColor, width: 0.5, points: [pointFrom(event)] }
  redraw()
}
function onMove(event: PointerEvent) {
  if (!drawing || !current) return
  current.points.push(pointFrom(event))
  redraw()
}
function onUp() {
  if (!drawing) return
  drawing = false
  if (current && current.points.length > 1) strokes.value.push(current)
  current = null
}

const hasInk = computed(() => strokes.value.length > 0)

function clearPad() {
  strokes.value = []
  current = null
  redraw()
}

async function saveAndNext() {
  if (!strokes.value.length) return
  await putSample({ id: uid('sample'), prompt: prompt.value, strokes: strokes.value, createdAt: Date.now() })
  savedCount.value = await countSamples()
  clearPad()
  index.value += 1
}

function skip() {
  clearPad()
  index.value += 1
}

async function startOver() {
  await clearSamples()
  savedCount.value = 0
  index.value = 0
  clearPad()
}

onMounted(async () => {
  savedCount.value = await countSamples()
})
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="card" class="sheet" role="dialog" aria-modal="true" aria-label="Train your handwriting" tabindex="-1">
      <header class="head">
        <h2>Train your handwriting</h2>
        <button class="close" title="Close" @click="emit('close')"><Icon name="close" :size="16" /></button>
      </header>

      <template v-if="!done">
        <p class="lead">
          Copy the line below in your own handwriting. It is saved on your device to train a personal font from.
        </p>
        <div class="bar"><div class="fill" :style="{ width: `${progress}%` }" /></div>
        <p class="count">{{ index + 1 }} of {{ TRAINING_PROMPTS.length }}</p>

        <div class="prompt">{{ prompt }}</div>
        <canvas
          ref="pad"
          class="pad"
          width="520"
          height="150"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
        />

        <div class="actions">
          <button class="ghost" :disabled="!hasInk" @click="clearPad">Clear</button>
          <button class="ghost" @click="skip">Skip</button>
          <button class="primary" :disabled="!hasInk" @click="saveAndNext">Save &amp; next</button>
        </div>
      </template>

      <div v-else class="finished">
        <Icon name="check" :size="28" />
        <p class="fin-title">Your handwriting is captured</p>
        <p class="fin-msg">
          {{ savedCount }} samples saved on this device. A personal font is trained from these once the training service
          is available; nothing is uploaded until you choose to.
        </p>
        <div class="fin-actions">
          <button class="ghost" @click="startOver">Start over</button>
          <button class="primary" @click="emit('close')">Done</button>
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
  padding-top: 8vh;
  background: rgba(20, 20, 28, 0.32);
  backdrop-filter: blur(2px);
}
.sheet {
  width: min(560px, calc(100vw - 24px));
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
.lead {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
}
.bar {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-sunken);
  overflow: hidden;
}
.fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}
.count {
  margin: 6px 0 10px;
  font-size: 12px;
  color: var(--text-muted);
}
.prompt {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text);
  padding: 4px 2px 10px;
}
.pad {
  width: 100%;
  height: 150px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  background: var(--surface-2, var(--surface));
  touch-action: none;
  cursor: crosshair;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.ghost,
.primary {
  border-radius: 11px;
  padding: 10px 16px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.ghost {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}
.ghost:hover:not(:disabled) {
  background: var(--accent-wash);
}
.primary {
  border: none;
  background: var(--brand);
  color: #fff;
}
.primary:hover {
  filter: brightness(1.06);
}
.ghost:disabled,
.primary:disabled {
  opacity: 0.5;
  cursor: default;
}
.finished {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 22px 10px 8px;
  text-align: center;
  color: var(--accent);
}
.fin-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
}
.fin-msg {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
  max-width: 420px;
}
.fin-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>
