<script setup lang="ts">
// A small table, the kind used for truth tables. The grid is drawn with the pen engine
// so it looks ruled by hand, and the cells are plain editable text over it. In write mode
// it is fully dynamic: a column or row can be added at either edge, and any column or row
// removed, with small controls that appear on hover, so the table is the writer's to
// shape rather than fixed at the size it was inserted.
import { computed } from 'vue'
import type { Block } from '@/types'
import { rect, line, hashSeed } from '@/diagrams/wobble'
import { useDocument } from '@/store/document'
import Icon from '@/ui/Icon.vue'

const props = withDefaults(
  defineProps<{
    block: Extract<Block, { type: 'table' }>
    widthMm: number
    rowHeightMm: number
    fontStack: string
    ink: string
    editable: boolean
    scale?: number
  }>(),
  { scale: 1 },
)
const emit = defineEmits<{ (e: 'change'): void; (e: 'focus'): void }>()
const documentStore = useDocument()

const cols = computed(() => props.block.header.length)
const bodyRows = computed(() => props.block.rows.length)
const rowCount = computed(() => bodyRows.value + 1)
const heightMm = computed(() => rowCount.value * props.rowHeightMm)
const seed = computed(() => hashSeed(props.block.id))
const stroke = computed(() => Math.max(props.widthMm, heightMm.value) * 0.004)

const grid = computed(() => {
  const w = props.widthMm
  const h = heightMm.value
  const paths: string[] = [rect(1, 1, w - 2, h - 2, seed.value)]
  for (let c = 1; c < cols.value; c++) {
    const x = (w / cols.value) * c
    paths.push(line(x, 1, x, h - 1, seed.value + c * 7))
  }
  for (let r = 1; r < rowCount.value; r++) {
    const y = (h / rowCount.value) * r
    paths.push(line(1, y, w - 1, y, seed.value + r * 13 + 100))
  }
  return paths
})

function editHeader(index: number, event: Event) {
  // eslint-disable-next-line vue/no-mutating-props -- the block is a store-owned reactive cell edited in place
  props.block.header[index] = (event.target as HTMLElement).innerText
  emit('change')
}
function editCell(r: number, c: number, event: Event) {
  // eslint-disable-next-line vue/no-mutating-props -- the block is a store-owned reactive cell edited in place
  props.block.rows[r][c] = (event.target as HTMLElement).innerText
  emit('change')
}
</script>

<template>
  <div class="table" :class="{ editable }">
    <svg class="grid" :viewBox="`0 0 ${widthMm} ${heightMm}`" preserveAspectRatio="none">
      <path
        v-for="(d, i) in grid"
        :key="i"
        :d="d"
        fill="none"
        :stroke="ink"
        :stroke-width="stroke"
        stroke-linejoin="round"
      />
    </svg>
    <div
      class="cells"
      :style="{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rowCount}, 1fr)`,
        fontSize: `${scale}em`,
      }"
    >
      <div
        v-for="(h, c) in block.header"
        :key="`h${c}`"
        class="cell head"
        :contenteditable="editable"
        spellcheck="false"
        :style="{ fontFamily: fontStack, color: ink }"
        @focus="emit('focus')"
        @input="editHeader(c, $event)"
      >
        {{ h }}
      </div>
      <template v-for="(row, r) in block.rows" :key="`r${r}`">
        <div
          v-for="(cell, c) in row"
          :key="`c${r}-${c}`"
          class="cell"
          :contenteditable="editable"
          spellcheck="false"
          :style="{ fontFamily: fontStack, color: ink }"
          @focus="emit('focus')"
          @input="editCell(r, c, $event)"
        >
          {{ cell }}
        </div>
      </template>
    </div>

    <!-- Dynamic controls, aligned by fraction so nothing shifts the grid. -->
    <template v-if="editable">
      <button
        v-for="c in cols"
        :key="`dc${c}`"
        class="ctl del-col"
        :style="{ left: `${((c - 0.5) / cols) * 100}%` }"
        :disabled="cols <= 1"
        title="Delete column"
        @click="documentStore.removeTableColumn(block.id, c - 1)"
      >
        <Icon name="close" :size="11" />
      </button>
      <button
        v-for="r in bodyRows"
        :key="`dr${r}`"
        class="ctl del-row"
        :style="{ top: `${((r + 0.5) / rowCount) * 100}%` }"
        :disabled="bodyRows <= 1"
        title="Delete row"
        @click="documentStore.removeTableRow(block.id, r - 1)"
      >
        <Icon name="close" :size="11" />
      </button>
      <button class="ctl add add-col" title="Add column" @click="documentStore.addTableColumn(block.id)">
        <Icon name="plus" :size="13" />
      </button>
      <button class="ctl add add-row" title="Add row" @click="documentStore.addTableRow(block.id)">
        <Icon name="plus" :size="13" />
      </button>
    </template>
  </div>
</template>

<style scoped>
.table {
  position: relative;
  width: 100%;
}
.grid {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.cells {
  position: relative;
  display: grid;
  width: 100%;
  height: 100%;
}
.cell {
  display: grid;
  place-items: center;
  text-align: center;
  outline: none;
  padding: 2px;
}
.cell.head {
  font-weight: 600;
}
.ctl {
  position: absolute;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: #fff;
  opacity: 0;
  transition:
    opacity 0.12s ease,
    background 0.12s ease;
  z-index: 2;
}
.table.editable:hover .ctl {
  opacity: 1;
}
.del-col,
.del-row {
  width: 17px;
  height: 17px;
  background: var(--text-muted, #9a9aa8);
}
.del-col:hover,
.del-row:hover {
  background: var(--danger, #b73b3a);
}
.del-col {
  top: -21px;
  transform: translateX(-50%);
}
.del-row {
  left: -21px;
  transform: translateY(-50%);
}
.ctl:disabled {
  opacity: 0;
  pointer-events: none;
}
.add {
  width: 20px;
  height: 20px;
  background: var(--accent, #4a72b0);
}
.add:hover {
  filter: brightness(1.1);
}
.add-col {
  right: -24px;
  top: 50%;
  transform: translateY(-50%);
}
.add-row {
  bottom: -24px;
  left: 50%;
  transform: translateX(-50%);
}
</style>
