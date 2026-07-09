<script setup lang="ts">
// Drag and drop or pick photos, videos, and documents to send with an instruction, and
// hold the recorded voice notes too. Each becomes a chip; its bytes are stored locally
// in IndexedDB and referenced by key. Video and audio carry a transcript, since neither
// is readable by the model as raw bytes; a voice note fills its own in as it is spoken,
// and can be corrected. A voice note plays back inline.
import { onBeforeUnmount, ref } from 'vue'
import type { Attachment, AttachmentKind } from '@/types'
import { getBlob, putBlob, deleteBlob } from '@/store/persistence'
import { uid } from '@/util/id'
import Icon from '@/ui/Icon.vue'

const attachments = defineModel<Attachment[]>({ required: true })
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function kindOf(mime: string): AttachmentKind {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

async function addFiles(files: FileList | File[]) {
  for (const file of Array.from(files)) {
    const blobRef = uid('blob')
    await putBlob(blobRef, file)
    attachments.value = [
      ...attachments.value,
      { id: uid('att'), kind: kindOf(file.type), name: file.name, mime: file.type, size: file.size, blobRef },
    ]
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  if (event.dataTransfer?.files.length) void addFiles(event.dataTransfer.files)
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) void addFiles(input.files)
  input.value = ''
}

async function remove(att: Attachment) {
  if (playingId.value === att.id) stopPlayback()
  await deleteBlob(att.blobRef)
  attachments.value = attachments.value.filter((a) => a.id !== att.id)
}

// Inline playback for voice notes: one plays at a time, from the locally stored blob.
const playingId = ref<string | null>(null)
let audio: HTMLAudioElement | null = null
let objectUrl: string | null = null

function stopPlayback() {
  audio?.pause()
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  audio = null
  objectUrl = null
  playingId.value = null
}

async function togglePlay(att: Attachment) {
  if (playingId.value === att.id) {
    stopPlayback()
    return
  }
  stopPlayback()
  const blob = await getBlob(att.blobRef)
  if (!blob) return
  objectUrl = URL.createObjectURL(blob)
  audio = new Audio(objectUrl)
  audio.onended = stopPlayback
  playingId.value = att.id
  void audio.play()
}

onBeforeUnmount(stopPlayback)

function duration(att: Attachment): string {
  if (!att.durationMs) return ''
  const total = Math.round(att.durationMs / 1000)
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

const glyph: Record<AttachmentKind, string> = { image: 'image', video: 'video', document: 'file', audio: 'mic' }
</script>

<template>
  <div
    class="attachments"
    :class="{ dragging }"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <button class="add" title="Attach files" @click="fileInput?.click()"><Icon name="plus" :size="15" /> Attach</button>
    <input
      ref="fileInput"
      class="hidden"
      type="file"
      multiple
      accept="image/*,video/*,audio/*,application/pdf,.txt,.md,.csv,.tsv,.json,.xml,.html,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.rtf,.odt"
      @change="onPick"
    />

    <div v-for="att in attachments" :key="att.id" class="chip" :class="{ audio: att.kind === 'audio' }">
      <button
        v-if="att.kind === 'audio'"
        class="play"
        :title="playingId === att.id ? 'Pause' : 'Play'"
        @click="togglePlay(att)"
      >
        <Icon :name="playingId === att.id ? 'pause' : 'play'" :size="15" />
      </button>
      <Icon v-else :name="glyph[att.kind]" :size="16" />
      <div class="body">
        <span class="name" :title="att.name">
          {{ att.name }}<span v-if="duration(att)" class="dur"> · {{ duration(att) }}</span>
        </span>
        <span v-if="att.transcribing" class="transcribing"><span class="spin" /> Transcribing…</span>
        <textarea
          v-else-if="att.kind === 'video' || att.kind === 'audio'"
          v-model="att.transcript"
          class="transcript"
          rows="1"
          :placeholder="att.kind === 'audio' ? 'Transcript (edit if needed)' : 'Paste a transcript (optional)'"
        />
      </div>
      <button class="remove" title="Remove" @click="remove(att)"><Icon name="close" :size="14" /></button>
    </div>
  </div>
</template>

<style scoped>
.attachments {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
  padding: 6px;
  border-radius: 10px;
  border: 1px dashed transparent;
}
.attachments.dragging {
  border-color: var(--accent);
  background: var(--accent-wash);
}
.add {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
  color: var(--text);
  font-size: 13px;
}
.add:hover {
  background: var(--accent-wash);
}
.hidden {
  display: none;
}
.chip {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  max-width: 240px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 8px;
  color: var(--text);
}
.chip.audio {
  align-items: center;
}
.play {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: #fff;
  background: var(--accent-grad);
}
.chip .body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.chip .name {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}
.dur {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.transcribing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted);
}
.spin {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid var(--accent-wash-2);
  border-top-color: var(--accent);
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.transcript {
  font-size: 11px;
  color: var(--text);
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: 5px;
  resize: vertical;
  font-family: inherit;
  min-width: 150px;
}
.transcript::placeholder {
  color: var(--text-muted);
}
.remove {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--danger);
  font-size: 15px;
  line-height: 1;
  padding: 2px;
}
</style>
