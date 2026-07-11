<script setup lang="ts">
// The mobile menu. On a phone the top bar keeps only the logo and the AI pen; everything
// else lives here, sliding in from the left as the page eases aside. Actions read as
// tappable rows, the appearance switch and handwriting sit together under Settings, and
// the primary "Write with AI" rests at the foot within thumb's reach.
import Icon from '@/ui/Icon.vue'
import BrandLogo from '@/ui/BrandLogo.vue'
import ThemeSwitch from '@/ui/ThemeSwitch.vue'
import HandwritingPicker from '@/tools/HandwritingPicker.vue'
import { APP_NAME } from '@/brand'

defineProps<{ exporting: 'pdf' | 'docx' | null }>()
const emit = defineEmits<{
  (e: 'home'): void
  (e: 'new'): void
  (e: 'save-pdf'): void
  (e: 'save-docx'): void
  (e: 'api-key'): void
  (e: 'compose'): void
  (e: 'chat'): void
  (e: 'map'): void
  (e: 'close'): void
}>()
</script>

<template>
  <nav class="drawer-nav">
    <header class="brand-row">
      <BrandLogo :size="34" />
      <span class="wordmark">{{ APP_NAME }}</span>
    </header>

    <div class="scroll">
      <button class="item" @click="emit('home')"><Icon name="grid" :size="20" /><span>All notes</span></button>
      <button class="item" @click="emit('new')"><Icon name="plus" :size="20" /><span>New note</span></button>

      <div class="section">AI</div>
      <button class="item" @click="emit('chat')">
        <Icon name="aiChat" :size="20" /><span>Chat with your notes</span>
      </button>
      <button class="item" @click="emit('map')"><Icon name="diagram" :size="20" /><span>Note map</span></button>

      <div class="section">Export</div>
      <button class="item" :disabled="exporting !== null" @click="emit('save-pdf')">
        <Icon name="file" :size="20" /><span>{{ exporting === 'pdf' ? 'Saving…' : 'Save as PDF' }}</span>
      </button>
      <button class="item" :disabled="exporting !== null" @click="emit('save-docx')">
        <Icon name="file" :size="20" /><span>{{ exporting === 'docx' ? 'Saving…' : 'Save as Word' }}</span>
      </button>

      <div class="section">Settings</div>
      <div class="field">
        <span class="field-label">Handwriting</span>
        <HandwritingPicker />
      </div>
      <div class="field">
        <span class="field-label">Appearance</span>
        <ThemeSwitch />
      </div>
      <button class="item" @click="emit('api-key')"><Icon name="key" :size="20" /><span>Claude API key</span></button>
    </div>

    <button class="compose" @click="emit('compose')"><Icon name="wand" :size="19" /><span>Write with AI</span></button>
  </nav>
</template>

<style scoped>
.drawer-nav {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: max(14px, env(safe-area-inset-top)) 14px calc(14px + env(safe-area-inset-bottom));
  background: var(--surface);
}
.brand-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 14px;
}
.wordmark {
  font-weight: 800;
  font-size: 18px;
  color: var(--brand);
}
.scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0 -2px;
  padding: 0 2px;
}
.item {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  border: none;
  background: transparent;
  border-radius: 13px;
  padding: 13px 13px;
  cursor: pointer;
  color: var(--text);
  font-size: 15px;
  font-weight: 500;
  text-align: left;
}
.item:active {
  background: var(--accent-wash-2);
}
.item:hover {
  background: var(--accent-wash);
}
.item:disabled {
  opacity: 0.4;
}
.pair {
  display: flex;
  gap: 6px;
}
.half {
  flex: 1;
  justify-content: center;
  gap: 8px;
}
.section {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: 14px 12px 5px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 8px 10px 10px;
}
.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-soft);
}
.field :deep(.trigger) {
  width: 100%;
  justify-content: flex-start;
}
.compose {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  margin-top: 10px;
  border: none;
  border-radius: 14px;
  padding: 15px;
  cursor: pointer;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  background: var(--accent-grad);
  box-shadow: 0 6px 18px var(--accent-shadow);
}
</style>
