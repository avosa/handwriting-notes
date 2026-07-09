<script setup lang="ts">
// Choose the hand the notes are written in. Each option previews itself in its own
// font so the writer picks by how it looks, and the choice applies everywhere at once.
import { useSettings } from '@/store/settings'
import { handwritingList, bodyFontStack, getHandwriting } from '@/handwriting/registry'
import Icon from '@/ui/Icon.vue'
import Popover from '@/ui/Popover.vue'

const settings = useSettings()
</script>

<template>
  <Popover align="right">
    <template #trigger>
      <button class="trigger" title="Handwriting">
        <Icon name="handwriting" :size="18" />
        <span class="name" :style="{ fontFamily: bodyFontStack(getHandwriting(settings.activeHandwritingId)) }">
          {{ getHandwriting(settings.activeHandwritingId).name }}
        </span>
        <Icon name="chevronDown" :size="14" />
      </button>
    </template>
    <template #default>
      <div class="menu">
        <div class="menu-label">Handwriting</div>
        <button
          v-for="h in handwritingList"
          :key="h.id"
          class="option"
          :class="{ on: settings.activeHandwritingId === h.id }"
          @click="settings.selectHandwriting(h.id)"
        >
          <div class="meta">
            <span class="label">{{ h.name }}</span>
            <Icon v-if="settings.activeHandwritingId === h.id" name="check" :size="16" />
          </div>
          <span class="sample" :style="{ fontFamily: bodyFontStack(h) }">The quick brown fox jumps</span>
        </button>
      </div>
    </template>
  </Popover>
</template>

<style scoped>
.trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 10px;
  padding: 7px 11px;
  cursor: pointer;
  color: var(--text);
}
.trigger:hover {
  background: var(--accent-wash);
}
.name {
  font-size: 15px;
}
.menu {
  padding: 8px;
  min-width: 250px;
}
.menu-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: 4px 8px 6px;
}
.option {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  border: none;
  background: transparent;
  border-radius: 11px;
  padding: 9px 10px;
  cursor: pointer;
  text-align: left;
}
.option:hover {
  background: var(--accent-wash);
}
.option.on {
  background: var(--accent-wash-2);
}
.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text);
}
.label {
  font-size: 13px;
  font-weight: 600;
}
.sample {
  font-size: 21px;
  color: var(--text-soft);
  line-height: 1.2;
}
</style>
