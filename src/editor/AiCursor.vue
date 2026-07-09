<script setup lang="ts">
// A ghost cursor that stands in for the AI's hand while it writes. It rests in the margin
// beside the line being typed, then glides up to the real toolbar and presses a control
// before the AI uses it, so choosing a heading or opening the insert menu is seen happening
// the way a person would do it. It only shows during a run and never takes the pointer.
import { ref, computed, watch, nextTick } from 'vue'
import { useDocument } from '@/store/document'

const store = useDocument()
const x = ref(0)
const y = ref(0)
const visible = ref(false)
const clicking = ref(false)
// Holding the eraser: the cursor swaps to a rubber and stays on the line it is rubbing out.
const erasing = computed(() => store.aiTool === 'eraser')

// Role controls all live under one pill; inserts under another. The eraser and everything
// else rest by the line being worked on, so the cursor always has somewhere sensible to be.
const ROLE_TOOLS = new Set(['title', 'subtitle', 'heading', 'subheading', 'caption', 'body'])
function selectorFor(tool: string): string {
  return ROLE_TOOLS.has(tool) ? '[data-ai-tool="role"]' : '[data-ai-tool="insert"]'
}

function moveToSelector(selector: string) {
  nextTick(() =>
    requestAnimationFrame(() => {
      const el = document.querySelector(selector)
      if (!el) return
      const r = el.getBoundingClientRect()
      x.value = r.left + r.width / 2
      y.value = r.top + r.height / 2
      visible.value = true
    }),
  )
}

// Rest in the left margin next to the line the AI is writing, so it reads as a hand working
// on that line rather than chasing each character.
function restByWriting() {
  const id = store.writingBlockId
  if (!id) return
  nextTick(() =>
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-block-id="${CSS.escape(id)}"]`)
      if (!el) return
      const r = el.getBoundingClientRect()
      x.value = r.left - 16
      y.value = r.top + r.height / 2
      visible.value = true
    }),
  )
}

let clickTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => store.aiTool,
  (tool) => {
    // The eraser stays on the line it is rubbing out; a dock tool is glided to and pressed.
    if (tool && tool !== 'eraser') {
      moveToSelector(selectorFor(tool))
      clicking.value = false
      requestAnimationFrame(() => {
        clicking.value = true
        if (clickTimer) clearTimeout(clickTimer)
        clickTimer = setTimeout(() => (clicking.value = false), 440)
      })
    } else {
      restByWriting()
    }
  },
)

watch(
  () => store.writingBlockId,
  () => {
    if (!store.aiTool) restByWriting()
  },
)

watch(
  () => store.generating,
  (on) => {
    visible.value = on
    if (!on) clicking.value = false
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="ghost-fade">
      <div v-if="visible" class="ai-cursor" :class="{ erasing }" :style="{ transform: `translate(${x}px, ${y}px)` }">
        <span class="ripple" :class="{ on: clicking }" />
        <svg v-if="erasing" viewBox="0 0 24 24" width="27" height="27" aria-hidden="true">
          <rect
            x="2.5"
            y="12"
            width="15"
            height="8"
            rx="1.6"
            transform="rotate(-42 10 16)"
            fill="#f4b8c4"
            stroke="#33334c"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          <path
            d="M4 2 L4 20 L9 15 L12.5 22 L15 21 L11.5 14 L18 14 Z"
            fill="#33334c"
            stroke="#fff"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ai-cursor {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 90;
  pointer-events: none;
  /* The glide between the writing line and the toolbar, eased so it feels like a hand moving. */
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  filter: drop-shadow(0 3px 6px rgba(51, 51, 76, 0.35));
  margin: -3px 0 0 -3px;
}
.ripple {
  position: absolute;
  left: 4px;
  top: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: var(--accent, #4a72b0);
  opacity: 0;
}
/* While the eraser is out it rubs back and forth, the way a hand works a rubber. */
.ai-cursor.erasing svg {
  animation: rub 0.26s ease-in-out infinite;
}
@keyframes rub {
  0%,
  100% {
    transform: translateX(-1px);
  }
  50% {
    transform: translateX(3px);
  }
}
.ripple.on {
  animation: ai-ripple 0.44s ease-out;
}
@keyframes ai-ripple {
  0% {
    opacity: 0.5;
    transform: translate(-50%, -50%) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(6);
  }
}
.ghost-fade-enter-active,
.ghost-fade-leave-active {
  transition: opacity 0.2s ease;
}
.ghost-fade-enter-from,
.ghost-fade-leave-to {
  opacity: 0;
}
</style>
