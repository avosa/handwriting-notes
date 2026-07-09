<script setup lang="ts">
// A small floating panel anchored to a trigger. The panel is teleported to the body so
// it is never clipped by a scrolling toolbar or an overflow-hidden card — it floats
// above everything and is positioned with fixed coordinates measured from the trigger.
// On a wide screen it opens beside the trigger, flipping above when there is no room
// below; on a narrow screen it rises from the bottom as a native-style sheet. Clicking
// outside or pressing Escape closes it.
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{ align?: 'left' | 'right' | 'center' }>(), { align: 'left' })
const open = ref(false)
const mobile = ref(false)
const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const style = ref<Record<string, string>>({})

function isMobile(): boolean {
  return window.matchMedia('(max-width: 640px)').matches
}

// Measure the trigger and place the panel with fixed coordinates. On a phone the CSS
// sheet layout takes over, so no inline coordinates are set.
async function place() {
  mobile.value = isMobile()
  if (mobile.value) {
    style.value = {}
    return
  }
  await nextTick()
  const trigger = root.value?.getBoundingClientRect()
  const el = panel.value
  if (!trigger || !el) return
  const h = el.offsetHeight
  const w = el.offsetWidth
  const gap = 8
  const vw = window.innerWidth
  const vh = window.innerHeight
  // Flip above when the panel would run past the bottom but there is room above.
  const above = trigger.bottom + h + 16 > vh && trigger.top - h - 16 > 0
  const s: Record<string, string> = { position: 'fixed' }
  if (above) s.bottom = `${Math.round(vh - trigger.top + gap)}px`
  else s.top = `${Math.round(trigger.bottom + gap)}px`

  if (props.align === 'right') {
    s.right = `${Math.round(Math.max(8, vw - trigger.right))}px`
  } else if (props.align === 'center') {
    const cx = Math.min(Math.max(trigger.left + trigger.width / 2, w / 2 + 8), vw - w / 2 - 8)
    s.left = `${Math.round(cx - w / 2)}px`
  } else {
    s.left = `${Math.round(Math.min(trigger.left, vw - w - 8))}px`
  }
  style.value = s
}

async function toggle() {
  open.value = !open.value
  if (!open.value) return
  await nextTick()
  await place()
}
function close() {
  open.value = false
}
function onDocPointer(event: MouseEvent) {
  const target = event.target as Node
  if (open.value && !root.value?.contains(target) && !panel.value?.contains(target)) close()
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}
// A menu closes once one of its items is chosen; other panels stay open.
function onPanelClick(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('.menu-item')) close()
}
function onReflow() {
  if (open.value) void place()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocPointer)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', onReflow)
  window.addEventListener('scroll', onReflow, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocPointer)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onReflow)
  window.removeEventListener('scroll', onReflow, true)
})

defineExpose({ close })
</script>

<template>
  <div ref="root" class="popover-root">
    <div class="trigger" @click="toggle">
      <slot name="trigger" :open="open" />
    </div>
    <Teleport to="body">
      <Transition name="pop">
        <div
          v-if="open"
          ref="panel"
          class="panel"
          :class="{ mobile }"
          :style="style"
          @click="onPanelClick"
          @mousedown.stop
        >
          <slot :close="close" />
        </div>
      </Transition>
      <Transition name="fade">
        <div v-if="open && mobile" class="scrim" @click="close" />
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.popover-root {
  position: relative;
  display: inline-flex;
}
.trigger {
  display: inline-flex;
}
.panel {
  position: fixed;
  z-index: 80;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--pop-shadow);
  overflow: hidden;
}
.pop-enter-active,
.pop-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

.scrim {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  z-index: 79;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .panel.mobile {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    border-radius: 20px 20px 0 0;
    padding-bottom: env(safe-area-inset-bottom);
    max-height: 82vh;
    overflow-y: auto;
  }
  .panel.mobile.pop-enter-from,
  .panel.mobile.pop-leave-to {
    opacity: 1;
    transform: translateY(100%);
  }
}
</style>
