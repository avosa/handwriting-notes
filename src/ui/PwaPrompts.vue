<script setup lang="ts">
// Two quiet, non-blocking prompts at the corner of the screen: an offer to install the app to
// the home screen when the browser allows it, and a note that a newer version is ready to load.
// Both are easy to dismiss and never interrupt writing.
import { usePwa } from '@/compose/usePwa'
import Icon from './Icon.vue'

const { canInstall, updateReady, install, dismissInstall, reload } = usePwa()
</script>

<template>
  <div class="pwa-wrap">
    <Transition name="pwa">
      <div v-if="updateReady" class="toast update">
        <Icon name="download" :size="16" />
        <span>A new version is ready.</span>
        <button class="act" @click="reload">Reload</button>
      </div>
    </Transition>

    <Transition name="pwa">
      <div v-if="canInstall && !updateReady" class="toast install">
        <Icon name="device" :size="16" />
        <span>Install this app for offline use.</span>
        <button class="act" @click="install">Install</button>
        <button class="dismiss" title="Not now" @click="dismissInstall"><Icon name="close" :size="14" /></button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.pwa-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 95;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0 12px calc(14px + env(safe-area-inset-bottom));
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(440px, calc(100vw - 24px));
  padding: 10px 12px 10px 14px;
  border-radius: 12px;
  background: #23232e;
  color: #f4f4f8;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  font-size: 14px;
}
.toast span {
  flex: 1;
}
.act {
  border: none;
  border-radius: 8px;
  padding: 7px 12px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  background: linear-gradient(135deg, #4a72b0, #7e3f8a);
}
.act:hover {
  filter: brightness(1.08);
}
.dismiss {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  padding: 4px;
  border-radius: 7px;
}
.dismiss:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}
.pwa-enter-active,
.pwa-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.pwa-enter-from,
.pwa-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
