<script setup lang="ts">
// A small table, the kind used for truth tables. The grid is drawn with the pen
// engine so it looks ruled by hand, and the cells are plain editable text over it.
import { computed } from 'vue'
import type { Block } from '@/types'
import { rect, line, hashSeed } from '@/diagrams/wobble'

const props = defineProps<{
  block: Extract<Block, { type: 'table' }>
  widthMm: number
  rowHeightMm: number
  fontStack: string
  ink: string
  editable: boolean
}>()
const emit = defineEmits<{ (e: 'change'): void; (e: 'focus'): void }>()

const cols = computed(() => props.block.header.length)
const rowCount = computed(() => props.block.rows.length + 1)
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
  <div class="table" :style="{ height: `${heightMm * (widthMm ? 1 : 1)}mm` }">
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
      :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rowCount}, 1fr)` }"
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
</style>
