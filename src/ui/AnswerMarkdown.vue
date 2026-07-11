<script setup lang="ts">
// Renders an AI answer's Markdown as real elements — headings, lists, bold/italic/code — and
// turns each [n] citation into a chip that opens the note it came from. It never uses innerHTML,
// so an answer cannot inject markup; every span is placed as text into a real tag.
import { computed } from 'vue'
import { parseMarkdown } from './markdownLite'
import type { ChatSource } from '@/compose/useNotesChat'

const props = defineProps<{ text: string; sources?: ChatSource[] }>()
const emit = defineEmits<{ (e: 'open', id: string): void }>()

const blocks = computed(() => parseMarkdown(props.text))

// Open the note behind a citation number, if it maps to a source.
function openCite(n: number | undefined) {
  const src = props.sources?.find((s) => s.n === n)
  if (src) emit('open', src.noteId)
}
</script>

<template>
  <div class="md">
    <template v-for="(block, bi) in blocks" :key="bi">
      <component :is="`h${Math.min(block.level ?? 3, 4) + 2}`" v-if="block.kind === 'h'" class="md-h">
        <template v-for="(s, si) in block.spans" :key="si">
          <strong v-if="s.kind === 'bold'">{{ s.text }}</strong>
          <em v-else-if="s.kind === 'italic'">{{ s.text }}</em>
          <code v-else-if="s.kind === 'code'">{{ s.text }}</code>
          <button v-else-if="s.kind === 'cite'" class="cite" @click="openCite(s.n)">{{ s.n }}</button>
          <template v-else>{{ s.text }}</template>
        </template>
      </component>

      <ul v-else-if="block.kind === 'ul'" class="md-ul">
        <li v-for="(item, ii) in block.items" :key="ii">
          <template v-for="(s, si) in item" :key="si">
            <strong v-if="s.kind === 'bold'">{{ s.text }}</strong>
            <em v-else-if="s.kind === 'italic'">{{ s.text }}</em>
            <code v-else-if="s.kind === 'code'">{{ s.text }}</code>
            <button v-else-if="s.kind === 'cite'" class="cite" @click="openCite(s.n)">{{ s.n }}</button>
            <template v-else>{{ s.text }}</template>
          </template>
        </li>
      </ul>

      <ol v-else-if="block.kind === 'ol'" class="md-ol">
        <li v-for="(item, ii) in block.items" :key="ii">
          <template v-for="(s, si) in item" :key="si">
            <strong v-if="s.kind === 'bold'">{{ s.text }}</strong>
            <em v-else-if="s.kind === 'italic'">{{ s.text }}</em>
            <code v-else-if="s.kind === 'code'">{{ s.text }}</code>
            <button v-else-if="s.kind === 'cite'" class="cite" @click="openCite(s.n)">{{ s.n }}</button>
            <template v-else>{{ s.text }}</template>
          </template>
        </li>
      </ol>

      <p v-else class="md-p">
        <template v-for="(s, si) in block.spans" :key="si">
          <strong v-if="s.kind === 'bold'">{{ s.text }}</strong>
          <em v-else-if="s.kind === 'italic'">{{ s.text }}</em>
          <code v-else-if="s.kind === 'code'">{{ s.text }}</code>
          <button v-else-if="s.kind === 'cite'" class="cite" @click="openCite(s.n)">{{ s.n }}</button>
          <template v-else>{{ s.text }}</template>
        </template>
      </p>
    </template>
  </div>
</template>

<style scoped>
.md {
  font-size: 14px;
  line-height: 1.55;
}
.md-p {
  margin: 0 0 10px;
}
.md-p:last-child {
  margin-bottom: 0;
}
.md-h {
  margin: 12px 0 6px;
  font-weight: 700;
  line-height: 1.3;
}
h3.md-h {
  font-size: 15.5px;
}
h4.md-h,
h5.md-h,
h6.md-h {
  font-size: 14.5px;
}
.md-ul,
.md-ol {
  margin: 0 0 10px;
  padding-left: 20px;
}
.md-ul li,
.md-ol li {
  margin: 3px 0;
}
.md-ul {
  list-style: disc;
}
.md-ol {
  list-style: decimal;
}
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  background: var(--surface-sunken, rgba(0, 0, 0, 0.06));
  padding: 1px 5px;
  border-radius: 5px;
}
.cite {
  display: inline-grid;
  place-items: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  margin: 0 1px;
  border: none;
  border-radius: 999px;
  background: var(--accent, #4a72b0);
  color: #fff;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  vertical-align: baseline;
  transform: translateY(1px);
}
.cite:hover {
  filter: brightness(1.1);
}
</style>
