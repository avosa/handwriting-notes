<script setup lang="ts">
// The writing column: the blocks that flow down a page. Each text block is one line
// of handwriting per rule, editable in place; diagrams sit inline at a whole number
// of rules tall so the writing below resumes on a rule. Titles use the header font
// in title blue, headings the header font in section red, body the body font in ink.
import { computed, type CSSProperties } from 'vue'
import type { Block, Page, TextRole } from '@/types'
import type { TextMetrics } from './alignment'
import { getHandwriting, bodyFontStack, headerFontStack } from '@/handwriting/registry'
import { stripDashes } from '@/ai/noteLint'
import { useDocument } from '@/store/document'
import { useSettings } from '@/store/settings'
import Diagram from '@/diagrams/Diagram.vue'

const props = defineProps<{
  page: Page
  metrics: TextMetrics
  pxPerMm: number
  editable: boolean
}>()

const documentStore = useDocument()
const settings = useSettings()
const handwriting = computed(() => getHandwriting(settings.activeHandwritingId))

const lineHeightPx = computed(() => props.metrics.lineHeight * props.pxPerMm)
const columnStyle = computed(() => ({
  left: `${props.metrics.left * props.pxPerMm}px`,
  top: `${(props.metrics.firstBaseline - props.metrics.lineHeight) * props.pxPerMm}px`,
  width: `${props.metrics.width * props.pxPerMm}px`,
}))

function roleColor(role: TextRole): string {
  const p = handwriting.value.palette
  return role === 'title' ? p.title : role === 'heading' ? p.heading : p.ink
}

function roleFont(role: TextRole): string {
  return role === 'body' ? bodyFontStack(handwriting.value) : headerFontStack(handwriting.value)
}

function textStyle(block: Extract<Block, { type: 'text' }>): CSSProperties {
  const t = block.text
  const leadRules = Math.round(props.metrics.roleLeadIn[t.role])
  return {
    fontFamily: roleFont(t.role),
    fontSize: `${props.metrics.fontSize[t.role] * props.pxPerMm}px`,
    lineHeight: `${lineHeightPx.value}px`,
    color: t.color ?? roleColor(t.role),
    fontWeight: t.bold ? 700 : 400,
    textAlign: t.align ?? 'left',
    marginTop: `${leadRules * lineHeightPx.value}px`,
    marginLeft: `${(t.indent ?? 0) * props.pxPerMm}px`,
  }
}

function diagramStyle(heightRules: number) {
  return { height: `${heightRules * lineHeightPx.value}px` }
}

// Keep the standing no-dashes rule: strip any hyphen or dash the moment it is typed,
// then push the cleaned text back to the store.
function onEdit(blockId: string, event: Event) {
  const el = event.target as HTMLElement
  const cleaned = stripDashes(el.innerText)
  if (cleaned !== el.innerText) el.innerText = cleaned
  documentStore.updateTextBlock(blockId, { content: cleaned })
}
</script>

<template>
  <div class="text-layer" :style="columnStyle">
    <template v-for="block in page.blocks" :key="block.id">
      <div
        v-if="block.type === 'text'"
        class="block"
        :class="{ editable }"
        :style="textStyle(block)"
        :contenteditable="editable"
        spellcheck="false"
        @input="onEdit(block.id, $event)"
      >
        {{ block.text.content }}
      </div>
      <div v-else class="diagram-slot" :style="diagramStyle(block.heightRules)">
        <Diagram
          :spec="block.spec"
          :width-mm="metrics.width"
          :height-mm="block.heightRules * metrics.lineHeight"
          :font-stack="bodyFontStack(handwriting)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.text-layer {
  position: absolute;
}
.block {
  outline: none;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  cursor: text;
}
.block:not(.editable) {
  cursor: default;
}
.block.editable:focus {
  background: rgba(74, 114, 176, 0.06);
  border-radius: 3px;
}
.diagram-slot {
  width: 100%;
}
</style>
