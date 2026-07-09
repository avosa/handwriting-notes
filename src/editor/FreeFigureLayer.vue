<script setup lang="ts">
// Figures that have left the writing flow: each is drawn where it was dropped and can be
// dragged anywhere on the page. Selecting one highlights it and shows a bar to move, dock,
// or remove it; its contents stay editable. On a touch or pen device a long press on the
// figure starts the drag. In draw mode the layer ignores the pointer so a stroke can cross.
import { computed, ref, onBeforeUnmount, type CSSProperties } from 'vue'
import type { Block, Page } from '@/types'
import type { TextMetrics } from './alignment'
import { getHandwriting, bodyFontStack } from '@/handwriting/registry'
import { hashSeed } from '@/diagrams/wobble'
import { useDocument } from '@/store/document'
import { useSettings } from '@/store/settings'
import TableBlock from './TableBlock.vue'
import CalloutsBlock from './CalloutsBlock.vue'
import Diagram from '@/diagrams/Diagram.vue'
import Icon from '@/ui/Icon.vue'

const props = defineProps<{
  page: Page
  pageIndex: number
  metrics: TextMetrics
  pxPerMm: number
  mode: 'write' | 'draw'
  pageWidthMm: number
  pageHeightMm: number
}>()

const documentStore = useDocument()
const settings = useSettings()
const handwriting = computed(() => getHandwriting(settings.activeHandwritingId))
const floating = computed(() => props.page.blocks.filter((b) => b.float))

// The figure being dragged right now, so it can show a lifted state while it moves.
const draggingId = ref<string | null>(null)
function isSelected(block: Block): boolean {
  return documentStore.selectedBlockId === block.id
}

function frameStyle(block: Block): CSSProperties {
  const f = block.float!
  return {
    left: `${f.x * props.pxPerMm}px`,
    top: `${f.y * props.pxPerMm}px`,
    width: `${f.width * props.pxPerMm}px`,
  }
}

function clampX(x: number): number {
  return Math.min(Math.max(0, x), props.pageWidthMm - 8)
}
function clampY(y: number): number {
  return Math.min(Math.max(0, y), props.pageHeightMm - 6)
}

// A single drag routine, driven by whichever handle or gesture starts it. Pointer capture
// keeps every move and the release bound to the element that began the drag, so a figure can
// be picked up again and again and the pointer never gets lost mid-drag on any device.
function runDrag(block: Block, handle: HTMLElement, pointerId: number, fromClientX: number, fromClientY: number) {
  documentStore.select(block.id)
  draggingId.value = block.id
  const originX = block.float!.x
  const originY = block.float!.y
  try {
    handle.setPointerCapture(pointerId)
  } catch {
    // Capture is best-effort; the drag still works through the element listeners below.
  }
  function onMove(move: PointerEvent) {
    if (move.pointerId !== pointerId) return
    move.preventDefault()
    const x = originX + (move.clientX - fromClientX) / props.pxPerMm
    const y = originY + (move.clientY - fromClientY) / props.pxPerMm
    documentStore.moveFloat(block.id, clampX(x), clampY(y))
  }
  function stop(up: PointerEvent) {
    if (up.pointerId !== pointerId) return
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', stop)
    handle.removeEventListener('pointercancel', stop)
    try {
      handle.releasePointerCapture(pointerId)
    } catch {
      // Nothing to release if capture never took.
    }
    draggingId.value = null
  }
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', stop)
  handle.addEventListener('pointercancel', stop)
}

// The move grip on the toolbar: a plain press-and-drag, on mouse, touch, or pen alike.
function onGripDown(block: Block, event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  runDrag(block, event.currentTarget as HTMLElement, event.pointerId, event.clientX, event.clientY)
}

// A long press anywhere on the figure body picks it up on touch and pen devices. A press
// that moves right away, or lifts quickly, is left alone so the writer can still tap into a
// cell or scroll the page. A mouse uses the grip instead, so it is skipped here.
let pressTimer: ReturnType<typeof setTimeout> | null = null
let pressStart: { x: number; y: number } | null = null
function clearPress() {
  if (pressTimer) clearTimeout(pressTimer)
  pressTimer = null
  pressStart = null
}
function onFrameDown(block: Block, event: PointerEvent) {
  if (props.mode !== 'write' || event.pointerType === 'mouse') return
  const handle = event.currentTarget as HTMLElement
  const pointerId = event.pointerId
  const startX = event.clientX
  const startY = event.clientY
  pressStart = { x: startX, y: startY }
  pressTimer = setTimeout(() => {
    pressTimer = null
    documentStore.select(block.id)
    runDrag(block, handle, pointerId, startX, startY)
  }, 320)
}
function onFrameMove(event: PointerEvent) {
  if (!pressStart) return
  if (Math.abs(event.clientX - pressStart.x) > 8 || Math.abs(event.clientY - pressStart.y) > 8) clearPress()
}
onBeforeUnmount(clearPress)

function onWidthDown(block: Block, event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  const handle = event.currentTarget as HTMLElement
  const pointerId = event.pointerId
  const startX = event.clientX
  const originW = block.float!.width
  try {
    handle.setPointerCapture(pointerId)
  } catch {
    // best-effort
  }
  function onMove(move: PointerEvent) {
    if (move.pointerId !== pointerId) return
    documentStore.setFloatWidth(block.id, originW + (move.clientX - startX) / props.pxPerMm)
  }
  function stop(up: PointerEvent) {
    if (up.pointerId !== pointerId) return
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', stop)
    handle.removeEventListener('pointercancel', stop)
  }
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', stop)
  handle.addEventListener('pointercancel', stop)
}

