<script setup lang="ts">
// A table of contents for the open note. It gathers every title and heading across the
// pages, in order, and lets the reader jump straight to one. Indentation follows the
// heading level, so the shape of a long note is read at a glance.
import { computed, ref } from 'vue'
import { useDocument } from '@/store/document'
import type { TextRole } from '@/types'
import Icon from './Icon.vue'
import { useFocusTrap } from './useFocusTrap'

const emit = defineEmits<{ (e: 'close'): void; (e: 'jump', id: string): void }>()
const documentStore = useDocument()

const card = ref<HTMLElement | null>(null)
useFocusTrap(card, () => emit('close'))

// How deep each heading role sits in the outline. Body and captions are not headings and
// never appear; a title leads, a heading sits under it, a subheading under that.
const DEPTH: Partial<Record<TextRole, number>> = {
  title: 0,
  subtitle: 1,
  heading: 1,
  subheading: 2,
}

interface OutlineItem {
  id: string
  text: string
  depth: number
}

// Walk the pages in order, pulling out every heading paragraph and free note that carries a
// heading role, so both flowing headings and headings jotted anywhere are in the contents.
const items = computed<OutlineItem[]>(() => {
  const out: OutlineItem[] = []
  for (const page of documentStore.doc.pages) {
    for (const block of page.blocks) {
      if (block.type !== 'text') continue
      const depth = DEPTH[block.text.role]
      if (depth === undefined) continue
      const text = block.text.runs
        .map((r) => r.text)
        .join('')
        .trim()
      if (text) out.push({ id: block.id, text, depth })
    }
    for (const note of page.notes ?? []) {
      const depth = note.role ? DEPTH[note.role] : undefined
      if (depth === undefined) continue
      const text = note.runs
        .map((r) => r.text)
        .join('')
        .trim()
      if (text) out.push({ id: note.id, text, depth })
    }
  }
  return out
})

function jump(id: string) {
  emit('jump', id)
  emit('close')
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <aside ref="card" class="panel" role="dialog" aria-modal="true" aria-label="Outline" tabindex="-1">
      <header class="head">
        <h2>Outline</h2>
        <button class="close" title="Close" @click="emit('close')"><Icon name="close" :size="16" /></button>
      </header>
      <div v-if="items.length" class="list">
        <button v-for="item in items" :key="item.id" class="item" :class="`d${item.depth}`" @click="jump(item.id)">
          {{ item.text }}
        </button>
      </div>
      <p v-else class="empty">No headings yet. Make a line a title or heading to build the outline.</p>
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
  width: min(320px, calc(100vw - 24px));
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
.list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.item {
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: var(--text);
  font: inherit;
  font-size: 14px;
  padding: 8px 10px;
  border-radius: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item:hover {
  background: var(--accent-wash);
}
.item.d0 {
  font-weight: 700;
}
.item.d1 {
  padding-left: 22px;
}
.item.d2 {
  padding-left: 34px;
  color: var(--text-soft, var(--text-muted));
}
.empty {
  padding: 20px 12px;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.4;
}
</style>
