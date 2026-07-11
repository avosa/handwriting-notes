<script setup lang="ts">
// The dock that floats at the bottom. A segmented switch flips between writing and
// drawing. Writing shows the line type, emphasis, colour, alignment, and an insert
// menu. Drawing shows a tray of real looking instruments you pick up, plus a width
// slider and the ink colour. It is touch friendly and scrolls rather than crowd.
import { computed, ref } from 'vue'
import type { PenType, TextRole } from '@/types'
import { useDocument } from '@/store/document'
import { putBlob } from '@/store/persistence'
import { uid } from '@/util/id'
import { useSettings } from '@/store/settings'
import { penOrder, penProfile } from '@/tools/penTypes'
import { toggleBold, toggleItalic, toggleUnderline, setTextColor, setHighlight, rememberSelection } from './marks'
import { diagramBlock, diagramPresets } from '@/diagrams/presets'
import Icon from '@/ui/Icon.vue'
import Popover from '@/ui/Popover.vue'
import ColorPicker from '@/ui/ColorPicker.vue'
import ToolInstrument from '@/tools/ToolInstrument.vue'

const props = defineProps<{ mode: 'write' | 'draw' }>()
const emit = defineEmits<{ (e: 'update:mode', value: 'write' | 'draw'): void }>()

const documentStore = useDocument()
const settings = useSettings()
const highlightColour = ref('#F7E36A')

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
// While the AI works, the tool it is reaching for lights up as though it clicked it, and the
// role control names the role it just chose, so the writing looks hand made with the tools.
const aiTool = computed(() => documentStore.aiTool)
const aiRole = computed(() => roles.find((r) => r.role === aiTool.value) ?? null)
const aiInsertPress = computed(() => ['list', 'table', 'diagram', 'callouts'].includes(aiTool.value ?? ''))
const activeRoleLabel = computed(
  () => aiRole.value?.label ?? roles.find((r) => r.role === selectedRole.value)?.label ?? 'Text',
)
const activeRoleIcon = computed(
  () => aiRole.value?.icon ?? roles.find((r) => r.role === selectedRole.value)?.icon ?? 'paragraph',
)

function toolColor(tool: PenType): string {
  return tool === 'pencil' || tool === 'eraser' ? '#33334C' : settings.activeColor
}

function applyRole(role: TextRole) {
  if (selectedId.value) documentStore.setRole(selectedId.value, role)
}
function applyAlign(align: 'left' | 'center' | 'justify') {
  if (selectedId.value) documentStore.setAlign(selectedId.value, align)
}
function insertParagraph(role: TextRole) {
  documentStore.select(documentStore.addParagraphAfter(selectedId.value, role))
}
function insertList(ordered: boolean) {
  documentStore.select(documentStore.convertToList(selectedId.value, ordered))
}
function insertTaskList() {
  documentStore.select(documentStore.addTaskList(selectedId.value))
}
function insertQuote() {
  documentStore.select(documentStore.addQuote(selectedId.value))
}
function insertCode() {
  documentStore.select(documentStore.addCode(selectedId.value))
}
function insertToggle() {
  documentStore.select(documentStore.addToggle(selectedId.value))
}
function insertDivider() {
  documentStore.select(documentStore.addDivider(selectedId.value))
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

// Roughly how many ruled lines the text column spans across its width, used to turn a
// picture's shape into a height in whole lines so a full-width picture keeps its proportions.
const COLUMN_RULES_ACROSS = 16

const imageInput = ref<HTMLInputElement | null>(null)
function pickImage() {
  imageInput.value?.click()
}
// Read a picture's shape, keep its bytes locally, and drop it into the column after the
// current line at a height that matches its proportions.
async function onImagePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !file.type.startsWith('image/')) return
  const ratio = await imageRatio(file)
  const key = `img_${uid()}`
  await putBlob(key, file)
  const heightRules = Math.max(4, Math.min(40, Math.round(COLUMN_RULES_ACROSS * ratio)))
  documentStore.select(documentStore.insertImage(selectedId.value, key, file.name, heightRules))
}
function imageRatio(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0.6)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0.6)
    }
    img.src = url
  })
}
</script>

