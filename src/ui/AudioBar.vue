<script setup lang="ts">
// Audio-synced ink. Record your voice while you draw, and every stroke is stamped with the moment it
// was made; afterwards a small player sits with the note and a Listen toggle lets a tap on any
// stroke jump the audio back to what was being said as it was written. Recording is on the device
// and the clip is saved with the note.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDocument } from '@/store/document'
import { getBlob } from '@/store/persistence'
import { audioSync, audioSupported, startRecording, stopRecording } from '@/audio/audioSync'
import Icon from './Icon.vue'

const documentStore = useDocument()
const supported = audioSupported()

const audioEl = ref<HTMLAudioElement | null>(null)
const src = ref('')
const elapsed = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
let url = ''

const hasAudio = computed(() => !!documentStore.doc.audio)
const label = computed(() => {
  const s = elapsed.value
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})

async function loadAudio() {
  if (url) {
    URL.revokeObjectURL(url)
    url = ''
  }
  src.value = ''
  const audio = documentStore.doc.audio
  if (!audio) return
  const blob = await getBlob(audio.blobRef)
  if (blob) {
    url = URL.createObjectURL(blob)
    src.value = url
  }
}
watch(() => documentStore.doc.audio?.blobRef, loadAudio, { immediate: true })

async function toggleRecord() {
  if (audioSync.recording) {
    const saved = await stopRecording()
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (saved) documentStore.setAudio(saved)
  } else {
    const started = await startRecording()
    if (started) {
      elapsed.value = 0
      timer = setInterval(() => (elapsed.value = Math.floor((Date.now() - audioSync.startedAt) / 1000)), 500)
    }
  }
}

// A tap on a stamped stroke asks the player to seek there and play.
watch(
  () => audioSync.seekRequest?.nonce,
  () => {
    const request = audioSync.seekRequest
    const el = audioEl.value
    if (request && el) {
      el.currentTime = request.ms / 1000
      void el.play()
    }
  },
)

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  if (url) URL.revokeObjectURL(url)
  audioSync.listening = false
})
</script>

<template>
  <div v-if="supported || hasAudio" class="audio-bar">
    <button v-if="!audioSync.recording" class="rec" :disabled="!supported" @click="toggleRecord">
      <span class="rec-dot" /> Record
    </button>
    <button v-else class="rec live" @click="toggleRecord"><span class="rec-dot on" /> {{ label }} · Stop</button>

    <template v-if="hasAudio && !audioSync.recording">
      <audio ref="audioEl" :src="src" controls class="player" />
      <button class="listen" :class="{ on: audioSync.listening }" @click="audioSync.listening = !audioSync.listening">
        <Icon name="play" :size="13" /> {{ audioSync.listening ? 'Tap a stroke' : 'Listen' }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.audio-bar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--menu-shadow, 0 8px 22px rgba(0, 0, 0, 0.18));
  max-width: calc(100vw - 24px);
}
.rec {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 7px 11px;
  border-radius: 10px;
  cursor: pointer;
}
.rec:hover:not(:disabled) {
  background: var(--accent-wash);
}
.rec:disabled {
  opacity: 0.5;
  cursor: default;
}
.rec.live {
  color: var(--danger, #c0392b);
}
.rec-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--danger, #c0392b);
}
.rec-dot.on {
  animation: blink 1.1s ease-in-out infinite;
}
@keyframes blink {
  50% {
    opacity: 0.3;
  }
}
.player {
  height: 30px;
  max-width: 200px;
}
.listen {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 10px;
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
}
.listen:hover {
  background: var(--accent-wash);
}
.listen.on {
  background: var(--accent-wash-2);
  color: var(--brand);
  box-shadow: inset 0 0 0 1px var(--accent);
}
</style>
