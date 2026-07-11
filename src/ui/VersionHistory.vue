<script setup lang="ts">
// The saved history of the open note: a list of past snapshots, newest first, each of which
// can be brought back. A snapshot is taken automatically when a note is left after editing and
// on demand; restoring one first snapshots the current state, so a restore is itself undoable.
import { computed, onMounted, ref } from 'vue'
import { useDocument } from '@/store/document'
import { useLibrary } from '@/store/library'
import { listVersions, type VersionRecord } from '@/store/persistence'
import { noteStats } from '@/util/noteStats'
import Icon from './Icon.vue'
import { useFocusTrap } from './useFocusTrap'

const emit = defineEmits<{ (e: 'close'): void }>()
const documentStore = useDocument()
const library = useLibrary()

const card = ref<HTMLElement | null>(null)
useFocusTrap(card, () => emit('close'))

const versions = ref<VersionRecord[]>([])
const busy = ref(false)

async function refresh() {
  versions.value = await listVersions(documentStore.doc.id)
}
onMounted(refresh)

function when(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
function words(v: VersionRecord): number {
  return noteStats(v.doc).words
}

const canSnapshot = computed(() => !busy.value)

async function snapshot() {
  busy.value = true
  try {
    await library.snapshotCurrent()
    await refresh()
  } finally {
    busy.value = false
  }
}

async function restore(v: VersionRecord) {
  busy.value = true
  try {
    await library.restoreVersion(v.id)
    await refresh()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <aside ref="card" class="panel" role="dialog" aria-modal="true" aria-label="Version history" tabindex="-1">
      <header class="head">
        <h2>Version history</h2>
        <button class="close" title="Close" @click="emit('close')"><Icon name="close" :size="16" /></button>
      </header>

      <button class="snap" :disabled="!canSnapshot" @click="snapshot">
        <Icon name="pageAdd" :size="15" /> Save a version now
      </button>

      <div v-if="versions.length" class="list">
        <div v-for="v in versions" :key="v.id" class="item">
          <div class="info">
            <span class="title">{{ v.title || 'Untitled' }}</span>
            <span class="sub">{{ when(v.ts) }} · {{ words(v).toLocaleString() }} words</span>
          </div>
          <button class="restore" :disabled="busy" title="Restore this version" @click="restore(v)">
            <Icon name="undo" :size="14" /> Restore
          </button>
        </div>
      </div>
      <p v-else class="empty">
        No versions yet. One is kept each time you leave the note after editing, or save one now.
      </p>
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
.snap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin: 0 8px 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 9px;
  padding: 9px 12px;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.snap:hover:not(:disabled) {
  background: var(--accent-wash);
}
.snap:disabled {
  opacity: 0.5;
  cursor: default;
}
.list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-top: 1px solid var(--hairline, rgba(0, 0, 0, 0.07));
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sub {
  font-size: 12px;
  color: var(--text-muted);
}
.restore {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 8px;
  padding: 6px 10px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.restore:hover:not(:disabled) {
  background: var(--accent-wash);
}
.restore:disabled {
  opacity: 0.5;
  cursor: default;
}
.empty {
  padding: 20px 12px;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.4;
}
</style>
