<script setup lang="ts">
// Where a writer connects an AI so it can draft and rewrite notes. Claude, ChatGPT,
// Gemini, and DeepSeek each hold their own key; pick one, follow the short steps to get a
// key, and paste it. Keys stay in this browser and are sent only to their own vendor. The
// one you connect becomes the one in use, and any connected provider can be switched to.
import { computed, onMounted, ref } from 'vue'
import type { ProviderId } from '@/types'
import { loadApiKey, saveApiKey, clearApiKey } from '@/store/persistence'
import { useSettings } from '@/store/settings'
import { providerList, getProvider } from '@/ai/providers'
import { refreshConnections } from '@/compose/aiConnection'
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

// The first step shows the key page as a link; split its text around the bare domain.
const step0 = computed(() => {
  const [before, after = ''] = provider.value.steps[0].split(provider.value.consoleLabel)
  return { before, after }
})

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
  await refreshConnections()
  replacing.value = false
  draft.value = ''
  emit('saved')
}
async function disconnect() {
  await clearApiKey(viewed.value)
  const next = { ...keys.value }
  delete next[viewed.value]
  keys.value = next
  await refreshConnections()
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
      <div class="tabhead">
        <span class="tab-title">Choose a provider</span>
        <button class="x" title="Close" @click="emit('close')"><Icon name="close" :size="18" /></button>
      </div>

      <div class="tabs">
        <button v-for="p in providerList" :key="p.id" class="tab" :class="{ on: viewed === p.id }" @click="pick(p.id)">
          {{ p.name }}
          <span v-if="keys[p.id]" class="tab-dot" title="Connected" />
        </button>
      </div>

      <header>
        <div class="badge" :class="{ ok: connected && !replacing }">
          <Icon :name="connected && !replacing ? 'check' : 'wand'" :size="20" />
        </div>
        <div class="titles">
          <h2>{{ connected && !replacing ? `${provider.name} is connected` : `Connect ${provider.name}` }}</h2>
          <p>
            The app is free. You connect your own {{ provider.vendor }} key and pay {{ provider.vendor }} only for what
            {{ provider.name }} generates.
          </p>
        </div>
      </header>

      <template v-if="editing">
        <ol class="steps">
          <li>
            <span class="n">1</span>
            <span
              >{{ step0.before
              }}<a class="ilink" :href="provider.consoleUrl" target="_blank" rel="noopener">{{
                provider.consoleLabel
              }}</a
              >{{ step0.after }}</span
            >
          </li>
          <li v-for="(step, i) in provider.steps.slice(1)" :key="i">
            <span class="n">{{ i + 2 }}</span
            ><span>{{ step }}</span>
          </li>
        </ol>

        <div class="field-head">
          <label for="ai-key">{{ provider.vendor }} API key</label>
          <a :href="provider.consoleUrl" target="_blank" rel="noopener"
            >Get a key <Icon name="external" :size="12"
          /></a>
        </div>
        <div class="field">
          <Icon name="lock" :size="16" class="lock" />
          <input
            id="ai-key"
            :type="show ? 'text' : 'password'"
            :value="draft"
            :placeholder="provider.keyPlaceholder"
            spellcheck="false"
            autocomplete="off"
            @input="draft = ($event.target as HTMLInputElement).value"
            @keydown.enter="save"
          />
          <button class="peek" :title="show ? 'Hide' : 'Show'" @click="show = !show">
            <Icon :name="show ? 'eyeOff' : 'eye'" :size="16" />
          </button>
        </div>
        <p class="helper">
          <Icon name="lock" :size="12" /> Stored in this browser only, sent straight to {{ provider.vendor }}, never to
          us.
        </p>
      </template>

      <div v-else class="status">
        <div class="status-top">
          <Icon name="check" :size="16" class="status-check" />
          <span class="masked" :class="{ full: show }">{{ show ? savedKey : masked(savedKey) }}</span>
          <button class="peek" :title="show ? 'Hide' : 'Show'" @click="show = !show">
            <Icon :name="show ? 'eyeOff' : 'eye'" :size="15" />
          </button>
        </div>
        <div class="status-actions">
          <button class="link" @click="startReplace">Replace key</button>
          <template v-if="!isActive">
            <span class="dot-sep" />
            <button class="link" @click="useForWriting">Use for writing</button>
          </template>
          <template v-else><span class="dot-sep" /><span class="in-use">In use for writing</span></template>
        </div>
      </div>

      <div class="actions">
        <template v-if="!connected">
          <button class="ghost" @click="emit('close')">Not now</button>
          <span class="spacer" />
          <button class="primary" :disabled="!draft.trim()" @click="save">Connect {{ provider.name }}</button>
        </template>
        <template v-else-if="replacing">
          <button class="ghost" @click="cancelReplace">Cancel</button>
          <span class="spacer" />
          <button class="primary" :disabled="!draft.trim()" @click="save">Save key</button>
        </template>
        <template v-else>
          <button class="danger" @click="disconnect">Disconnect</button>
          <span class="spacer" />
          <button class="primary" @click="emit('close')">Done</button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  /* Stronger than the compose scrim so the panel behind does not compete for attention. */
  background: rgba(10, 10, 16, 0.62);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  z-index: 85;
  padding: 16px;
}
.card {
  position: relative;
  width: min(460px, 100%);
  background: var(--surface);
  border-radius: 22px;
  padding: 20px 22px;
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
.tabhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.tab-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
}
.x {
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
.tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  margin-bottom: 18px;
  background: var(--surface-sunken);
  border-radius: 12px;
}
.tab {
  position: relative;
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
  transition:
    background 0.14s ease,
    color 0.14s ease;
}
.tab.on {
  color: #fff;
  background: var(--accent-grad);
  box-shadow: 0 2px 8px var(--accent-shadow);
}
.tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3f8f5c;
}
.tab.on .tab-dot {
  background: #fff;
}
header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}
.badge {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--accent-grad);
}
.badge.ok {
  background: linear-gradient(135deg, #3f8f5c, #2e9e8f);
}
.titles {
  flex: 1;
}
h2 {
  margin: 0 0 4px;
  font-size: 19px;
  color: var(--brand);
}
.titles p {
  margin: 0;
  font-size: 13px;
  color: var(--text-soft);
  line-height: 1.5;
}
.steps {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.steps li {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  font-size: 14px;
  color: var(--text);
  line-height: 1.4;
}
.n {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent-wash-2);
  color: var(--accent);
  font-weight: 700;
  font-size: 12px;
  display: grid;
  place-items: center;
}
.ilink {
  color: var(--accent);
  font-weight: 600;
  text-decoration: none;
}
.ilink:hover {
  text-decoration: underline;
}
.field-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 7px;
}
.field-head label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.field-head a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
}
.field-head a:hover {
  text-decoration: underline;
}
.field {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 11px;
  padding: 0 10px;
  background: var(--surface-sunken);
}
.field:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-wash-2);
}
.field .lock {
  flex-shrink: 0;
  color: var(--text-muted);
}
.field input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  padding: 12px 0;
  font-family: ui-monospace, monospace;
  font-size: 14px;
  color: var(--text);
}
.peek {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
}
.peek:hover {
  color: var(--text);
  background: var(--surface);
}
.helper {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-muted);
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
  gap: 9px;
}
.status-check {
  flex-shrink: 0;
  color: #3f8f5c;
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
  padding-left: 25px;
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
.in-use {
  font-size: 12.5px;
  font-weight: 600;
  color: #3f8f5c;
}
.dot-sep {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--text-muted);
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
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
  border: none;
  background: var(--accent-grad);
  color: #fff;
  border-radius: 10px;
  padding: 11px 20px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 3px 12px var(--accent-shadow);
}
button.primary:disabled {
  opacity: 0.5;
  cursor: default;
  box-shadow: none;
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
    margin: 0 auto 12px;
  }
  .actions {
    flex-wrap: wrap;
    gap: 10px;
  }
  button.ghost,
  button.danger,
  button.primary {
    min-height: 44px;
  }
}
</style>
