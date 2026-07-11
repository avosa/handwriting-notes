<script setup lang="ts">
// A quick way to reach any action by name. It opens over the page, takes focus, filters as
// the reader types, and runs the highlighted action on Enter. Arrow keys move the highlight,
// the mouse can click straight through, and Escape closes it. The list items are not tab
// stops: the field keeps focus and drives the highlight, the way a command bar usually does.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { useFocusTrap } from './useFocusTrap'

export interface Command {
  id: string
  title: string
  hint?: string
  icon?: string
  run: () => void
}

const props = defineProps<{ commands: Command[] }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const card = ref<HTMLElement | null>(null)
const field = ref<HTMLInputElement | null>(null)
const listbox = ref<HTMLElement | null>(null)
const query = ref('')
const active = ref(0)

useFocusTrap(card, () => emit('close'))

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.commands
  return props.commands.filter((c) => c.title.toLowerCase().includes(q) || (c.hint?.toLowerCase().includes(q) ?? false))
})

watch(results, () => {
  active.value = 0
})

function run(command: Command | undefined) {
  if (!command) return
  emit('close')
  command.run()
}

function move(delta: number) {
  const count = results.value.length
  if (!count) return
  active.value = (active.value + delta + count) % count
  void nextTick(() => {
    listbox.value?.querySelector(`[data-idx="${active.value}"]`)?.scrollIntoView({ block: 'nearest' })
  })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    run(results.value[active.value])
  }
}

onMounted(() => field.value?.focus())
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="card" class="palette" role="dialog" aria-modal="true" aria-label="Commands" tabindex="-1">
      <div class="search">
        <Icon name="search" :size="18" class="glyph" />
        <input
          ref="field"
          v-model="query"
          class="field"
          type="text"
          placeholder="Type a command…"
          role="combobox"
          aria-controls="command-list"
          aria-expanded="true"
          spellcheck="false"
          @keydown="onKeydown"
        />
      </div>
      <ul id="command-list" ref="listbox" class="list" role="listbox">
        <li
          v-for="(command, i) in results"
          :key="command.id"
          :data-idx="i"
          class="item"
          :class="{ active: i === active }"
          role="option"
          :aria-selected="i === active"
          @mouseenter="active = i"
          @mousedown.prevent="run(command)"
        >
          <Icon v-if="command.icon" :name="command.icon" :size="17" class="item-glyph" />
          <span class="item-title">{{ command.title }}</span>
          <span v-if="command.hint" class="item-hint">{{ command.hint }}</span>
        </li>
        <li v-if="!results.length" class="empty">No commands match “{{ query }}”.</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 14vh;
  background: rgba(20, 20, 28, 0.32);
  backdrop-filter: blur(2px);
}
.palette {
  width: min(560px, calc(100vw - 24px));
  max-height: 62vh;
  display: flex;
  flex-direction: column;
  background: var(--surface, #fff);
  color: var(--ink, #23232e);
  border-radius: 14px;
  box-shadow: var(--pop-shadow, 0 18px 50px rgba(0, 0, 0, 0.3));
  overflow: hidden;
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--hairline, rgba(0, 0, 0, 0.08));
}
.glyph {
  opacity: 0.5;
  flex-shrink: 0;
}
.field {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font-size: 15px;
  font-family: inherit;
}
.list {
  list-style: none;
  margin: 0;
  padding: 6px;
  overflow-y: auto;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 9px;
  cursor: pointer;
}
.item.active {
  background: var(--accent-wash-2, rgba(74, 114, 176, 0.14));
}
.item-glyph {
  opacity: 0.7;
  flex-shrink: 0;
}
.item-title {
  font-size: 14px;
  font-weight: 500;
}
.item-hint {
  margin-left: auto;
  font-size: 12px;
  opacity: 0.5;
}
.empty {
  padding: 14px 12px;
  font-size: 14px;
  opacity: 0.6;
  text-align: center;
}
</style>
