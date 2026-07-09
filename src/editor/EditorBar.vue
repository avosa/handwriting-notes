<script setup lang="ts">
// The control surface that floats at the bottom. When writing it offers the block
// type, emphasis, alignment, colour, and an insert menu; when drawing it offers the
// pens, width, fill, and colour. It stays compact and quiet so the paper leads.
import { computed } from 'vue'
import type { TextRole } from '@/types'
import { useDocument } from '@/store/document'
import { useSettings } from '@/store/settings'
import { penOrder, penProfile } from '@/tools/penTypes'
import { toggleBold, toggleItalic, toggleUnderline, setTextColor, setHighlight } from './marks'
import { diagramBlock, diagramPresets } from '@/diagrams/presets'
import Icon from '@/ui/Icon.vue'
import Popover from '@/ui/Popover.vue'
import ColorPicker from '@/ui/ColorPicker.vue'

const props = defineProps<{ mode: 'write' | 'draw' }>()
const emit = defineEmits<{ (e: 'update:mode', value: 'write' | 'draw'): void }>()

const documentStore = useDocument()
const settings = useSettings()

const roles: { role: TextRole; label: string; icon: string }[] = [
  { role: 'title', label: 'Title', icon: 'title' },
  { role: 'subtitle', label: 'Subtitle', icon: 'paragraph' },
  { role: 'heading', label: 'Heading', icon: 'heading' },
  { role: 'subheading', label: 'Subheading', icon: 'heading' },
  { role: 'body', label: 'Body', icon: 'paragraph' },
  { role: 'caption', label: 'Caption', icon: 'paragraph' },
]

const selectedId = computed(() => documentStore.selectedBlockId)
const selectedRole = computed(() => {
  const b = documentStore.selectedBlock
  return b && b.type === 'text' ? b.text.role : null
})

const penIcon: Record<string, string> = {
  pencil: 'pencil',
  fine: 'pen',
  marker: 'marker',
  highlighter: 'highlighter',
  fill: 'palette',
  eraser: 'eraser',
}

function applyRole(role: TextRole) {
  if (selectedId.value) documentStore.setRole(selectedId.value, role)
}
function applyAlign(align: 'left' | 'center' | 'justify') {
  if (selectedId.value) documentStore.setAlign(selectedId.value, align)
}
function insertParagraph(role: TextRole) {
  const id = documentStore.addParagraphAfter(selectedId.value, role)
  documentStore.select(id)
}
function insertList(ordered: boolean) {
  documentStore.select(documentStore.addList(selectedId.value, ordered))
}
function insertTable() {
  documentStore.select(documentStore.addTable(selectedId.value, 3, 2))
}
function insertCallouts() {
  documentStore.select(
    documentStore.addCallouts(
      selectedId.value,
      [
        { color: '#4A72B0', heading: [{ text: 'This' }], items: [[{ text: '' }]] },
        { color: '#C8792E', heading: [{ text: 'That' }], items: [[{ text: '' }]] },
      ],
      'compare',
    ),
  )
}
function insertDiagram(key: string) {
  const preset = diagramPresets.find((p) => p.key === key)
  if (preset) documentStore.select(documentStore.addDiagram(selectedId.value, diagramBlock(preset)))
}
function addPage() {
  documentStore.setActivePage(documentStore.addBlankPage())
}
</script>

