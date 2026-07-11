<script setup lang="ts">
// A small emoji picker. It searches across a curated set and drops the chosen emoji straight into
// the line being written. Every button keeps the caret where it is — nothing here takes focus —
// so an emoji lands exactly where the writer left off.
import { computed, ref } from 'vue'
import { emojiGroups, searchEmoji } from './emojiData'

const emit = defineEmits<{ (e: 'pick', char: string): void }>()
const query = ref('')

const results = computed(() => (query.value.trim() ? searchEmoji(query.value) : null))
</script>

<template>
  <div class="emoji-picker" @mousedown.prevent>
    <input v-model="query" class="emoji-search" placeholder="Search emoji" spellcheck="false" />
    <div class="emoji-scroll">
      <template v-if="results">
        <div class="emoji-grid">
          <button v-for="char in results" :key="char" class="emoji" @mousedown.prevent="emit('pick', char)">
            {{ char }}
          </button>
        </div>
        <div v-if="!results.length" class="emoji-empty">No emoji match “{{ query }}”.</div>
      </template>
      <template v-else>
        <div v-for="group in emojiGroups" :key="group.name" class="emoji-group">
          <div class="emoji-group-name">{{ group.name }}</div>
          <div class="emoji-grid">
            <button
              v-for="e in group.emoji"
              :key="e.char"
              class="emoji"
              :title="e.keywords"
              @mousedown.prevent="emit('pick', e.char)"
            >
              {{ e.char }}
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.emoji-picker {
  width: 264px;
  padding: 8px;
}
.emoji-search {
  width: 100%;
  box-sizing: border-box;
  border: none;
  outline: none;
  background: var(--accent-wash, rgba(74, 114, 176, 0.08));
  color: inherit;
  border-radius: 8px;
  padding: 7px 10px;
  font: inherit;
  font-size: 13px;
  margin-bottom: 6px;
}
.emoji-scroll {
  max-height: 240px;
  overflow-y: auto;
}
.emoji-group-name {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.5;
  margin: 6px 2px 3px;
}
.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
}
.emoji {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  padding: 4px 0;
  border-radius: 6px;
}
.emoji:hover {
  background: var(--accent-wash-2, rgba(74, 114, 176, 0.14));
}
.emoji-empty {
  padding: 12px;
  font-size: 13px;
  opacity: 0.6;
  text-align: center;
}
</style>
