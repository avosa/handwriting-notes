<script setup lang="ts">
// The floating badge shown while Claude writes onto the page. A soft pulsing dot and
// the word Writing signal it is happening live, and Stop ends it at once. It sits above
// the dock so it is visible without covering the paper.
import Icon from '@/ui/Icon.vue'

defineProps<{ label?: string }>()
const emit = defineEmits<{ (e: 'stop'): void }>()
</script>

<template>
  <div class="live">
    <span class="orb"><span class="pulse" /><Icon name="wand" :size="15" /></span>
    <span class="text"
      >{{ label ?? 'Claude is writing' }}<span class="dots"><i /><i /><i /></span
    ></span>
    <button class="stop" @click="emit('stop')">Stop</button>
  </div>
</template>

<style scoped>
.live {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 8px 8px;
  /* An intentionally dark glass pill in both themes so it floats over bright paper. */
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
  animation: pulse 1.4s ease-out infinite;
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
  animation: blink 1.2s infinite;
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
.stop {
  border: none;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.stop:hover {
  background: rgba(255, 255, 255, 0.26);
}

@media (max-width: 720px) {
  .stop {
    padding: 8px 16px;
    font-size: 14px;
  }
}
</style>
