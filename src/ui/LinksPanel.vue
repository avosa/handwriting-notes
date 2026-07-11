<script setup lang="ts">
// The links of the open note: the notes it points to with [[title]] brackets, and the notes
// that point back to it. Both are read from the link index built across the whole library.
// Choosing one opens it; a button opens the full map of every connection.
import { onMounted, ref } from 'vue'
import { useDocument } from '@/store/document'
import { useLibrary } from '@/store/library'
import { buildLinkIndex, useLinkGraph, type GraphNode } from '@/home/linkGraph'
import Icon from './Icon.vue'
import { useFocusTrap } from './useFocusTrap'

const emit = defineEmits<{ (e: 'close'): void; (e: 'open', id: string): void; (e: 'map'): void }>()
const documentStore = useDocument()
const library = useLibrary()
const { linksOut, backlinks } = useLinkGraph()

const card = ref<HTMLElement | null>(null)
useFocusTrap(card, () => emit('close'))

const outgoing = ref<GraphNode[]>([])
const incoming = ref<GraphNode[]>([])

onMounted(async () => {
  const liveIds = new Set(library.recent.map((e) => e.id))
  // Include the open note even if it is filed away, so its links still show.
  liveIds.add(documentStore.doc.id)
  await buildLinkIndex(liveIds)
  outgoing.value = linksOut(documentStore.doc.id)
  incoming.value = backlinks(documentStore.doc.id)
})
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <aside ref="card" class="panel" role="dialog" aria-modal="true" aria-label="Links" tabindex="-1">
      <header class="head">
        <h2>Links</h2>
        <div class="head-actions">
          <button class="map" title="Open the note map" @click="emit('map')">
            <Icon name="diagram" :size="15" /> Map
          </button>
          <button class="close" title="Close" @click="emit('close')"><Icon name="close" :size="16" /></button>
        </div>
      </header>

      <div class="scroll">
        <section>
          <h3>Links from this note</h3>
          <div v-if="outgoing.length" class="list">
            <button v-for="n in outgoing" :key="n.id" class="item" @click="emit('open', n.id)">
              <Icon name="external" :size="14" /><span>{{ n.title || 'Untitled' }}</span>
            </button>
          </div>
          <p v-else class="empty">
            None yet. Type a note's title in double brackets, like [[Another note]], to link to it.
          </p>
        </section>

        <section>
          <h3>Linked from</h3>
          <div v-if="incoming.length" class="list">
            <button v-for="n in incoming" :key="n.id" class="item" @click="emit('open', n.id)">
              <Icon name="arrowLeft" :size="14" /><span>{{ n.title || 'Untitled' }}</span>
            </button>
          </div>
          <p v-else class="empty">No other note links here yet.</p>
        </section>
      </div>
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
  width: min(330px, calc(100vw - 24px));
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
  padding: 0 4px 10px;
}
.head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.map {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 8px;
  padding: 5px 10px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.map:hover {
  background: var(--accent-wash);
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
.scroll {
  overflow-y: auto;
}
section {
  margin-bottom: 18px;
}
h3 {
  margin: 0 0 6px;
  padding: 0 6px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: var(--text);
  font: inherit;
  font-size: 14px;
  padding: 8px 10px;
  border-radius: 8px;
}
.item span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item:hover {
  background: var(--accent-wash);
}
.empty {
  margin: 0;
  padding: 4px 8px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.4;
}
</style>
