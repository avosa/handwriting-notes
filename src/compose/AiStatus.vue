<script setup lang="ts">
// The status the AI shows while it works. First it thinks, naming the provider and cycling
// through what it is doing the way a person mulls something over; then, the moment it puts
// words on the page, it says so once and clears away so nothing covers the writing. It never
// carries the stop control: that lives on the top bar so it is reachable the whole time.
import { ref, watch, onBeforeUnmount } from 'vue'
import Icon from '@/ui/Icon.vue'

const props = defineProps<{ phase: 'thinking' | 'writing' | null; name: string }>()

// What the AI is busy with while it thinks, shown one at a time so the wait feels alive.
const THOUGHTS = [
  'thinking',
  'planning the notes',
  'gathering the ideas',
  'sketching an outline',
  'organising it',
  'composing',
  'shaping the page',
  'considering the layout',
]

const visible = ref(false)
const word = ref(THOUGHTS[0])
let cycle: ReturnType<typeof setInterval> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined
let step = 0

function clearTimers() {
  if (cycle) clearInterval(cycle)
  if (hideTimer) clearTimeout(hideTimer)
  cycle = undefined
  hideTimer = undefined
}

watch(
  () => props.phase,
  (phase) => {
    clearTimers()
    if (phase === 'thinking') {
      step = 0
      word.value = THOUGHTS[0]
      visible.value = true
      cycle = setInterval(() => {
        step = (step + 1) % THOUGHTS.length
        word.value = THOUGHTS[step]
      }, 900)
    } else if (phase === 'writing') {
      word.value = 'writing'
      visible.value = true
      // Announce the writing, then step aside quickly so the paper is clear to watch.
      hideTimer = setTimeout(() => (visible.value = false), 650)
    } else {
      visible.value = false
    }
  },
)

onBeforeUnmount(clearTimers)
</script>

<template>
  <Transition name="status-fade">
    <div v-if="visible" class="status" :class="{ writing: phase === 'writing' }">
      <span class="orb"><span class="pulse" /><Icon name="wand" :size="15" /></span>
      <span class="text"
        >{{ name }} is {{ word }}<span class="dots"><i /><i /><i /></span
      ></span>
    </div>
  </Transition>
</template>

<style scoped>
.status {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px 8px 8px;
  background: rgba(31, 31, 40, 0.92);
  backdrop-filter: blur(10px);
  border-radius: 999px;
  box-shadow: var(--pop-shadow);
  color: #fff;
  max-width: min(92vw, 420px);
}
.orb {
  position: relative;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--accent-grad);
  color: #fff;
  flex-shrink: 0;
}
.pulse {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--accent-grad);
  animation: pulse 1s ease-out infinite;
}
@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 0.6;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}
.text {
  font-size: 14px;
  font-weight: 500;
  display: inline-flex;
  align-items: baseline;
  white-space: nowrap;
}
.dots {
  display: inline-flex;
  margin-left: 1px;
}
.dots i {
  width: 3px;
  height: 3px;
  margin-left: 2px;
  border-radius: 50%;
  background: #fff;
  opacity: 0.4;
  animation: blink 0.9s infinite;
}
.dots i:nth-child(2) {
  animation-delay: 0.2s;
}
.dots i:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes blink {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 1;
  }
}
/* Rises in when it appears and lifts away when it clears, so it feels like it steps aside. */
.status-fade-enter-active,
.status-fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.status-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.status-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
