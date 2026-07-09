<script setup lang="ts">
// Where a writer connects their own Claude key so the AI can draft notes. The key is
// stored only in this browser and sent only to Anthropic. Before a key is connected it
// walks a first timer through getting one; once connected it shows a calm status with
// the key masked, and offers only what makes sense: replace it or disconnect. It rises
// as a centred card on a wide screen and as a bottom sheet on a phone.
import { computed, onMounted, ref } from 'vue'
import { loadApiKey, saveApiKey, clearApiKey } from '@/store/persistence'
import Icon from './Icon.vue'

const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>()
const key = ref('')
const original = ref('')
const replacing = ref(false)
const show = ref(false)

const connected = computed(() => !!original.value)

onMounted(async () => {
  const existing = await loadApiKey()
  if (existing) {
    key.value = existing
    original.value = existing
  }
})

async function save() {
  if (!key.value.trim()) return
  await saveApiKey(key.value.trim())
  original.value = key.value.trim()
  replacing.value = false
  emit('saved')
  emit('close')
}
async function disconnect() {
  await clearApiKey()
  key.value = ''
  original.value = ''
  replacing.value = false
}
function startReplace() {
  key.value = ''
  replacing.value = true
}
function cancelReplace() {
  key.value = original.value
  replacing.value = false
}
function masked(k: string): string {
  const t = k.trim()
  return t.length > 14 ? `${t.slice(0, 10)}${'•'.repeat(6)}${t.slice(-4)}` : t
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="card">
      <div class="grip" />
      <button class="x" title="Close" @click="emit('close')"><Icon name="close" :size="18" /></button>

      <div class="head">
        <div class="badge" :class="{ ok: connected && !replacing }">
          <Icon :name="connected && !replacing ? 'check' : 'wand'" :size="22" />
        </div>
        <h2>{{ connected && !replacing ? 'Claude is connected' : 'Write with AI' }}</h2>
        <p v-if="connected && !replacing">
          AI drafting is on. Your key stays in this browser and is sent only to Anthropic.
        </p>
        <p v-else>Everything here is free. To have Claude draft or rewrite notes, connect your own Anthropic key.</p>
      </div>

      <ol v-if="!connected" class="steps">
        <li>
          <span class="n">1</span>
          <div>
            Open the Anthropic Console and sign in or sign up.
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener"
              >console.anthropic.com</a
            >
          </div>
        </li>
        <li>
          <span class="n">2</span>
          <div>Create a key and copy it. It starts with <code>sk-ant-</code>.</div>
        </li>
        <li>
          <span class="n">3</span>
          <div>Paste it below. It is saved only in this browser.</div>
        </li>
      </ol>

      <div v-if="connected && !replacing" class="status">
        <div class="status-top">
          <span class="dot" />
          <span class="masked" :class="{ full: show }">{{ show ? original : masked(original) }}</span>
        </div>
        <div class="status-actions">
          <button class="link" @click="show = !show">{{ show ? 'Hide' : 'Show' }}</button>
          <span class="dot-sep" />
          <button class="link" @click="startReplace">Replace</button>
        </div>
      </div>

      <div v-else class="field">
        <input
          type="password"
          :value="key"
          placeholder="sk-ant-..."
          spellcheck="false"
          autocomplete="off"
          @input="key = ($event.target as HTMLInputElement).value"
        />
      </div>

      <div class="actions">
        <template v-if="!connected">
          <button class="ghost" @click="emit('close')">Not now</button>
          <span class="spacer" />
          <button class="primary" :disabled="!key.trim()" @click="save">
            <Icon name="check" :size="16" /> Connect
          </button>
        </template>
        <template v-else-if="replacing">
          <button class="ghost" @click="cancelReplace">Cancel</button>
          <span class="spacer" />
          <button class="primary" :disabled="!key.trim()" @click="save">
            <Icon name="check" :size="16" /> Save key
          </button>
        </template>
        <template v-else>
          <button class="danger" @click="disconnect">Disconnect</button>
          <span class="spacer" />
          <button class="primary" @click="emit('close')">Done</button>
        </template>
      </div>

      <p class="foot">Usage is billed by Anthropic to your account.</p>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  z-index: 80;
  padding: 16px;
}
.card {
  position: relative;
  width: min(440px, 100%);
  background: var(--surface);
  border-radius: 22px;
  padding: 26px 24px 20px;
  box-shadow: var(--pop-shadow);
  animation: pop 0.2s cubic-bezier(0.34, 1.4, 0.64, 1);
}
@keyframes pop {
  from {
    transform: scale(0.96) translateY(8px);
    opacity: 0;
  }
}
.grip {
  display: none;
}
.x {
  position: absolute;
  top: 14px;
  right: 14px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
}
.x:hover {
  background: var(--surface-sunken);
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
  background: var(--accent-grad);
}
.badge.ok {
  background: linear-gradient(135deg, #3f8f5c, #2e9e8f);
}
h2 {
  margin: 0 0 6px;
  font-size: 20px;
  color: var(--brand);
}
.head p {
  margin: 0;
  font-size: 14px;
  color: var(--text-soft);
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
  color: var(--text);
  line-height: 1.45;
}
.n {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--accent-wash-2);
  color: var(--accent);
  font-weight: 700;
  font-size: 13px;
  display: grid;
  place-items: center;
}
.steps a {
  color: var(--accent);
  text-decoration: none;
}
.steps a:hover {
  text-decoration: underline;
}
code {
  background: var(--surface-sunken);
  padding: 1px 5px;
  border-radius: 5px;
  font-size: 12px;
}
.status {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(63, 143, 92, 0.08);
  border: 1px solid rgba(63, 143, 92, 0.2);
}
.status-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.dot {
  flex-shrink: 0;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #3f8f5c;
  box-shadow: 0 0 0 3px rgba(63, 143, 92, 0.2);
}
.masked {
  flex: 1;
  min-width: 0;
  font-family: ui-monospace, monospace;
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* When the full key is shown it wraps within the box instead of overflowing. */
.masked.full {
  white-space: normal;
  overflow: visible;
  word-break: break-all;
  line-height: 1.5;
}
.status-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 19px;
}
.link {
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.link:hover {
  text-decoration: underline;
}
.dot-sep {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--text-muted);
}
.field {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 4px 12px;
}
.field:focus-within {
  border-color: var(--accent);
}
.field input {
  width: 100%;
  border: none;
  outline: none;
  font-size: 14px;
  padding: 9px 0;
  font-family: inherit;
  background: transparent;
  color: var(--text);
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
button.ghost,
button.danger {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  border-radius: 10px;
  padding: 10px 16px;
  cursor: pointer;
  font-size: 14px;
}
button.danger {
  color: var(--danger);
  border-color: var(--danger-wash);
}
button.danger:hover {
  background: var(--danger-wash);
}
button.primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: var(--accent);
  color: #fff;
  border-radius: 10px;
  padding: 10px 18px;
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
  color: var(--text-muted);
}

@media (max-width: 720px) {
  .backdrop {
    align-items: flex-end;
    padding: 0;
  }
  .card {
    width: 100%;
    border-radius: 22px 22px 0 0;
    padding-bottom: calc(20px + env(safe-area-inset-bottom));
    animation: rise 0.24s ease;
  }
  @keyframes rise {
    from {
      transform: translateY(100%);
    }
  }
  .grip {
    display: block;
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
    margin: -8px auto 14px;
  }
  .actions {
    flex-wrap: wrap;
    gap: 10px;
  }
  button.ghost,
  button.danger,
  button.primary,
  .x {
    min-height: 44px;
  }
  .x {
    min-width: 44px;
  }
}
</style>