function diagramHeightPx(block: Extract<Block, { type: 'diagram' }>): number {
  return block.heightRules * props.metrics.lineHeight * props.pxPerMm
}
</script>

<template>
  <div class="free-figures" :class="{ 'draw-mode': mode === 'draw' }">
    <div
      v-for="block in floating"
      :key="block.id"
      class="figure"
      :class="{ selected: isSelected(block), dragging: draggingId === block.id }"
      :style="frameStyle(block)"
      @pointerdown="onFrameDown(block, $event)"
      @pointermove="onFrameMove"
      @pointerup="clearPress"
      @pointercancel="clearPress"
    >
      <div v-if="mode === 'write'" class="bar">
        <button class="grip" title="Drag to move" @pointerdown="onGripDown(block, $event)">
          <Icon name="dots" :size="15" /> Move
        </button>
        <span class="spacer" />
        <button class="act text" title="Smaller text" @click="documentStore.nudgeFontScale(block.id, -0.1)">A−</button>
        <button class="act text" title="Larger text" @click="documentStore.nudgeFontScale(block.id, 0.1)">A+</button>
        <button class="act" title="Dock into the writing" @click="documentStore.dockFigure(block.id)">
          <Icon name="pageBreak" :size="14" />
        </button>
        <button class="act danger" title="Remove" @click="documentStore.removeBlock(block.id)">
          <Icon name="trash" :size="14" />
        </button>
      </div>

      <TableBlock
        v-if="block.type === 'table'"
        :block="block"
        :width-mm="block.float!.width"
        :row-height-mm="metrics.lineHeight"
        :font-stack="bodyFontStack(handwriting)"
        :ink="handwriting.palette.ink"
        :scale="block.scale ?? 1"
        :editable="mode === 'write'"
        @focus="documentStore.select(block.id)"
      />
      <CalloutsBlock
        v-else-if="block.type === 'callouts'"
        :block="block"
        :font-stack="bodyFontStack(handwriting)"
        :scale="block.scale ?? 1"
        :editable="mode === 'write'"
        @focus="documentStore.select(block.id)"
      />
      <div
        v-else-if="block.type === 'diagram'"
        class="diagram-slot"
        :style="{ height: `${diagramHeightPx(block)}px` }"
        @click="documentStore.select(block.id)"
      >
        <Diagram
          :spec="block.spec"
          :width-mm="block.float!.width"
          :height-mm="block.heightRules * metrics.lineHeight"
          :font-stack="bodyFontStack(handwriting)"
          :seed="hashSeed(block.id)"
          :scale="block.scale ?? 1"
          :editable="mode === 'write'"
          @edit-label="(shapeIndex, text) => documentStore.setDiagramLabel(block.id, shapeIndex, text)"
        />
      </div>

      <button
        v-if="mode === 'write'"
        class="width-grip"
        title="Drag to resize"
        @pointerdown="onWidthDown(block, $event)"
      >
        <span />
      </button>
    </div>
  </div>
</template>

<style scoped>
.free-figures {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.figure {
  position: absolute;
  pointer-events: auto;
  border-radius: 6px;
  /* Stop a touch drag from scrolling the page while a figure is being moved. */
  touch-action: none;
  transition:
    box-shadow 0.12s ease,
    transform 0.08s ease;
}
.free-figures.draw-mode .figure {
  pointer-events: none;
}
/* A highlighted figure shows a soft ring so its move options plainly belong to it. */
.figure.selected {
  box-shadow: 0 0 0 2px var(--accent, #4a72b0);
}
.figure.dragging {
  box-shadow: 0 8px 24px rgba(51, 51, 76, 0.28);
  transform: scale(1.01);
  z-index: 5;
}
.bar {
  position: absolute;
  top: -30px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px;
  opacity: 0;
  transition: opacity 0.12s ease;
}
/* The bar shows whenever the figure is hovered or highlighted, so it is reachable on a
   touch device the moment the figure is tapped, not only under a hovering mouse. */
.figure:hover .bar,
.figure.selected .bar {
  opacity: 1;
}
.spacer {
  flex: 1;
}
.grip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: var(--surface, #fff);
  color: var(--text-soft, #6a6a80);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  border-radius: 7px;
  padding: 5px 9px;
  cursor: grab;
  touch-action: none;
  box-shadow: 0 1px 4px rgba(51, 51, 76, 0.18);
}
.grip:active {
  cursor: grabbing;
}
.act {
  display: inline-flex;
  border: none;
  background: var(--surface, #fff);
  color: var(--text-soft, #6a6a80);
  border-radius: 7px;
  padding: 6px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(51, 51, 76, 0.18);
}
.act.text {
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  padding: 5px 8px;
}
.act:hover {
  color: var(--text, #33334c);
}
.act.danger:hover {
  color: var(--danger, #b73b3a);
}
.diagram-slot {
  width: 100%;
}
.width-grip {
  position: absolute;
  right: -9px;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 18px;
  height: 40px;
  border: none;
  background: transparent;
  cursor: ew-resize;
  touch-action: none;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.figure:hover .width-grip,
.figure.selected .width-grip {
  opacity: 1;
}
.width-grip span {
  width: 4px;
  height: 28px;
  border-radius: 3px;
  background: var(--accent, #4a72b0);
  opacity: 0.6;
}
</style>
