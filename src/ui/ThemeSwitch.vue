<script setup lang="ts">
// A three-way appearance control: follow the system, or pin light or dark. The choice
// applies instantly and is remembered with the writer's other settings.
import type { ThemeChoice } from '@/types'
import { useSettings } from '@/store/settings'
import Icon from '@/ui/Icon.vue'

const settings = useSettings()
const options: { value: ThemeChoice; label: string; icon: string }[] = [
  { value: 'system', label: 'System', icon: 'device' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
]
</script>

<template>
  <div class="theme-switch" role="radiogroup" aria-label="Appearance">
    <button
      v-for="o in options"
      :key="o.value"
      class="seg"
      :class="{ on: settings.theme === o.value }"
      role="radio"
      :aria-checked="settings.theme === o.value"
      @click="settings.setTheme(o.value)"
    >
      <Icon :name="o.icon" :size="16" />
      <span>{{ o.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.theme-switch {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 12px;
  background: var(--surface-sunken);
}
.seg {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  background: transparent;
  border-radius: 9px;
  padding: 8px 6px;
  cursor: pointer;
  color: var(--text-soft);
  font-size: 13px;
  font-weight: 500;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.seg:hover {
  color: var(--text);
}
.seg.on {
  background: var(--surface);
  color: var(--accent);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
</style>
