<script setup lang="ts">
// The AI compose panel. The task leads: a grouped composer with prompt starters, a place
// to type, a small toolbar for a file or a voice note, and one primary Generate. Setup is
// quiet: a single slim strip says whether an AI is connected and offers to connect one,
// without ever standing louder than the input a writer touches every time. It rises as a
// centred card on a wide screen or a bottom sheet on a phone.
import { computed, onMounted, ref } from 'vue'
import type { Attachment } from '@/types'
import { loadApiKey, putBlob } from '@/store/persistence'
import { useSettings } from '@/store/settings'
import { getProvider } from '@/ai/providers'
import { useConnections, refreshConnections } from './aiConnection'
import { uid } from '@/util/id'
import Attachments from './Attachments.vue'
import VoiceRecorder from './VoiceRecorder.vue'
import type { Recording } from './useVoiceRecorder'
import Icon from '@/ui/Icon.vue'
import { useFocusTrap } from '@/ui/useFocusTrap'

const props = defineProps<{ hasContent: boolean }>()
const card = ref<HTMLElement | null>(null)
useFocusTrap(card, () => emit('close'))
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'needs-key'): void
  (e: 'submit', instruction: string, attachments: Attachment[], useCurrent: boolean): void
}>()

const settings = useSettings()
const provider = computed(() => getProvider(settings.activeProvider))
const connections = useConnections()
const connected = computed(() => !!connections[settings.activeProvider])
onMounted(refreshConnections)

function openConnect() {
  emit('needs-key')
}

const instruction = ref('')
const attachments = ref<Attachment[]>([])
const attachmentsRef = ref<InstanceType<typeof Attachments> | null>(null)
const voiceError = ref('')
// Start on the current note when there is something to work on, otherwise a fresh page.
const mode = ref<'new' | 'current'>(props.hasContent ? 'current' : 'new')

// A finished voice note joins the other attachments and carries its own transcript. When
// the live recogniser heard nothing, it is transcribed on the device, filling the chip in.
let voiceCount = 0
async function onVoiceAttach(recording: Recording) {
  const blobRef = uid('blob')
  await putBlob(blobRef, recording.blob)
  voiceCount += 1
  const seconds = Math.round(recording.durationMs / 1000)
  const spoken = recording.transcript.trim()
  attachments.value = [
    ...attachments.value,
    {
      id: uid('att'),
      kind: 'audio',
      name: voiceCount > 1 ? `Voice note ${voiceCount}` : 'Voice note',
      mime: recording.mime,
      size: recording.blob.size,
      blobRef,
      transcript: spoken,
      durationMs: seconds * 1000,
      transcribing: !spoken,
    },
  ]
  if (spoken) return

  const stored = attachments.value[attachments.value.length - 1]
  try {
    const { transcribeAudio } = await import('@/ai/transcribe')
    stored.transcript = await transcribeAudio(recording.blob)
  } catch {
    // If the on-device model cannot run, the note is left for the writer to type in.
  } finally {
    stored.transcribing = false
  }
}

const examples = computed(() =>
  mode.value === 'current'
    ? ['Polish and tidy my notes', 'Continue where I left off', 'Summarise to key points', 'Explain more simply']
    : ['Neat notes on my reading', 'Explain with a diagram', 'Summarise to key points', 'Make a truth table'],
)

const canSend = computed(() => instruction.value.trim().length > 0 || attachments.value.length > 0)

// Hand the request to the app and step aside, so the page is watched as the notes appear.
// A voice note or file on its own is enough; if nothing was typed, a plain instruction
// stands in so the attachments have something to act on.
async function send() {
  if (!canSend.value) return
  if (!(await loadApiKey(settings.activeProvider))) {
    emit('needs-key')
    return
  }
  const typed = instruction.value.trim()
  const command = typed || 'Take neat notes from the attached voice note and files.'
  emit('submit', command, attachments.value, mode.value === 'current')
  emit('close')
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="card" class="card" role="dialog" aria-modal="true" aria-label="Write with AI" tabindex="-1">
      <div class="grip" />
      <header>
        <div class="badge"><Icon name="wand" :size="20" /></div>
        <div class="titles">
          <h2>Write with AI</h2>
          <p>Describe the notes you want and {{ provider.name }} drafts them onto new pages.</p>
        </div>
        <button class="x" title="Close" @click="emit('close')"><Icon name="close" :size="18" /></button>
      </header>

      <!-- One quiet line about connection: never louder than the task. -->
      <div class="conn" :class="{ off: !connected }">
        <span class="conn-dot" />
        <span class="conn-text">
          <template v-if="connected"
            >Writing with <strong>{{ provider.name }}</strong> · your key, on your device</template
          >
          <template v-else>No AI connected · works with your own key, stays on your device</template>
        </span>
        <button class="conn-btn" @click="openConnect">{{ connected ? 'Change' : 'Connect' }}</button>
      </div>

      <div v-if="props.hasContent" class="mode">
        <button :class="{ on: mode === 'current' }" @click="mode = 'current'">Work on this note</button>
        <button :class="{ on: mode === 'new' }" @click="mode = 'new'">Start a new note</button>
      </div>

      <!-- The composer: everything the writer touches, in one group. -->
      <div class="composer">
        <div class="inner">
          <div class="try">
            <span class="try-label">Try</span>
            <div class="chips">
              <button v-for="ex in examples" :key="ex" class="example" @click="instruction = ex">{{ ex }}</button>
            </div>
          </div>

          <textarea
            v-model="instruction"
            class="field"
            rows="3"
            placeholder="Take notes on this, summarise the reading, make a table for…"
            @keydown.enter.exact.prevent="send"
          />

          <Attachments ref="attachmentsRef" v-model="attachments" />
          <p v-if="voiceError" class="error"><Icon name="close" :size="14" /> {{ voiceError }}</p>
        </div>

        <div class="tools">
          <div class="tool-left">
            <button class="tool" title="Attach a file" @click="attachmentsRef?.open()">
              <Icon name="paperclip" :size="18" />
            </button>
            <VoiceRecorder @attach="onVoiceAttach" @error="voiceError = $event" />
          </div>
          <button class="generate" :disabled="!connected || !canSend" @click="send">
            <Icon name="wand" :size="16" /> Generate
          </button>
        </div>
      </div>

      <p class="foot">
        {{
          connected
            ? `Free to use · generating runs on your ${provider.name} key`
            : 'Free to use · connect a key above to enable generating'
        }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 75;
  padding: 16px;
}
.card {
  width: min(560px, 100%);
  background: var(--surface);
  border-radius: 22px;
  padding: 22px;
  box-shadow: var(--pop-shadow);
  animation: pop 0.2s cubic-bezier(0.34, 1.4, 0.64, 1);
}
@keyframes pop {
  from {
    transform: scale(0.96) translateY(10px);
    opacity: 0;
  }
}
.grip {
  display: none;
}
header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}
.badge {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--accent-grad);
}
.titles {
  flex: 1;
}
h2 {
  margin: 0 0 3px;
  font-size: 19px;
  color: var(--brand);
}
.titles p {
  margin: 0;
  font-size: 13px;
  color: var(--text-soft);
  line-height: 1.5;
}
.x {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
}
.x:hover {
  background: var(--surface-sunken);
}

