<script setup lang="ts">
// The first thing a new reader sees, once. It names the three ways to fill a page and the
// two keys that reach everything else, then steps out of the way. The product name is read
// from the brand config so a rename never touches this card.
import { ref } from 'vue'
import { APP_NAME } from '@/brand'
import Icon from './Icon.vue'
import { useFocusTrap } from './useFocusTrap'

const emit = defineEmits<{ (e: 'close'): void }>()

const card = ref<HTMLElement | null>(null)
useFocusTrap(card, () => emit('close'))

const points = [
  {
    icon: 'write',
    title: 'Write by hand',
    body: 'Type anywhere on the ruled page and it comes out in neat handwriting.',
  },
  { icon: 'draw', title: 'Draw freely', body: 'Switch to a pen or pencil to sketch figures right on the sheet.' },
  { icon: 'wand', title: 'Ask an AI', body: 'Connect your own key and let it write, tidy, or diagram a page for you.' },
]
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="card" class="sheet" role="dialog" aria-modal="true" aria-label="Welcome" tabindex="-1">
      <div class="badge"><Icon name="wand" :size="22" /></div>
      <h2 class="head">Welcome to {{ APP_NAME }}</h2>
      <p class="lede">A page that writes in your hand. Three ways to fill it:</p>
      <ul class="points">
        <li v-for="p in points" :key="p.title">
          <span class="pt-glyph"><Icon :name="p.icon" :size="18" /></span>
          <span class="pt-text"
            ><strong>{{ p.title }}.</strong> {{ p.body }}</span
          >
        </li>
      </ul>
      <p class="tip">Press <kbd>⌘K</kbd> for the command bar, or <kbd>?</kbd> for the shortcuts.</p>
      <button class="go" @click="emit('close')">Start writing</button>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  background: rgba(20, 20, 28, 0.4);
  backdrop-filter: blur(3px);
}
.sheet {
  width: min(440px, 100%);
  background: var(--surface, #fff);
  color: var(--ink, #23232e);
  border-radius: 16px;
  box-shadow: var(--pop-shadow, 0 18px 50px rgba(0, 0, 0, 0.3));
  padding: 24px 24px 22px;
  text-align: center;
}
.badge {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  margin: 0 auto 12px;
  border-radius: 50%;
  background: var(--accent-grad, linear-gradient(135deg, #4a72b0, #7e3f8a));
  color: #fff;
}
.head {
  margin: 0 0 4px;
  font-size: 19px;
  font-weight: 700;
}
.lede {
  margin: 0 0 16px;
  opacity: 0.7;
  font-size: 14px;
}
.points {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.points li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.pt-glyph {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--accent-wash-2, rgba(74, 114, 176, 0.14));
  color: var(--accent, #4a72b0);
}
.pt-text {
  font-size: 14px;
  line-height: 1.4;
}
.tip {
  margin: 0 0 18px;
  font-size: 13px;
  opacity: 0.7;
}
kbd {
  font: inherit;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--accent-wash-2, rgba(74, 114, 176, 0.14));
}
.go {
  width: 100%;
  border: none;
  border-radius: 11px;
  padding: 12px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  background: var(--accent-grad, linear-gradient(135deg, #4a72b0, #7e3f8a));
}
</style>
