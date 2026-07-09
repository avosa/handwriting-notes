<script setup lang="ts">
// Where a writer connects an AI so it can draft and rewrite notes. Claude, ChatGPT,
// Gemini, and DeepSeek each hold their own key; pick one, follow the short steps to get a key, and
// paste it. Keys stay in this browser and are sent only to their own vendor. The one you
// connect becomes the one in use, and any connected provider can be made the one in use.
// It rises as a centred card on a wide screen and a bottom sheet on a phone.
import { computed, onMounted, ref } from 'vue'
import type { ProviderId } from '@/types'
import { loadApiKey, saveApiKey, clearApiKey } from '@/store/persistence'
import { useSettings } from '@/store/settings'
import { providerList, getProvider } from '@/ai/providers'
import Icon from './Icon.vue'

const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>()
const settings = useSettings()

const viewed = ref<ProviderId>(settings.activeProvider)
const keys = ref<Record<string, string>>({})
const draft = ref('')
const replacing = ref(false)
const show = ref(false)

const provider = computed(() => getProvider(viewed.value))
const savedKey = computed(() => keys.value[viewed.value] ?? '')
const connected = computed(() => !!savedKey.value)
const isActive = computed(() => settings.activeProvider === viewed.value)
const editing = computed(() => !connected.value || replacing.value)

onMounted(async () => {
  const found: Record<string, string> = {}
  for (const p of providerList) {
    const existing = await loadApiKey(p.id)
    if (existing) found[p.id] = existing
  }
  keys.value = found
})

function pick(id: ProviderId) {
  viewed.value = id
  replacing.value = false
  show.value = false
  draft.value = ''
}
async function save() {
  const key = draft.value.trim()
  if (!key) return
  await saveApiKey(viewed.value, key)
  keys.value = { ...keys.value, [viewed.value]: key }
  settings.setProvider(viewed.value)
  replacing.value = false
  draft.value = ''
  emit('saved')
}
async function disconnect() {
  await clearApiKey(viewed.value)
  const next = { ...keys.value }
  delete next[viewed.value]
  keys.value = next
  replacing.value = false
  if (settings.activeProvider === viewed.value) {
    settings.setProvider(providerList.find((p) => keys.value[p.id])?.id ?? 'anthropic')
  }
}
function startReplace() {
  draft.value = ''
  replacing.value = true
}
function cancelReplace() {
  draft.value = ''
  replacing.value = false
}
function useForWriting() {
  settings.setProvider(viewed.value)
}
function masked(k: string): string {
  const t = k.trim()
  return t.length > 14 ? `${t.slice(0, 8)}${'•'.repeat(6)}${t.slice(-4)}` : t
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="card">
      <div class="grip" />
      <button class="x" title="Close" @click="emit('close')"><Icon name="close" :size="18" /></button>

      <div class="tabs">
        <button v-for="p in providerList" :key="p.id" class="tab" :class="{ on: viewed === p.id }" @click="pick(p.id)">
          <span class="tab-name">{{ p.name }}</span>
          <span v-if="settings.activeProvider === p.id" class="tab-flag">In use</span>
          <span v-else-if="keys[p.id]" class="tab-dot" />
        </button>
      </div>

      <div class="head">
        <div class="badge" :class="{ ok: connected && !replacing }">
          <Icon :name="connected && !replacing ? 'check' : 'wand'" :size="22" />
        </div>
        <h2>{{ connected && !replacing ? `${provider.name} is connected` : `Connect ${provider.name}` }}</h2>
        <p v-if="connected && !replacing">
          {{ isActive ? 'This is drafting your notes.' : 'Connected.' }} Your key stays in this browser and is sent only
          to {{ provider.vendor }}.
        </p>
        <p v-else>
          Everything here is free. To have {{ provider.name }} draft or rewrite notes, connect your own
          {{ provider.vendor }} key.
        </p>
      </div>

      <template v-if="editing">
        <ol class="steps">
          <li v-for="(step, i) in provider.steps" :key="i">
            <span class="n">{{ i + 1 }}</span>
            <div>{{ step }}</div>
          </li>
        </ol>
        <a class="console" :href="provider.consoleUrl" target="_blank" rel="noopener">
          <Icon name="key" :size="15" /> Open the {{ provider.vendor }} key page
          <Icon name="arrowLeft" :size="14" class="ext" />
        </a>
        <div class="field">
          <input
            type="password"
            :value="draft"
            :placeholder="provider.keyPlaceholder"
            spellcheck="false"
            autocomplete="off"
            @input="draft = ($event.target as HTMLInputElement).value"
            @keydown.enter="save"
          />
        </div>
      </template>

      <div v-else class="status">
        <div class="status-top">
          <span class="dot" />
          <span class="masked" :class="{ full: show }">{{ show ? savedKey : masked(savedKey) }}</span>
        </div>
        <div class="status-actions">
          <button class="link" @click="show = !show">{{ show ? 'Hide' : 'Show' }}</button>
          <span class="dot-sep" />
          <button class="link" @click="startReplace">Replace</button>
          <template v-if="!isActive">
            <span class="dot-sep" />
            <button class="link" @click="useForWriting">Use for writing</button>
          </template>
        </div>
      </div>

      <div class="actions">
        <template v-if="!connected">
          <button class="ghost" @click="emit('close')">Not now</button>
          <span class="spacer" />
          <button class="primary" :disabled="!draft.trim()" @click="save">
            <Icon name="check" :size="16" /> Connect
          </button>
        </template>
        <template v-else-if="replacing">
          <button class="ghost" @click="cancelReplace">Cancel</button>
          <span class="spacer" />
          <button class="primary" :disabled="!draft.trim()" @click="save">
            <Icon name="check" :size="16" /> Save key
          </button>
        </template>
        <template v-else>
          <button class="danger" @click="disconnect">Disconnect</button>
          <span class="spacer" />
          <button class="primary" @click="emit('close')">Done</button>
        </template>
      </div>

      <p class="foot">Usage is billed by {{ provider.vendor }} to your account.</p>
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
  width: min(460px, 100%);
  background: var(--surface);
  border-radius: 22px;
  padding: 22px 24px 20px;
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
  z-index: 1;
}
.x:hover {
  background: var(--surface-sunken);
}
.tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  margin: 6px 0 18px;
  background: var(--surface-sunken);
  border-radius: 12px;
}
.tab {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  background: transparent;
  border-radius: 9px;
  padding: 9px 6px;
  cursor: pointer;
  color: var(--text-soft);
  font-size: 13px;
  font-weight: 600;
}
.tab.on {
  background: var(--surface);
  color: var(--brand);
  box-shadow: 0 1px 4px var(--border);
}
.tab-flag {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #fff;
  background: linear-gradient(135deg, #3f8f5c, #2e9e8f);
  border-radius: 999px;
  padding: 2px 6px;
}
.tab-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #3f8f5c;
}
.head {
  text-align: center;
  margin-bottom: 16px;
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
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 11px;
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
.console {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
}
.console:hover {
  text-decoration: underline;
}
.console .ext {
  transform: rotate(135deg);
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
  flex-wrap: wrap;
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
    margin: -6px auto 12px;
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
