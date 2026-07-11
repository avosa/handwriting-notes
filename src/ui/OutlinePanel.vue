<script setup lang="ts">
// A collapsible table of contents for the open note. It gathers every title and heading across the
// pages in order, indents by heading level so the shape of a long note reads at a glance, and folds
// a section away when it has sub-headings — so a big note can be surveyed from the top down. Picking
// a heading jumps straight to it in the note.
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

// A heading has children when the next heading sits deeper than it.
function hasChildren(index: number): boolean {
  const next = items.value[index + 1]
  return !!next && next.depth > items.value[index].depth
}

const collapsed = ref(new Set<string>())
function toggle(id: string) {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}

// Every heading that owns a section, so collapse-all can fold the whole note to its top level.
const foldable = computed(() => items.value.filter((_, i) => hasChildren(i)).map((it) => it.id))
const allCollapsed = computed(() => foldable.value.length > 0 && foldable.value.every((id) => collapsed.value.has(id)))
function toggleAll() {
  collapsed.value = allCollapsed.value ? new Set() : new Set(foldable.value)
}

// The rows to show: an item is hidden while it sits under a collapsed ancestor. Each visible row
// carries whether it can fold and whether it currently is.
const visible = computed(() => {
  const rows: (OutlineItem & { children: boolean; folded: boolean })[] = []
  let hideDeeperThan = Infinity
  items.value.forEach((it, i) => {
    if (it.depth > hideDeeperThan) return
    hideDeeperThan = Infinity
    const children = hasChildren(i)
    const folded = collapsed.value.has(it.id)
    rows.push({ ...it, children, folded })
    if (children && folded) hideDeeperThan = it.depth
  })
  return rows
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
        <div class="head-right">
          <button v-if="foldable.length" class="fold-all" @click="toggleAll">
            {{ allCollapsed ? 'Expand all' : 'Collapse all' }}
          </button>
          <button class="close" title="Close" @click="emit('close')"><Icon name="close" :size="16" /></button>
        </div>
      </header>
      <div v-if="items.length" class="list">
        <div v-for="item in visible" :key="item.id" class="row" :class="`d${item.depth}`">
          <button
            v-if="item.children"
            class="twist"
            :class="{ folded: item.folded }"
            :title="item.folded ? 'Expand' : 'Collapse'"
            @click="toggle(item.id)"
          >
            <Icon name="chevronDown" :size="14" />
          </button>
          <span v-else class="twist spacer" />
          <button class="item" @click="jump(item.id)">{{ item.text }}</button>
        </div>
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
.head-right {
  display: flex;
  align-items: center;
  gap: 4px;
}
.fold-all {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 5px 8px;
  border-radius: 8px;
}
.fold-all:hover {
  background: var(--surface-sunken);
  color: var(--text);
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
.row {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: 8px;
}
.row:hover {
  background: var(--accent-wash);
}
.twist {
  flex-shrink: 0;
  width: 22px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  border-radius: 6px;
  transition: transform 0.15s ease;
}
.twist.folded {
  transform: rotate(-90deg);
}
.twist.spacer {
  cursor: default;
}
.item {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: var(--text);
  font: inherit;
  font-size: 14px;
  padding: 8px 10px 8px 2px;
  border-radius: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row.d0 .item {
  font-weight: 700;
}
.row.d1 {
  padding-left: 18px;
}
.row.d2 {
  padding-left: 34px;
}
.row.d2 .item {
  color: var(--text-soft, var(--text-muted));
}
.empty {
  padding: 20px 12px;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.4;
}
</style>
