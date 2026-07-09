<script setup lang="ts">
// Drag and drop or pick photos, videos, and documents to send with an instruction.
// Each becomes a chip; its bytes are stored locally in IndexedDB and referenced by
// key. Videos offer a transcript field, since raw video is not readable by the model.
import { ref } from 'vue'
import type { Attachment, AttachmentKind } from '@/types'
import { putBlob, deleteBlob } from '@/store/persistence'
import { uid } from '@/util/id'
import Icon from '@/ui/Icon.vue'

const attachments = defineModel<Attachment[]>({ required: true })
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function kindOf(mime: string): AttachmentKind {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
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
  await deleteBlob(att.blobRef)
  attachments.value = attachments.value.filter((a) => a.id !== att.id)
}

const glyph: Record<AttachmentKind, string> = { image: 'image', video: 'video', document: 'file' }
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
      accept="image/*,video/*,application/pdf,.txt,.md"
      @change="onPick"
    />

    <div v-for="att in attachments" :key="att.id" class="chip">
      <Icon :name="glyph[att.kind]" :size="16" />
      <div class="body">
        <span class="name" :title="att.name">{{ att.name }}</span>
        <textarea
          v-if="att.kind === 'video'"
          v-model="att.transcript"
          class="transcript"
          rows="1"
          placeholder="Paste a transcript (optional)"
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
  border-color: #4a72b0;
  background: rgba(74, 114, 176, 0.08);
}
.add {
  border: 1px solid rgba(51, 51, 76, 0.2);
  background: #fff;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
  color: #33334c;
  font-size: 13px;
}
.hidden {
  display: none;
}
.chip {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  max-width: 220px;
  background: #fff;
  border: 1px solid rgba(51, 51, 76, 0.15);
  border-radius: 8px;
  padding: 6px 8px;
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
.transcript {
  font-size: 11px;
  border: 1px solid rgba(51, 51, 76, 0.15);
  border-radius: 5px;
  resize: vertical;
  font-family: inherit;
}
.remove {
  border: none;
  background: transparent;
  cursor: pointer;
  color: #b73b3a;
  font-size: 15px;
  line-height: 1;
}
</style>
