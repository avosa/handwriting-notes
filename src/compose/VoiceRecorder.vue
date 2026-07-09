<script setup lang="ts">
// A spoken note, captured the way a messaging app does it. Press and hold the mic to
// record; slide up to latch it hands-free, or slide left to throw it away. Let go and
// it attaches. While locked, a row of controls takes over: bin it, pause, or accept.
// The bar shows a live waveform, a running clock, and the words as they are recognised.
import { computed, ref } from 'vue'
import { useVoiceRecorder, type Recording } from './useVoiceRecorder'
import Icon from '@/ui/Icon.vue'

const emit = defineEmits<{
  (e: 'attach', recording: Recording): void
  (e: 'error', message: string): void
}>()

const rec = useVoiceRecorder()

// How far the press has travelled while held, and whether it is poised to cancel.
const lift = ref(0)
const cancelArmed = ref(false)
const LOCK_DISTANCE = 88
const CANCEL_DISTANCE = 120
let originX = 0
let originY = 0

const active = computed(() => rec.status.value !== 'idle')
const held = computed(() => rec.status.value === 'recording')
const locked = computed(() => rec.status.value === 'locked' || rec.status.value === 'paused')

const clock = computed(() => {
  const total = Math.floor(rec.elapsedMs.value / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
})

// A fixed number of bars so the waveform reads steady; recent amplitudes fill from the
// right, quiet padding on the left before enough sound has arrived.
const BARS = 40
const bars = computed(() => {
  const l = rec.levels.value
  const out: number[] = []
  for (let i = 0; i < BARS; i++) {
    const idx = l.length - BARS + i
    out.push(idx >= 0 ? l[idx] : 0)
  }
  return out
})

const lockProgress = computed(() => Math.min(1, lift.value / LOCK_DISTANCE))

async function onPointerDown(event: PointerEvent) {
  event.preventDefault()
  if (!rec.supported) {
    emit('error', 'Recording is not supported in this browser.')
    return
  }
  originX = event.clientX
  originY = event.clientY
  lift.value = 0
  cancelArmed.value = false
  const ok = await rec.start()
  if (!ok) {
    emit('error', 'Microphone permission is needed to record.')
    return
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp, { once: true })
}

function onPointerMove(event: PointerEvent) {
  if (rec.status.value !== 'recording') return
  const up = originY - event.clientY
  const left = originX - event.clientX
  lift.value = Math.max(0, Math.min(LOCK_DISTANCE, up))
  cancelArmed.value = left > CANCEL_DISTANCE && up < LOCK_DISTANCE / 2
  if (cancelArmed.value) {
    stopTracking()
    rec.cancel()
    return
  }
  if (up >= LOCK_DISTANCE) {
    stopTracking()
    rec.lock()
  }
}

function onPointerUp() {
  stopTracking()
  if (rec.status.value === 'recording') {
    if (cancelArmed.value) rec.cancel()
    else void finish()
  }
}

function stopTracking() {
  window.removeEventListener('pointermove', onPointerMove)
  lift.value = 0
}

async function finish() {
  const recording = await rec.stop()
  if (recording) emit('attach', recording)
}
function discard() {
  rec.cancel()
}
function togglePause() {
  if (rec.status.value === 'paused') rec.resume()
  else rec.pause()
}
</script>

<template>
  <div class="voice" :class="{ active }">
    <!-- Idle: the press target and its hint. -->
    <div v-if="!active" class="idle">
      <button
        class="mic-btn"
        title="Hold to record, slide up to lock"
        aria-label="Record a voice note"
        @pointerdown="onPointerDown"
      >
        <Icon name="mic" :size="18" />
      </button>
      <span class="idle-hint">Hold to record a voice note</span>
    </div>

    <!-- Active: the recording bar takes over the row. -->
    <div v-else class="bar" :class="{ cancelling: cancelArmed, locked, paused: rec.status.value === 'paused' }">
      <!-- Lock track that fills as the press slides up; latches when locked. -->
      <div v-if="held" class="lock-track" :style="{ '--p': lockProgress }">
        <Icon name="chevronUp" :size="16" class="chev" />
        <span class="lock-knob" :style="{ transform: `translateY(${-lift * 0.5}px)` }">
          <Icon :name="lockProgress >= 1 ? 'lock' : 'lockOpen'" :size="15" />
        </span>
      </div>

      <div class="stage">
        <span class="dot" />
        <span class="time">{{ clock }}</span>
        <div class="wave" aria-hidden="true">
          <span v-for="(v, i) in bars" :key="i" class="wbar" :style="{ height: `${6 + v * 26}px` }" />
        </div>
        <Transition name="latch">
          <span v-if="locked" class="latched" title="Locked"><Icon name="lock" :size="14" /></span>
        </Transition>
      </div>

      <!-- While held (not locked): hint to cancel; the lock track handles locking. -->
      <div v-if="held" class="hint">
        <Icon name="chevronDown" :size="14" class="flip" />
        <span>{{ cancelArmed ? 'Release to cancel' : 'Slide up to lock, left to cancel' }}</span>
      </div>

      <!-- Locked: full controls. -->
      <div v-else class="controls">
        <button class="ctl bin" title="Discard" @click="discard"><Icon name="trash" :size="18" /></button>
        <button class="ctl" :title="rec.status.value === 'paused' ? 'Resume' : 'Pause'" @click="togglePause">
          <Icon :name="rec.status.value === 'paused' ? 'play' : 'pause'" :size="18" />
        </button>
        <button class="ctl accept" title="Attach voice note" @click="finish"><Icon name="check" :size="20" /></button>
      </div>
    </div>

    <Transition name="fade">
      <p v-if="active && rec.transcript.value" class="live-transcript">{{ rec.transcript.value }}</p>
    </Transition>
    <p v-if="active && !rec.canTranscribe" class="no-stt">
      Recording. It will be transcribed on your device when you finish.
    </p>
  </div>
</template>

<style scoped>
.voice {
  position: relative;
}
.voice.active {
  flex: 1;
}
.idle {
  display: flex;
  align-items: center;
  gap: 10px;
}
.idle-hint {
  font-size: 12.5px;
  color: var(--text-muted);
}
.mic-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--accent);
  border-radius: 10px;
  cursor: pointer;
  touch-action: none;
  transition:
    transform 0.12s ease,
    background 0.12s ease;
}
.mic-btn:hover {
  background: var(--accent-wash);
}
.mic-btn:active {
  transform: scale(0.92);
}

