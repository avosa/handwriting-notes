<script setup lang="ts">
// A map of the whole library's links: each note that takes part in a link is a dot, each
// [[link]] a line between two dots. Positions come from a small force layout run once when the
// map opens, so connected notes settle near each other. Clicking a dot opens that note.
import { onMounted, ref } from 'vue'
import { useDocument } from '@/store/document'
import { useLibrary } from '@/store/library'
import { buildLinkIndex, useLinkGraph, type GraphEdge, type GraphNode } from '@/home/linkGraph'
import Icon from './Icon.vue'
import { useFocusTrap } from './useFocusTrap'

const emit = defineEmits<{ (e: 'close'): void; (e: 'open', id: string): void }>()
const documentStore = useDocument()
const library = useLibrary()
const { graph } = useLinkGraph()

const card = ref<HTMLElement | null>(null)
useFocusTrap(card, () => emit('close'))

const WIDTH = 1000
const HEIGHT = 700
const PAD = 60

interface Placed extends GraphNode {
  x: number
  y: number
}
const nodes = ref<Placed[]>([])
const edges = ref<GraphEdge[]>([])
const ready = ref(false)

// A tiny force-directed layout: nodes push each other apart, links pull their ends together,
// and everything is gently drawn to the centre. Seeded on a circle so the result is stable and
// needs no randomness. After a fixed number of cooling steps the positions are scaled to fit.
function layout(gnodes: GraphNode[], gedges: GraphEdge[]): Placed[] {
  const n = gnodes.length
  if (!n) return []
  const area = WIDTH * HEIGHT
  const k = Math.sqrt(area / n) // ideal distance between nodes
  const pos = gnodes.map((node, i) => ({
    ...node,
    x: WIDTH / 2 + Math.cos((i / n) * 2 * Math.PI) * (WIDTH / 3),
    y: HEIGHT / 2 + Math.sin((i / n) * 2 * Math.PI) * (HEIGHT / 3),
  }))
  const idx = new Map(pos.map((p, i) => [p.id, i]))
  let temp = WIDTH / 8
  const STEPS = 250
  for (let step = 0; step < STEPS; step++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }))
    // Repulsion between every pair.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x
        let dy = pos[i].y - pos[j].y
        let dist = Math.hypot(dx, dy) || 0.01
        // Nudge exactly-overlapping nodes apart along a fixed axis, again to stay deterministic.
        if (dist < 0.02) {
          dx = 0.01
          dy = 0
          dist = 0.01
        }
        const force = (k * k) / dist
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        disp[i].x += fx
        disp[i].y += fy
        disp[j].x -= fx
        disp[j].y -= fy
      }
    }
    // Attraction along edges.
    for (const e of gedges) {
      const a = idx.get(e.from)
      const b = idx.get(e.to)
      if (a === undefined || b === undefined) continue
      const dx = pos[a].x - pos[b].x
      const dy = pos[a].y - pos[b].y
      const dist = Math.hypot(dx, dy) || 0.01
      const force = (dist * dist) / k
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      disp[a].x -= fx
      disp[a].y -= fy
      disp[b].x += fx
      disp[b].y += fy
    }
    for (let i = 0; i < n; i++) {
      // Pull weakly toward the centre so lone nodes do not drift off.
      disp[i].x += (WIDTH / 2 - pos[i].x) * 0.01
      disp[i].y += (HEIGHT / 2 - pos[i].y) * 0.01
      const d = Math.hypot(disp[i].x, disp[i].y) || 0.01
      pos[i].x += (disp[i].x / d) * Math.min(d, temp)
      pos[i].y += (disp[i].y / d) * Math.min(d, temp)
    }
    temp = Math.max(temp * 0.97, 1)
  }
  // Scale the settled cloud to fill the frame with a margin.
  const xs = pos.map((p) => p.x)
  const ys = pos.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const sx = (WIDTH - 2 * PAD) / Math.max(maxX - minX, 1)
  const sy = (HEIGHT - 2 * PAD) / Math.max(maxY - minY, 1)
  const s = Math.min(sx, sy)
  return pos.map((p) => ({ ...p, x: PAD + (p.x - minX) * s, y: PAD + (p.y - minY) * s }))
}

onMounted(async () => {
  const liveIds = new Set(library.recent.map((e) => e.id))
  liveIds.add(documentStore.doc.id)
  await buildLinkIndex(liveIds)
  const g = graph()
  edges.value = g.edges
  nodes.value = layout(g.nodes, g.edges)
  ready.value = true
})

function labelFor(n: Placed): string {
  const t = n.title || 'Untitled'
  return t.length > 22 ? `${t.slice(0, 21)}…` : t
}
function nodeAt(id: string): Placed | undefined {
  return nodes.value.find((n) => n.id === id)
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="card" class="frame" role="dialog" aria-modal="true" aria-label="Note map" tabindex="-1">
      <header class="head">
        <h2>Note map</h2>
        <button class="close" title="Close" @click="emit('close')"><Icon name="close" :size="18" /></button>
      </header>

      <div class="canvas">
        <svg v-if="ready && nodes.length" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="xMidYMid meet">
          <line
            v-for="(e, i) in edges"
            :key="i"
            class="edge"
            :x1="nodeAt(e.from)?.x"
            :y1="nodeAt(e.from)?.y"
            :x2="nodeAt(e.to)?.x"
            :y2="nodeAt(e.to)?.y"
          />
          <g
            v-for="n in nodes"
            :key="n.id"
            class="node"
            :class="{ current: n.id === documentStore.doc.id }"
            @click="emit('open', n.id)"
          >
            <circle :cx="n.x" :cy="n.y" r="9" />
            <text :x="n.x" :y="n.y - 14" text-anchor="middle">{{ labelFor(n) }}</text>
          </g>
        </svg>
        <div v-else-if="ready" class="empty">
          <Icon name="diagram" :size="30" />
          <p>No links yet. Type a note's title in double brackets, like [[Another note]], to connect two notes.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 92;
  display: grid;
  place-items: center;
  padding: 3vh 2vw;
  background: rgba(20, 20, 28, 0.4);
  backdrop-filter: blur(3px);
}
.frame {
  width: min(1100px, 96vw);
  height: min(88vh, 820px);
  background: var(--surface, #fff);
  color: var(--ink, #23232e);
  border-radius: 16px;
  box-shadow: var(--pop-shadow, 0 24px 60px rgba(0, 0, 0, 0.35));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle);
}
.head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.close {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 5px;
  border-radius: 8px;
}
.close:hover {
  background: var(--surface-sunken);
  color: var(--text);
}
.canvas {
  flex: 1;
  min-height: 0;
  display: flex;
}
svg {
  width: 100%;
  height: 100%;
}
.edge {
  stroke: var(--border, #cfcfe0);
  stroke-width: 1.5;
}
.node {
  cursor: pointer;
}
.node circle {
  fill: var(--accent, #4a72b0);
  stroke: var(--surface, #fff);
  stroke-width: 2;
  transition: r 0.1s ease;
}
.node:hover circle {
  fill: var(--brand, #33334c);
}
.node.current circle {
  fill: #e8b22c;
}
.node text {
  fill: var(--text, #33334c);
  font-size: 15px;
  font-family: inherit;
  pointer-events: none;
}
.empty {
  margin: auto;
  max-width: 340px;
  text-align: center;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
}
.empty p {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}
</style>
