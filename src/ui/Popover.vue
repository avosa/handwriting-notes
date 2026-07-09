<script setup lang="ts">
// A small floating panel anchored to a trigger. On a wide screen it opens beside the
// trigger; on a narrow screen it rises from the bottom as a sheet, the way a native
// app behaves. Clicking outside or pressing Escape closes it.
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{ align?: 'left' | 'right' | 'center' }>(), { align: 'left' })
const open = ref(false)
const root = ref<HTMLElement | null>(null)

function toggle() {
  open.value = !open.value
}
function close() {
  open.value = false
}
function onDocClick(event: MouseEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) close()
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}
// A menu closes once one of its items is chosen; other panels stay open.
function onPanelClick(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('.menu-item')) close()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick)
  document.removeEventListener('keydown', onKey)
})

defineExpose({ close })
</script>

<template>
  <div ref="root" class="popover-root">
    <div class="trigger" @click="toggle">
      <slot name="trigger" :open="open" />
    </div>
    <Transition name="pop">
      <div v-if="open" class="panel" :class="[`align-${props.align}`]" @click="onPanelClick">
        <slot :close="close" />
      </div>
    </Transition>
    <Transition name="fade">
      <div v-if="open" class="scrim" @click="close" />
    </Transition>
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
.scrim {
  display: none;
}
.panel {
  position: absolute;
  top: calc(100% + 8px);
  z-index: 60;
  background: #fff;
  border-radius: 14px;
  box-shadow:
    0 12px 40px rgba(51, 51, 76, 0.22),
    0 0 0 1px rgba(51, 51, 76, 0.06);
  overflow: hidden;
}
.align-left {
  left: 0;
}
.align-right {
  right: 0;
}
.align-center {
  left: 50%;
  transform: translateX(-50%);
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
.align-center.pop-enter-from,
.align-center.pop-leave-to {
  transform: translateX(-50%) translateY(-6px) scale(0.98);
}

@media (max-width: 640px) {
  .scrim {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(31, 31, 40, 0.35);
    z-index: 59;
  }
  .panel {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    transform: none;
    border-radius: 20px 20px 0 0;
    padding-bottom: env(safe-area-inset-bottom);
    max-height: 80vh;
    overflow-y: auto;
  }
  .pop-enter-from,
  .pop-leave-to {
    transform: translateY(100%);
  }
  .align-center.pop-enter-from,
  .align-center.pop-leave-to {
    transform: translateY(100%);
  }
}
</style>