/* Connection strip: slim, one line, quiet. */
.conn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  margin-bottom: 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface-sunken);
  font-size: 12.5px;
  color: var(--text-soft);
}
.conn-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3f8f5c;
  box-shadow: 0 0 0 3px rgba(63, 143, 92, 0.16);
}
.conn.off .conn-dot {
  background: #e0a63a;
  box-shadow: 0 0 0 3px rgba(224, 166, 58, 0.18);
}
.conn-text {
  flex: 1;
  min-width: 0;
}
.conn-text strong {
  color: var(--text);
  font-weight: 600;
}
.conn-btn {
  flex-shrink: 0;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--accent);
  border-radius: 9px;
  padding: 6px 14px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.conn-btn:hover {
  background: var(--accent-wash);
}

.mode {
  display: flex;
  gap: 3px;
  background: var(--surface-sunken);
  border-radius: 11px;
  padding: 3px;
  margin-bottom: 12px;
}
.mode button {
  flex: 1;
  border: none;
  background: transparent;
  border-radius: 9px;
  padding: 9px;
  cursor: pointer;
  color: var(--text-soft);
  font-size: 13px;
  font-weight: 500;
}
.mode button.on {
  background: var(--surface);
  color: var(--brand);
  box-shadow: 0 1px 4px var(--border);
}

/* Composer group: the prompt starters, the input, and the toolbar as one object. */
.composer {
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
}
.inner {
  padding: 14px;
}
.try {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.try-label {
  flex-shrink: 0;
  padding-top: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 7px;
  flex: 1;
  /* Two steady rows so switching mode never resizes the panel. */
  min-height: 72px;
}
.example {
  border: 1px solid var(--accent-wash-2);
  background: var(--accent-wash);
  color: var(--accent);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12.5px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.example:hover {
  background: var(--accent-wash-2);
}
/* A real text field: a distinct box that takes a violet border on focus. */
.field {
  display: block;
  width: 100%;
  resize: none;
  border: 1px solid var(--border);
  outline: none;
  background: var(--surface-sunken);
  border-radius: 12px;
  padding: 13px;
  font-family: inherit;
  font-size: 15px;
  color: var(--text);
  transition:
    border-color 0.12s ease,
    box-shadow 0.12s ease;
}
.field:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-wash-2);
}
.field::placeholder {
  color: var(--text-muted);
}
.error {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 8px 0 0;
  color: var(--danger);
  font-size: 12.5px;
}
.tools {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border-top: 1px solid var(--border);
}
.tool-left {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
}
.tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 10px;
  cursor: pointer;
}
.tool:hover {
  background: var(--accent-wash);
}
/* While a voice note records, its bar takes over the whole toolbar row as a solid surface,
   so the attach and generate buttons are covered rather than bleeding through, and the
   slide-up-to-lock animation floats above it as before. */
.tools :deep(.voice.active) {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
}
.tools :deep(.voice.active .bar) {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 0 0 15px 15px;
  background: var(--surface);
}
.generate {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: none;
  border-radius: 11px;
  padding: 11px 20px;
  background: var(--accent-grad);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px var(--accent-shadow);
}
.generate:disabled {
  opacity: 0.45;
  cursor: default;
  box-shadow: none;
}
.foot {
  margin: 12px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

@media (max-width: 720px) {
  .backdrop {
    align-items: flex-end;
    justify-content: stretch;
    padding: 0;
  }
  .card {
    width: 100%;
    max-height: 88vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    border-radius: 22px 22px 0 0;
    padding: 18px 18px calc(16px + env(safe-area-inset-bottom));
    animation: rise 0.24s ease;
  }
  @keyframes rise {
    from {
      transform: translateY(100%);
    }
  }
  .grip {
    display: block;
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
    margin: 0 auto 14px;
  }
  .try {
    flex-direction: column;
    gap: 6px;
  }
  .try-label {
    padding-top: 0;
  }
  .field {
    font-size: 16px;
  }
  .generate {
    padding: 12px 20px;
  }
}
</style>