<template>
  <div class="dock" :class="mode">
    <div class="switch">
      <button :class="{ on: props.mode === 'write' }" title="Write" @click="emit('update:mode', 'write')">
        <Icon name="write" :size="18" /><span>Write</span>
      </button>
      <button :class="{ on: props.mode === 'draw' }" title="Draw" @click="emit('update:mode', 'draw')">
        <Icon name="draw" :size="18" /><span>Draw</span>
      </button>
    </div>

    <div class="divider" />

    <template v-if="props.mode === 'write'">
      <div class="controls">
        <Popover align="center">
          <template #trigger>
            <button class="pill" data-ai-tool="role" :class="{ 'ai-press': !!aiRole }">
              <Icon :name="activeRoleIcon" :size="18" /><span class="pill-text">{{ activeRoleLabel }}</span>
              <Icon name="chevronDown" :size="14" />
            </button>
          </template>
          <template #default>
            <div class="menu">
              <button v-for="r in roles" :key="r.role" class="menu-item" @click="applyRole(r.role)">
                <Icon :name="r.icon" :size="18" /><span>{{ r.label }}</span>
              </button>
            </div>
          </template>
        </Popover>

        <div class="group">
          <button title="Bold" @mousedown.prevent @click="toggleBold"><Icon name="bold" :size="18" /></button>
          <button title="Italic" @mousedown.prevent @click="toggleItalic"><Icon name="italic" :size="18" /></button>
          <button title="Underline" @mousedown.prevent @click="toggleUnderline">
            <Icon name="underline" :size="18" />
          </button>
        </div>

        <div class="group">
          <Popover align="center">
            <template #trigger>
              <button class="stacked" title="Text colour" @mousedown.prevent="rememberSelection">
                <Icon name="textColour" :size="18" />
                <span class="bar" :style="{ background: settings.activeColor }" />
              </button>
            </template>
            <template #default>
              <ColorPicker label="Text colour" :model-value="settings.activeColor" @update:model-value="setTextColor" />
            </template>
          </Popover>
          <Popover align="center">
            <template #trigger>
              <button class="stacked" title="Highlight" @mousedown.prevent="rememberSelection">
                <Icon name="highlighter" :size="18" />
                <span class="bar" :style="{ background: highlightColour }" />
              </button>
            </template>
            <template #default>
              <ColorPicker
                label="Highlight"
                :model-value="highlightColour"
                allow-clear
                @update:model-value="
                  (c) => {
                    highlightColour = c
                    setHighlight(c)
                  }
                "
                @clear="setHighlight('transparent')"
              />
            </template>
          </Popover>
        </div>

        <div class="group">
          <button title="Align left" @click="applyAlign('left')"><Icon name="alignLeft" :size="18" /></button>
          <button title="Centre" @click="applyAlign('center')"><Icon name="alignCenter" :size="18" /></button>
          <button title="Justify" @click="applyAlign('justify')"><Icon name="alignJustify" :size="18" /></button>
        </div>

        <Popover align="center">
          <template #trigger>
            <button class="pill accent" data-ai-tool="insert" :class="{ 'ai-press': aiInsertPress }">
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
              <button class="menu-item" @click="insertTaskList()">
                <Icon name="check" :size="18" /><span>Task list</span>
              </button>
              <button class="menu-item" @click="insertTable()">
                <Icon name="table" :size="18" /><span>Table</span>
              </button>
              <button class="menu-item" @click="insertCallouts()">
                <Icon name="callout" :size="18" /><span>Callout boxes</span>
              </button>
              <button class="menu-item" @click="insertQuote()">
                <Icon name="paragraph" :size="18" /><span>Quote</span>
              </button>
              <button class="menu-item" @click="insertCode()"><Icon name="file" :size="18" /><span>Code</span></button>
              <button class="menu-item" @click="insertToggle()">
                <Icon name="chevronDown" :size="18" /><span>Toggle section</span>
              </button>
              <button class="menu-item" @click="insertDivider()">
                <Icon name="pageBreak" :size="18" /><span>Divider</span>
              </button>
              <button class="menu-item" @click="pickImage()"><Icon name="image" :size="18" /><span>Image</span></button>
              <div class="menu-divider" />
              <div class="menu-label">Diagram</div>
              <button v-for="p in diagramPresets" :key="p.key" class="menu-item" @click="insertDiagram(p.key)">
                <Icon name="diagram" :size="18" /><span>{{ p.label }}</span>
              </button>
            </div>
          </template>
        </Popover>

        <button class="ghost" title="Add page" @click="addPage"><Icon name="pageAdd" :size="18" /></button>
        <input ref="imageInput" type="file" accept="image/*" class="hidden-input" @change="onImagePicked" />
      </div>
    </template>

    <template v-else>
      <div class="tray">
        <button
          v-for="tool in penOrder"
          :key="tool"
          class="slot"
          :class="{ picked: settings.activeTool === tool }"
          :title="penProfile(tool).name"
          @click="settings.selectTool(tool)"
        >
          <ToolInstrument :tool="tool" :color="toolColor(tool)" :active="settings.activeTool === tool" />
        </button>
      </div>
      <div class="divider" />
      <div class="draw-controls">
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
        <!-- The ink colour has no meaning while erasing, so it dissolves away when the
             eraser is picked up and pops back cutely for any inking tool. -->
        <Transition name="dissolve">
          <Popover v-if="settings.activeTool !== 'eraser'" align="center">
            <template #trigger>
              <button class="ink" title="Ink colour">
                <span class="ink-dot" :style="{ background: settings.activeColor }" />
              </button>
            </template>
            <template #default>
              <ColorPicker :model-value="settings.activeColor" @update:model-value="settings.selectColor" />
            </template>
          </Popover>
        </Transition>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hidden-input {
  display: none;
}
.dock {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--surface);
  backdrop-filter: blur(16px) saturate(1.3);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: var(--menu-shadow);
  max-width: calc(100vw - 20px);
  overflow-x: auto;
  scrollbar-width: none;
}
.dock::-webkit-scrollbar {
  display: none;
}
.dock.draw {
  align-items: flex-end;
  padding-bottom: 10px;
}

