<script setup lang="ts">
// The AI compose panel. Writing here is free to try, but generating notes calls Claude
// with the writer's own key, so if none is connected it points them to add one. The
// panel rises from the bottom like a native sheet and closes once notes come back.
import { ref } from 'vue'
import type { Attachment } from '@/types'
import { loadApiKey } from '@/store/persistence'
import { useClaude } from './useClaude'
import Attachments from './Attachments.vue'
import Icon from '@/ui/Icon.vue'

const emit = defineEmits<{ (e: 'close'): void; (e: 'needs-key'): void }>()

const instruction = ref('')
const attachments = ref<Attachment[]>([])
const { generating, error, generate } = useClaude()

async function send() {
  if (!instruction.value.trim() || generating.value) return
  if (!(await loadApiKey())) {
    emit('needs-key')
    return
  }
  const ok = await generate(instruction.value.trim(), attachments.value)
  if (ok) {
    instruction.value = ''
    attachments.value = []
    emit('close')
  }
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="sheet">
      <div class="handle" />
      <div class="head">
        <div class="title"><Icon name="wand" :size="18" /> Write with AI</div>
        <button class="x" @click="emit('close')"><Icon name="close" :size="18" /></button>
      </div>
      <p class="hint">
        Describe the notes you want, or attach photos, a PDF, or a video with its transcript. Claude drafts them onto
        new pages using the same tools you have here.
      </p>

      <textarea
        v-model="instruction"
        class="field"
        rows="3"
        placeholder="Take notes on this. Summarise the attached reading. Make a table for..."
        @keydown.enter.exact.prevent="send"
      />
      <Attachments v-model="attachments" />

      <p v-if="error" class="error">{{ error }}</p>

      <div class="row">
        <span class="note">Free to use. Generating needs your Claude API key.</span>
        <button class="send" :disabled="generating || !instruction.trim()" @click="send">
          <Icon name="wand" :size="16" />
          {{ generating ? 'Writing…' : 'Write notes' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(31, 31, 40, 0.36);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 75;
}
.sheet {
  width: min(640px, 100%);
  background: #fff;
  border-radius: 22px 22px 0 0;
  padding: 12px 20px calc(20px + env(safe-area-inset-bottom));
  box-shadow: 0 -14px 50px rgba(31, 31, 40, 0.28);
  animation: rise 0.2s ease;
}
@keyframes rise {
  from {
    transform: translateY(30px);
    opacity: 0.6;
  }
}
.handle {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: rgba(51, 51, 76, 0.18);
  margin: 2px auto 12px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #29297e;
}
.x {
  border: none;
  background: transparent;
  color: #9a9aa8;
  cursor: pointer;
  padding: 4px;
}
.hint {
  margin: 8px 0 12px;
  font-size: 13px;
  color: #6a6a80;
  line-height: 1.5;
}
.field {
  width: 100%;
  resize: none;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(51, 51, 76, 0.18);
  font-family: inherit;
  font-size: 14px;
  color: #33334c;
}
.field:focus {
  outline: none;
  border-color: #4a72b0;
}
.error {
  margin: 8px 0 0;
  color: #b73b3a;
  font-size: 12px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}
.note {
  flex: 1;
  font-size: 12px;
  color: #9a9aa8;
}
.send {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: none;
  border-radius: 11px;
  padding: 11px 18px;
  background: linear-gradient(135deg, #4a72b0, #6a4fa0);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
.send:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
