<script setup lang="ts">
// Where the user stores their Anthropic key. It lives only in this browser's local
// database and is sent only to Anthropic. Nothing here ever reaches a server of ours,
// because there is no server.
import { onMounted, ref } from 'vue'
import { loadApiKey, saveApiKey, clearApiKey } from '@/store/persistence'

const emit = defineEmits<{ (e: 'close'): void }>()
const key = ref('')
const saved = ref(false)

onMounted(async () => {
  const existing = await loadApiKey()
  if (existing) {
    key.value = existing
    saved.value = true
  }
})

async function save() {
  if (!key.value.trim()) return
  await saveApiKey(key.value.trim())
  saved.value = true
  emit('close')
}

async function forget() {
  await clearApiKey()
  key.value = ''
  saved.value = false
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="dialog">
      <h2>Anthropic API key</h2>
      <p class="note">
        Stored only in this browser and sent only to Anthropic. There is no backend, so nothing is uploaded to us. Get a
        key from console.anthropic.com.
      </p>
      <input v-model="key" type="password" placeholder="sk-ant-…" spellcheck="false" />
      <div class="actions">
        <button v-if="saved" class="ghost" @click="forget">Forget key</button>
        <span class="spacer" />
        <button class="ghost" @click="emit('close')">Cancel</button>
        <button class="primary" :disabled="!key.trim()" @click="save">Save</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(51, 51, 76, 0.32);
  display: grid;
  place-items: center;
  z-index: 50;
}
.dialog {
  width: min(440px, 92vw);
  background: #fff;
  border-radius: 14px;
  padding: 22px;
  box-shadow: 0 20px 60px rgba(51, 51, 76, 0.3);
}
h2 {
  margin: 0 0 8px;
  font-size: 18px;
  color: #33334c;
}
.note {
  margin: 0 0 14px;
  font-size: 13px;
  color: #6a6a80;
  line-height: 1.5;
}
input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 9px;
  border: 1px solid rgba(51, 51, 76, 0.25);
  font-size: 14px;
}
input:focus {
  outline: none;
  border-color: #4a72b0;
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}
.spacer {
  flex: 1;
}
button {
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid transparent;
}
.ghost {
  background: transparent;
  border-color: rgba(51, 51, 76, 0.2);
  color: #33334c;
}
.primary {
  background: #4a72b0;
  color: #fff;
}
.primary:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