.switch {
  display: flex;
  gap: 2px;
  background: var(--surface-sunken);
  border-radius: 12px;
  padding: 3px;
  flex-shrink: 0;
}
.switch button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  border-radius: 9px;
  padding: 8px 12px;
  cursor: pointer;
  color: var(--text-soft);
  font-size: 13px;
  font-weight: 500;
}
.switch button.on {
  background: var(--surface);
  color: var(--brand);
  box-shadow: 0 1px 4px rgba(51, 51, 76, 0.14);
}

.divider {
  width: 1px;
  align-self: stretch;
  background: var(--border);
  margin: 4px 2px;
  flex-shrink: 0;
}

.controls,
.group,
.draw-controls {
  display: flex;
  align-items: center;
  gap: 3px;
}
.controls {
  gap: 5px;
}
.group + .group,
.group {
  padding: 0 3px;
}

.dock button {
  color: var(--text);
}
.controls button,
.draw-controls .ink {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  background: transparent;
  border-radius: 10px;
  padding: 9px;
  min-width: 40px;
  min-height: 40px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.controls button:hover,
.draw-controls .ink:hover {
  background: var(--accent-wash-2);
}
.stacked {
  flex-direction: column;
  gap: 2px !important;
}
.stacked .bar {
  width: 18px;
  height: 3px;
  border-radius: 2px;
  box-shadow: inset 0 0 0 1px var(--border);
}
.pill {
  padding: 9px 13px !important;
  min-width: auto !important;
}
.pill-text {
  font-size: 13px;
  white-space: nowrap;
  font-weight: 500;
}
.pill.accent {
  background: var(--accent-wash-2);
  color: var(--brand);
}
/* The press the AI's ghost cursor makes on a tool: it sinks in, lights up in the accent, and
   a ring flares out from it, so the control plainly reacts to being clicked. */
.ai-press {
  color: var(--brand) !important;
  background: var(--accent-wash-2) !important;
  box-shadow: 0 0 0 2px var(--accent);
  animation: ai-press 0.44s ease;
}
@keyframes ai-press {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 var(--accent-shadow);
  }
  40% {
    transform: scale(0.9);
    box-shadow: 0 0 0 8px rgba(74, 114, 176, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 2px var(--accent);
  }
}
.ghost {
  color: var(--text-soft);
}

.tray {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 0 4px 2px;
  height: 78px;
}
.slot {
  width: 40px;
  height: 74px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  border-radius: 10px 10px 0 0;
  transition: background 0.12s ease;
}
.slot:hover {
  background: var(--accent-wash);
}
.slot.picked {
  background: linear-gradient(to top, var(--accent-wash-2), transparent);
}

.width {
  width: 96px;
  accent-color: var(--accent);
}
.ink-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  box-shadow:
    inset 0 0 0 1px var(--border),
    0 1px 3px rgba(51, 51, 76, 0.2);
}

/* The ink colour decomposes when the eraser is chosen and springs back for any other
   tool — a small, deliberate flourish so the change is felt, not just seen. */
.dissolve-enter-active {
  transition:
    opacity 0.24s ease,
    transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1),
    filter 0.24s ease;
}
.dissolve-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease,
    filter 0.18s ease;
}
.dissolve-enter-from {
  opacity: 0;
  transform: scale(0.3) rotate(-14deg);
  filter: blur(3px);
}
.dissolve-leave-to {
  opacity: 0;
  transform: scale(0.3) rotate(10deg);
  filter: blur(3px);
}

.menu {
  display: flex;
  flex-direction: column;
  padding: 6px;
  min-width: 182px;
}
.menu.wide {
  min-width: 214px;
  max-height: 60vh;
  overflow-y: auto;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 11px;
  border: none;
  background: transparent;
  border-radius: 10px;
  padding: 10px 11px;
  width: 100%;
  cursor: pointer;
  color: var(--text);
  font-size: 14px;
  text-align: left;
}
.menu-item:hover {
  background: var(--accent-wash-2);
}
.menu-divider {
  height: 1px;
  background: var(--border);
  margin: 5px 8px;
}
.menu-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: 5px 11px 2px;
}

@media (max-width: 640px) {
  .dock {
    width: calc(100vw - 16px);
    border-radius: 16px;
  }
  .switch button span {
    display: none;
  }
  .pill-text {
    display: none;
  }
}

@media (max-width: 720px) {
  .dock {
    max-width: calc(100vw - 16px);
    margin-bottom: env(safe-area-inset-bottom, 0);
  }
  .controls button,
  .draw-controls .ink,
  .switch button {
    min-width: 40px;
    min-height: 40px;
  }
}
</style>
