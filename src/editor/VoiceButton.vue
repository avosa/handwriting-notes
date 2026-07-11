<script setup lang="ts">
// The one voice control in the dock. A single mic opens two ways to write by talking: dictate
// straight onto the page, or run a meeting — record the conversation, watch the transcript build,
// and drop a summary and action items onto the page when it ends. Whichever is live shows in a
// slim panel that floats above the dock with its own stop, so the tool never crowds the bar.
import { computed, onBeforeUnmount, watch } from 'vue'
import Icon from '@/ui/Icon.vue'
import Popover from '@/ui/Popover.vue'
import { useLiveDictation } from '@/compose/useLiveDictation'
import { useMeeting } from '@/compose/useMeeting'

const emit = defineEmits<{ (e: 'need-key'): void }>()

const dictation = useLiveDictation()
const meeting = useMeeting()

// The mic is offered only where the browser can recognise speech; both features rest on it.
const supported = computed(() => dictation.supported && meeting.supported)
const active = computed(() => dictation.listening.value || meeting.phase.value !== 'idle')

const elapsedLabel = computed(() => {
  const total = meeting.elapsed.value
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

function toggleDictation() {
  if (meeting.phase.value !== 'idle') meeting.cancel()
  dictation.toggle()
}
function startMeeting() {
  if (dictation.listening.value) dictation.stop()
  meeting.start()
}
async function endMeeting() {
  await meeting.finish()
}

// A meeting with nothing to summarise against asks for an AI once, in the same place the chat does.
watch(
  () => meeting.needsAi.value,
  (needs) => {
    if (needs) emit('need-key')
  },
)

// Talking stops when the dock is torn down (switching to draw), so a hidden recogniser never keeps
// the mic open.
onBeforeUnmount(() => {
  dictation.stop()
  meeting.cancel()
})
</script>

<template>
  <Popover v-if="supported" align="center">
    <template #trigger>
      <button class="voice" :class="{ live: active }" title="Dictate or record a meeting">
        <span v-if="active" class="dot" />
        <Icon v-else name="mic" :size="18" />
      </button>
    </template>
    <template #default>
      <div class="menu">
        <button class="menu-item" @click="toggleDictation">
          <Icon name="mic" :size="18" />
          <span class="labels">
            <span class="t">{{ dictation.listening.value ? 'Stop dictation' : 'Dictate onto the page' }}</span>
            <span class="s">Your words appear as you speak</span>
          </span>
        </button>
        <button
          class="menu-item"
          :disabled="meeting.phase.value === 'summarising'"
          @click="meeting.phase.value === 'recording' ? endMeeting() : startMeeting()"
        >
          <Icon name="waveform" :size="18" />
          <span class="labels">
            <span class="t">{{ meeting.phase.value === 'recording' ? 'End meeting' : 'Meeting mode' }}</span>
            <span class="s">Record, then get a summary and actions</span>
          </span>
        </button>
      </div>
    </template>
  </Popover>

  <!-- The live panel floats over everything so the dock stays uncluttered; it carries its own stop. -->
  <Teleport to="body">
    <Transition name="rise">
      <div v-if="dictation.listening.value" class="live-panel dictate">
        <span class="pulse" />
        <div class="live-body">
          <span class="live-title">Listening…</span>
          <span v-if="dictation.interim.value" class="live-sub">{{ dictation.interim.value }}</span>
          <span v-else class="live-sub muted">Speak, and your words land on the page.</span>
        </div>
        <button class="stop" @click="dictation.stop()"><Icon name="stop" :size="15" /> Stop</button>
      </div>
    </Transition>

    <Transition name="rise">
      <div v-if="meeting.phase.value !== 'idle'" class="live-panel meeting">
        <template v-if="meeting.phase.value === 'recording'">
          <span class="pulse" />
          <div class="live-body">
            <span class="live-title">Recording · {{ elapsedLabel }}</span>
            <span class="live-sub scroll">
              {{ meeting.transcript.value }}
              <span class="muted">{{ meeting.interim.value }}</span>
              <span v-if="!meeting.transcript.value && !meeting.interim.value" class="muted"
                >Capturing the conversation…</span
              >
            </span>
          </div>
          <div class="actions">
            <button class="ghost" title="Discard" @click="meeting.cancel()"><Icon name="close" :size="15" /></button>
            <button class="stop" @click="endMeeting"><Icon name="check" :size="15" /> End &amp; summarise</button>
          </div>
        </template>
        <template v-else>
          <span class="spinner" />
          <div class="live-body">
            <span class="live-title">Turning your meeting into notes…</span>
          </div>
        </template>
      </div>
    </Transition>

    <Transition name="rise">
      <div v-if="meeting.error.value" class="live-panel error" @click="meeting.error.value = null">
        <Icon name="close" :size="15" />
        <span class="live-sub">{{ meeting.error.value }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.voice {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 10px;
  padding: 9px;
  min-width: 40px;
  min-height: 40px;
  cursor: pointer;
  color: var(--text);
  transition: background 0.12s ease;
}
.voice:hover {
  background: var(--accent-wash-2);
}
.voice.live {
  color: var(--danger, #c0392b);
  background: color-mix(in srgb, var(--danger, #c0392b) 12%, transparent);
}
.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--danger, #c0392b);
  animation: blink 1.1s ease-in-out infinite;
}
@keyframes blink {
  50% {
    opacity: 0.3;
  }
}

.menu {
  display: flex;
  flex-direction: column;
  padding: 6px;
  min-width: 250px;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  border: none;
  background: transparent;
  border-radius: 10px;
  padding: 10px 11px;
  width: 100%;
  cursor: pointer;
  color: var(--text);
  text-align: left;
}
.menu-item:hover {
  background: var(--accent-wash-2);
}
.menu-item:disabled {
  opacity: 0.5;
  cursor: default;
}
.labels {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.labels .t {
  font-size: 14px;
  font-weight: 500;
}
.labels .s {
  font-size: 12px;
  color: var(--text-muted);
}

/* The floating live panel, centred above the dock. */
.live-panel {
  position: fixed;
  left: 50%;
  bottom: 90px;
  transform: translateX(-50%);
  z-index: 82;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(520px, calc(100vw - 24px));
  padding: 11px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--pop-shadow);
  backdrop-filter: blur(14px) saturate(1.3);
}
.live-panel.error {
  cursor: pointer;
  color: var(--danger, #c0392b);
}
.live-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.live-title {
  font-size: 13px;
  font-weight: 600;
}
.live-sub {
  font-size: 12.5px;
  color: var(--text);
  line-height: 1.4;
  max-width: 340px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.live-sub.scroll {
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}
.live-sub.muted,
.live-sub .muted {
  color: var(--text-muted);
}
.actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.stop,
.ghost {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  border-radius: 10px;
  padding: 8px 12px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.stop {
  background: var(--brand);
  color: #fff;
}
.stop:hover {
  filter: brightness(1.06);
}
.ghost {
  background: transparent;
  color: var(--text-muted);
  padding: 8px;
}
.ghost:hover {
  background: var(--surface-sunken);
  color: var(--text);
}
.pulse {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--danger, #c0392b);
  flex-shrink: 0;
  animation: blink 1.1s ease-in-out infinite;
}
.spinner {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 2px solid var(--border);
  border-top-color: var(--brand);
  flex-shrink: 0;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.rise-enter-active,
.rise-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.rise-enter-from,
.rise-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

@media (max-width: 640px) {
  .live-panel {
    bottom: 84px;
    max-width: calc(100vw - 16px);
  }
  .live-sub {
    max-width: 180px;
  }
}
</style>