<template>
  <div class="bar">
    <div class="segment modes">
      <button :class="{ on: props.mode === 'write' }" title="Write" @click="emit('update:mode', 'write')">
        <Icon name="write" />
      </button>
      <button :class="{ on: props.mode === 'draw' }" title="Draw" @click="emit('update:mode', 'draw')">
        <Icon name="draw" />
      </button>
    </div>

    <template v-if="props.mode === 'write'">
      <Popover align="center">
        <template #trigger>
          <button class="pill" title="Line type">
            <Icon :name="roles.find((r) => r.role === selectedRole)?.icon ?? 'paragraph'" :size="18" />
            <span class="pill-text">{{ roles.find((r) => r.role === selectedRole)?.label ?? 'Text' }}</span>
            <Icon name="chevronDown" :size="14" />
          </button>
        </template>
        <template #default>
          <div class="menu">
            <button v-for="r in roles" :key="r.role" class="menu-item" @click="applyRole(r.role)">
              <Icon :name="r.icon" :size="18" />
              <span>{{ r.label }}</span>
            </button>
          </div>
        </template>
      </Popover>

      <div class="segment">
        <button title="Bold" @mousedown.prevent @click="toggleBold"><Icon name="bold" :size="18" /></button>
        <button title="Italic" @mousedown.prevent @click="toggleItalic"><Icon name="italic" :size="18" /></button>
        <button title="Underline" @mousedown.prevent @click="toggleUnderline">
          <Icon name="underline" :size="18" />
        </button>
      </div>

      <div class="segment">
        <Popover align="center">
          <template #trigger>
            <button title="Text colour"><Icon name="palette" :size="18" /></button>
          </template>
          <template #default>
            <ColorPicker
              label="Text colour"
              :model-value="settings.activeColor"
              @update:model-value="
                (c: string) => {
                  setTextColor(c)
                  settings.rememberColor(c)
                }
              "
            />
          </template>
        </Popover>
        <Popover align="center">
          <template #trigger>
            <button title="Highlight"><Icon name="highlighter" :size="18" /></button>
          </template>
          <template #default>
            <ColorPicker
              label="Highlight"
              :model-value="'#F7E36A'"
              allow-clear
              @update:model-value="(c: string) => setHighlight(c)"
              @clear="setHighlight('transparent')"
            />
          </template>
        </Popover>
      </div>

      <div class="segment">
        <button title="Align left" @click="applyAlign('left')"><Icon name="alignLeft" :size="18" /></button>
        <button title="Align centre" @click="applyAlign('center')"><Icon name="alignCenter" :size="18" /></button>
        <button title="Justify" @click="applyAlign('justify')"><Icon name="alignJustify" :size="18" /></button>
      </div>

      <Popover align="center">
        <template #trigger>
          <button class="pill" title="Insert">
            <Icon name="plus" :size="18" /><span class="pill-text">Insert</span>
          </button>
        </template>
        <template #default>
          <div class="menu wide">
            <button class="menu-item" @click="insertParagraph('heading')">
              <Icon name="heading" :size="18" /><span>Heading</span>
            </button>
            <button class="menu-item" @click="insertParagraph('body')">
              <Icon name="paragraph" :size="18" /><span>Paragraph</span>
            </button>
            <button class="menu-item" @click="insertList(true)">
              <Icon name="listOrdered" :size="18" /><span>Numbered list</span>
            </button>
            <button class="menu-item" @click="insertList(false)">
              <Icon name="listBullet" :size="18" /><span>Bulleted list</span>
            </button>
            <button class="menu-item" @click="insertTable()"><Icon name="table" :size="18" /><span>Table</span></button>
            <button class="menu-item" @click="insertCallouts()">
              <Icon name="callout" :size="18" /><span>Callout boxes</span>
            </button>
            <div class="menu-divider" />
            <div class="menu-label">Diagram</div>
            <button v-for="p in diagramPresets" :key="p.key" class="menu-item" @click="insertDiagram(p.key)">
              <Icon name="diagram" :size="18" /><span>{{ p.label }}</span>
            </button>
          </div>
        </template>
      </Popover>

      <button class="ghost" title="Add page" @click="addPage"><Icon name="pageAdd" :size="18" /></button>
    </template>

    <template v-else>
      <div class="segment pens">
        <button
          v-for="tool in penOrder"
          :key="tool"
          :class="{ on: settings.activeTool === tool }"
          :title="penProfile(tool).name"
          @click="settings.selectTool(tool)"
        >
          <Icon :name="penIcon[tool]" :size="18" />
        </button>
      </div>
      <input
        v-if="settings.activeTool !== 'fill'"
        class="width"
        type="range"
        :min="penProfile(settings.activeTool).minWidth"
        :max="penProfile(settings.activeTool).maxWidth"
        :step="0.1"
        :value="settings.activeWidth"
        title="Width"
        @input="settings.setWidth(Number(($event.target as HTMLInputElement).value))"
      />
      <Popover align="center">
        <template #trigger>
          <button title="Ink colour">
            <span class="ink-dot" :style="{ background: settings.activeColor }" />
          </button>
        </template>
        <template #default>
          <ColorPicker :model-value="settings.activeColor" @update:model-value="settings.selectColor" />
        </template>
      </Popover>
    </template>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(51, 51, 76, 0.1);
  border-radius: 16px;
  box-shadow: 0 10px 34px rgba(51, 51, 76, 0.16);
  max-width: calc(100vw - 24px);
  overflow-x: auto;
  scrollbar-width: none;
}
.bar::-webkit-scrollbar {
  display: none;
}
.segment {
  display: flex;
  align-items: center;
  gap: 2px;
}
.segment + .segment,
.segment + :deep(.popover-root),
:deep(.popover-root) + .segment {
  padding-left: 6px;
  margin-left: 2px;
  border-left: 1px solid rgba(51, 51, 76, 0.1);
}
button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  border-radius: 10px;
  padding: 8px;
  cursor: pointer;
  color: #33334c;
  min-width: 38px;
  min-height: 38px;
  justify-content: center;
  transition: background 0.12s ease;
}
button:hover {
  background: rgba(74, 114, 176, 0.12);
}
button.on {
  background: rgba(74, 114, 176, 0.2);
}
.pill {
  padding: 8px 12px;
  min-width: auto;
}
.pill-text {
  font-size: 13px;
  white-space: nowrap;
}
.ghost {
  color: #6a6a80;
}
.width {
  width: 84px;
  accent-color: #4a72b0;
}
.ink-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(51, 51, 76, 0.25);
}
.menu {
  display: flex;
  flex-direction: column;
  padding: 6px;
  min-width: 180px;
}
.menu.wide {
  min-width: 210px;
  max-height: 60vh;
  overflow-y: auto;
}
.menu-item {
  justify-content: flex-start;
  gap: 10px;
  padding: 9px 10px;
  width: 100%;
  font-size: 14px;
}
.menu-item span {
  font-size: 14px;
}
.menu-divider {
  height: 1px;
  background: rgba(51, 51, 76, 0.1);
  margin: 5px 8px;
}
.menu-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #9a9aa8;
  padding: 4px 10px 2px;
}
</style>
