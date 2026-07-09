<script setup lang="ts">
// Where a writer connects their own Claude key so the AI can draft notes. The key is
// stored only in this browser and sent only to Anthropic. The dialog explains why the
// key is needed, walks through getting one, and links straight to the page for it, so
// a first-timer is never stuck.
import { onMounted, ref } from 'vue'
import { loadApiKey, saveApiKey, clearApiKey } from '@/store/persistence'
import Icon from './Icon.vue'

const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>()
const key = ref('')
const saved = ref(false)
const show = ref(false)

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
  emit('saved')
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
    <div class="sheet">
      <button class="x" title="Close" @click="emit('close')"><Icon name="close" :size="18" /></button>

      <div class="head">
        <div class="badge"><Icon name="wand" :size="22" /></div>
        <h2>Write notes with AI</h2>
        <p>Everything here is free. To have Claude draft or rewrite notes for you, connect your own Anthropic key.</p>
      </div>

      <ol class="steps">
        <li>
          <span class="n">1</span>
          <div>
            Open the Anthropic Console and sign in or sign up.
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener"
              >console.anthropic.com/settings/keys</a
            >
          </div>
        </li>
        <li>
          <span class="n">2</span>
          <div>Create a key, then copy it. It starts with <code>sk-ant-</code>.</div>
        </li>
        <li>
          <span class="n">3</span>
          <div>Paste it below. It is saved only in this browser and sent only to Anthropic.</div>
        </li>
      </ol>

      <div class="field">
        <input
          :type="show ? 'text' : 'password'"
          :value="key"
          placeholder="sk-ant-..."
          spellcheck="false"
          @input="key = ($event.target as HTMLInputElement).value"
        />
        <button class="reveal" @click="show = !show">{{ show ? 'Hide' : 'Show' }}</button>
      </div>

      <div class="actions">
        <button v-if="saved" class="ghost" @click="forget">Disconnect</button>
        <span class="spacer" />
        <button class="ghost" @click="emit('close')">Not now</button>
        <button class="primary" :disabled="!key.trim()" @click="save"><Icon name="check" :size="16" /> Connect</button>
      </div>

      <p class="foot">Usage is billed by Anthropic to your account. You can disconnect any time.</p>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(31, 31, 40, 0.4);
  display: grid;
  place-items: center;
  z-index: 80;
  padding: 16px;
}
.sheet {
  position: relative;
  width: min(460px, 100%);
  background: #fff;
  border-radius: 20px;
  padding: 26px 24px 20px;
  box-shadow: 0 30px 80px rgba(31, 31, 40, 0.35);
}
.x {
  position: absolute;
  top: 14px;
  right: 14px;
  border: none;
  background: transparent;
  color: #9a9aa8;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
}
.x:hover {
  background: rgba(51, 51, 76, 0.08);
}
.head {
  text-align: center;
  margin-bottom: 18px;
}
.badge {
  width: 46px;
  height: 46px;
  margin: 0 auto 10px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, #4a72b0, #7e3f8a);
}
h2 {
  margin: 0 0 6px;
  font-size: 20px;
  color: #29297e;
}
.head p {
  margin: 0;
  font-size: 14px;
  color: #6a6a80;
  line-height: 1.5;
}
.steps {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.steps li {
  display: flex;
  gap: 12px;
  font-size: 14px;
  color: #33334c;
  line-height: 1.45;
}
.n {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(74, 114, 176, 0.14);
  color: #4a72b0;
  font-weight: 700;
  font-size: 13px;
  display: grid;
  place-items: center;
}
.steps a {
  color: #4a72b0;
  text-decoration: none;
}
.steps a:hover {
  text-decoration: underline;
}
code {
  background: rgba(51, 51, 76, 0.08);
  padding: 1px 5px;
  border-radius: 5px;
  font-size: 12px;
}
.field {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(51, 51, 76, 0.2);
  border-radius: 10px;
  padding: 4px 4px 4px 12px;
}
.field:focus-within {
  border-color: #4a72b0;
}
.field input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 14px;
  padding: 8px 0;
  font-family: inherit;
}
.reveal {
  border: none;
  background: transparent;
  color: #6a6a80;
  cursor: pointer;
  font-size: 13px;
  padding: 6px 8px;
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
button.ghost {
  border: 1px solid rgba(51, 51, 76, 0.18);
  background: transparent;
  color: #33334c;
  border-radius: 10px;
  padding: 9px 14px;
  cursor: pointer;
  font-size: 14px;
}
button.primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: #4a72b0;
  color: #fff;
  border-radius: 10px;
  padding: 9px 16px;
  cursor: pointer;
  font-size: 14px;
}
button.primary:disabled {
  opacity: 0.5;
  cursor: default;
}
.foot {
  margin: 12px 0 0;
  text-align: center;
  font-size: 12px;
  color: #9a9aa8;
}
</style>
