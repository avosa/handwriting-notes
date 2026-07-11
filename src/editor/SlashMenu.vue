<script setup lang="ts">
// The block menu a slash opens on an empty line. It floats at the caret, filters its actions
// as the writer keeps typing after the slash, and turns the line into the chosen block. It
// owns the keyboard while it is open — arrows move the highlight, enter or tab takes the
// highlighted action, and escape closes it — capturing those keys before the line beneath can
// act on them, so typing a command never also splits the line or moves the caret.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '@/ui/Icon.vue'

export interface SlashCommand {
  id: string
  title: string
  keywords: string
  icon: string
}

const ALL: SlashCommand[] = [
  { id: 'title', title: 'Title', keywords: 'title big', icon: 'heading' },
  { id: 'subtitle', title: 'Subtitle', keywords: 'subtitle', icon: 'heading' },
  { id: 'heading', title: 'Heading', keywords: 'heading h1', icon: 'heading' },
  { id: 'subheading', title: 'Subheading', keywords: 'subheading h2', icon: 'heading' },
  { id: 'body', title: 'Body text', keywords: 'body text paragraph plain', icon: 'paragraph' },
  { id: 'caption', title: 'Caption', keywords: 'caption small note', icon: 'paragraph' },
  { id: 'bullet', title: 'Bulleted list', keywords: 'bullet list unordered', icon: 'listBullet' },
  { id: 'numbered', title: 'Numbered list', keywords: 'numbered ordered list', icon: 'listOrdered' },
  { id: 'task', title: 'Task list', keywords: 'task todo checklist check', icon: 'check' },
  { id: 'quote', title: 'Quote', keywords: 'quote blockquote', icon: 'paragraph' },
  { id: 'code', title: 'Code', keywords: 'code monospace', icon: 'file' },
  { id: 'math', title: 'Math (LaTeX)', keywords: 'math latex equation formula tex', icon: 'file' },
  { id: 'toggle', title: 'Toggle section', keywords: 'toggle collapse section fold details', icon: 'chevronDown' },
  { id: 'divider', title: 'Divider', keywords: 'divider rule line separator', icon: 'pageBreak' },
]

const props = defineProps<{ query: string; x: number; y: number }>()
const emit = defineEmits<{ (e: 'pick', id: string): void; (e: 'close'): void }>()

const active = ref(0)

const results = computed(() => {
  const q = props.query.trim().toLowerCase()
  if (!q) return ALL
  return ALL.filter((c) => c.title.toLowerCase().includes(q) || c.keywords.includes(q))
})

// A fresh filter puts the highlight back on the first row, and an empty result set tells the
// parent to close rather than leave a stranded box floating with nothing to pick.
watch(results, (rows) => {
  active.value = 0
  if (!rows.length) emit('close')
})

// Keep the menu on screen: it opens below the caret, but flips above when it would run off the
// bottom, and never sits so far right that it is clipped.
const style = computed(() => {
  const width = 220
  const rowH = 34
  const height = Math.min(results.value.length, 7) * rowH + 12
  const flipUp = props.y + height > window.innerHeight - 8
  const left = Math.min(props.x, window.innerWidth - width - 8)
  const top = flipUp ? props.y - height - 20 : props.y + 6
  return { left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px`, width: `${width}px` }
})

function move(delta: number) {
  const n = results.value.length
  if (n) active.value = (active.value + delta + n) % n
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    event.stopPropagation()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    event.stopPropagation()
    move(-1)
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    const pick = results.value[active.value]
    if (pick) emit('pick', pick.id)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <div class="slash-menu" :style="style" role="listbox" aria-label="Insert block">
    <button
      v-for="(command, i) in results"
      :key="command.id"
      class="slash-item"
      :class="{ active: i === active }"
      role="option"
      :aria-selected="i === active"
      @mouseenter="active = i"
      @mousedown.prevent="emit('pick', command.id)"
    >
      <Icon :name="command.icon" :size="16" class="glyph" />
      <span class="title">{{ command.title }}</span>
    </button>
  </div>
</template>

<style scoped>
.slash-menu {
  position: fixed;
  z-index: 70;
  display: flex;
  flex-direction: column;
  max-height: 250px;
  overflow-y: auto;
  padding: 6px;
  background: var(--surface, #fff);
  color: var(--ink, #23232e);
  border-radius: 12px;
  box-shadow: var(--pop-shadow, 0 12px 30px rgba(0, 0, 0, 0.28));
}
.slash-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 9px;
  border: none;
  background: transparent;
  color: inherit;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  font: inherit;
  font-size: 14px;
}
.slash-item.active {
  background: var(--accent-wash-2, rgba(74, 114, 176, 0.14));
}
.glyph {
  opacity: 0.7;
  flex-shrink: 0;
}
.title {
  font-weight: 500;
}
</style>
