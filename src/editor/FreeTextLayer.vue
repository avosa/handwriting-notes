<script setup lang="ts">
// Handwriting placed anywhere on the page, over and around the flowing content and the
// figures. Each note sits where it was started, with no box around it, so a writer can
// annotate a diagram or jot in a margin the way they would on real paper. Pressing
// Enter continues the note on the next line; clearing an empty note removes it.
import { computed, nextTick, ref, watch, type CSSProperties } from 'vue'
import type { FreeText, Page, TextRun } from '@/types'
import type { TextMetrics } from './alignment'
import { getHandwriting, bodyFontStack } from '@/handwriting/registry'
import { useDocument } from '@/store/document'
import { useSettings } from '@/store/settings'
import EditableText from './EditableText.vue'

const props = defineProps<{
  page: Page
  pageIndex: number
  metrics: TextMetrics
  pxPerMm: number
}>()

const documentStore = useDocument()
const settings = useSettings()
const handwriting = computed(() => getHandwriting(settings.activeHandwritingId))

function noteStyle(note: FreeText): CSSProperties {
  return {
    left: `${note.x * props.pxPerMm}px`,
    top: `${(note.y - props.metrics.lineHeight) * props.pxPerMm}px`,
    minWidth: `${6 * props.pxPerMm}px`,
    maxWidth: `${(props.metrics.left + props.metrics.width - note.x) * props.pxPerMm}px`,
    fontFamily: bodyFontStack(handwriting.value),
    fontSize: `${props.metrics.fontSize.body * props.pxPerMm}px`,
    lineHeight: `${props.metrics.lineHeight * props.pxPerMm}px`,
    color: note.color ?? handwriting.value.palette.ink,
  }
}

const editables = ref(new Map<string, InstanceType<typeof EditableText>>())
function bindEditable(id: string) {
  return (el: unknown) => {
    if (el) editables.value.set(id, el as InstanceType<typeof EditableText>)
    else editables.value.delete(id)
  }
}
watch(
  () => documentStore.pendingFocusId,
  async (id) => {
    if (!id) return
    await nextTick()
    const target = editables.value.get(id)
    if (target) {
      target.focus()
      documentStore.clearPendingFocus()
    }
  },
)

function onEnter(note: FreeText) {
  documentStore.addNote(props.pageIndex, note.x, note.y + props.metrics.lineHeight)
}
function onBackspace(note: FreeText) {
  documentStore.removeNote(props.pageIndex, note.id)
}
function updateRuns(noteId: string, runs: TextRun[]) {
  documentStore.setNoteRuns(props.pageIndex, noteId, runs)
}
</script>

<template>
  <div class="free-layer">
    <EditableText
      v-for="note in page.notes ?? []"
      :ref="bindEditable(note.id)"
      :key="note.id"
      :model-value="note.runs"
      class="note"
      :style="noteStyle(note)"
      @update:model-value="updateRuns(note.id, $event)"
      @enter="onEnter(note)"
      @empty-backspace="onBackspace(note)"
      @select-all-note="documentStore.selectWholeNote()"
    />
  </div>
</template>

<style scoped>
.free-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.note {
  position: absolute;
  pointer-events: auto;
  white-space: pre-wrap;
  cursor: text;
}
</style>
