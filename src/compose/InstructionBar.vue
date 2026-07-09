<script setup lang="ts">
// The compose bar: write an instruction, attach files, and send them to Claude to be
// turned into handwritten pages. Shows progress and any error inline, and clears the
// instruction once notes come back.
import { ref } from 'vue'
import type { Attachment } from '@/types'
import { useClaude } from './useClaude'
import Attachments from './Attachments.vue'

const instruction = ref('')
const attachments = ref<Attachment[]>([])
const { generating, error, generate } = useClaude()

async function send() {
  if (!instruction.value.trim() || generating.value) return
  const ok = await generate(instruction.value.trim(), attachments.value)
  if (ok) {
    instruction.value = ''
    attachments.value = []
  }
}
</script>

<template>
  <div class="compose">
    <Attachments v-model="attachments" />
    <div class="row">
      <textarea
        v-model="instruction"
        class="field"
        rows="1"
        placeholder="Ask for notes: take notes on this, summarise, make a Venn diagram of X…"
        @keydown.enter.exact.prevent="send"
      />
      <button class="send" :disabled="generating || !instruction.trim()" @click="send">
        {{ generating ? 'Writing…' : 'Write notes' }}
      </button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.compose {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.field {
  flex: 1;
  resize: none;
  min-height: 40px;
  max-height: 140px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(51, 51, 76, 0.2);
  font-family: inherit;
  font-size: 14px;
  color: #33334c;
}
.field:focus {
  outline: none;
  border-color: #4a72b0;
}
.send {
  padding: 10px 16px;
  border: none;
  border-radius: 10px;
  background: #4a72b0;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}
.send:disabled {
  opacity: 0.5;
  cursor: default;
}
.error {
  margin: 0;
  color: #b73b3a;
  font-size: 12px;
}
</style>