.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 14px;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
}
.bar.cancelling {
  border-color: var(--danger);
  background: var(--danger-wash);
}

/* The lock track rides above the bar; a knob climbs it as the press lifts. */
.lock-track {
  position: absolute;
  right: 14px;
  bottom: calc(100% + 8px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 7px 9px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--pop-shadow);
  color: var(--text-muted);
  z-index: 2;
}
.lock-track .chev {
  opacity: calc(0.4 + var(--p) * 0.6);
  animation: bob 1.1s ease-in-out infinite;
}
@keyframes bob {
  50% {
    transform: translateY(-3px);
  }
}
.lock-knob {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: #fff;
  background: var(--accent-grad);
  box-shadow: 0 3px 10px var(--accent-shadow);
  transition: transform 0.05s linear;
}

.stage {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1;
  min-width: 0;
}
.dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--danger);
  animation: pulse 1.2s ease-in-out infinite;
}
.paused .dot {
  animation: none;
  opacity: 0.5;
}
@keyframes pulse {
  50% {
    opacity: 0.25;
    transform: scale(0.8);
  }
}
.time {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  min-width: 40px;
}
.wave {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  height: 34px;
  overflow: hidden;
}
.wbar {
  flex: 1;
  min-width: 2px;
  border-radius: 2px;
  background: var(--accent);
  opacity: 0.85;
  transition: height 0.08s ease;
}
.paused .wbar {
  background: var(--text-muted);
}
.latched {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: var(--accent);
  background: var(--accent-wash-2);
}

.hint {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  padding-right: 4px;
}
.hint .flip {
  transform: rotate(-90deg);
  animation: slideLeft 1.2s ease-in-out infinite;
}
@keyframes slideLeft {
  50% {
    transform: rotate(-90deg) translateY(3px);
  }
}
.cancelling .hint {
  color: var(--danger);
  font-weight: 600;
}

.controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.ctl {
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
}
.ctl:hover {
  background: var(--accent-wash);
}
.ctl.bin {
  color: var(--danger);
}
.ctl.bin:hover {
  background: var(--danger-wash);
}
.ctl.accept {
  border: none;
  color: #fff;
  background: var(--accent-grad);
  box-shadow: 0 3px 12px var(--accent-shadow);
}

.live-transcript {
  margin: 8px 2px 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-soft);
  max-height: 66px;
  overflow-y: auto;
}
.no-stt {
  margin: 8px 2px 0;
  font-size: 12px;
  color: var(--text-muted);
}

.latch-enter-active {
  transition:
    transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.2s ease;
}
.latch-enter-from {
  transform: scale(0.2) rotate(-20deg);
  opacity: 0;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
