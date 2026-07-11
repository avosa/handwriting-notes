<script setup lang="ts">
// On-device AI settings: turn on a model that runs in the browser on the user's own GPU, so AI
// works with no API key. It shows whether the device can run one, lets the writer pick a size,
// and downloads the chosen model once (cached after). Where the hardware can't run a model, the
// app falls back to a connected key, so AI is always available.
import { computed, ref, watch } from 'vue'
import { useSettings } from '@/store/settings'
import { LOCAL_MODELS, DEFAULT_LOCAL_MODEL, modelById } from '@/ai/local/localModels'
import {
  webgpuAvailable,
  preloadLocalModel,
  isModelCached,
  localStatus,
  localProgress,
  localError,
  loadedModel,
} from '@/ai/local/localLlm'
import Icon from './Icon.vue'
import { useFocusTrap } from './useFocusTrap'

const emit = defineEmits<{ (e: 'close'): void }>()
const settings = useSettings()

const card = ref<HTMLElement | null>(null)
useFocusTrap(card, () => emit('close'))

const supported = webgpuAvailable()
const enabled = computed({
  get: () => !!settings.localAiEnabled,
  set: (v: boolean) => settings.setLocalAiEnabled(v),
})
const selectedId = computed(() => settings.localModelId || DEFAULT_LOCAL_MODEL)
const selectedModel = computed(() => modelById(selectedId.value))
// Whether the selected model's weights are already downloaded to this device, checked against the
// browser cache so a refresh still knows it is here. The in-memory "loaded" state is separate.
const cached = ref(false)
async function refreshCached() {
  cached.value = await isModelCached(selectedModel.value.mlcId)
}
watch(selectedId, refreshCached, { immediate: true })

const ready = computed(() => localStatus.value === 'ready' && loadedModel.value === selectedModel.value.mlcId)
const percent = computed(() => (localProgress.value != null ? Math.round(localProgress.value * 100) : null))

function select(id: string) {
  settings.setLocalModel(id)
}

async function load() {
  await preloadLocalModel(selectedModel.value.mlcId)
  await refreshCached()
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="card" class="sheet" role="dialog" aria-modal="true" aria-label="On-device AI" tabindex="-1">
      <header class="head">
        <h2>On-device AI</h2>
        <button class="close" title="Close" @click="emit('close')"><Icon name="close" :size="16" /></button>
      </header>

      <p class="lead">
        Run AI in your browser on your own GPU — <strong>no API key</strong>, nothing leaves your device. The model
        downloads once and is cached.
      </p>

      <div class="facts">
        <span class="fact"><Icon name="device" :size="13" /> Runs on your device</span>
        <span class="fact"><Icon name="lockOpen" :size="13" /> Free · private · offline</span>
        <span class="fact"><Icon name="close" :size="13" /> No web access</span>
      </div>
      <p class="explainer">
        It answers from <strong>your own notes</strong> and its own training — it does not browse the web. It is great
        for summarising and chatting about what you have written. For hard general-knowledge questions a connected key
        (like Claude) is stronger; on-device trades some knowledge for being free and private.
      </p>

      <p v-if="!supported" class="warn">
        <Icon name="sun" :size="14" /> This device can't run an on-device model (no WebGPU). The app will use your
        connected AI key instead.
      </p>

      <template v-else>
        <label class="toggle">
          <input v-model="enabled" type="checkbox" />
          <span class="row-title">Use on-device AI when possible</span>
        </label>

        <div class="models">
          <button
            v-for="m in LOCAL_MODELS"
            :key="m.id"
            class="model"
            :class="{ on: selectedId === m.id }"
            @click="select(m.id)"
          >
            <span class="model-top">
              <span class="model-name">{{ m.label }}</span>
              <span class="model-size">{{ m.sizeGB }} GB</span>
            </span>
            <span class="model-note">{{ m.note }}</span>
          </button>
        </div>

        <div class="loadrow">
          <div class="loadtext">
            <span v-if="ready" class="ready"><Icon name="check" :size="14" /> Loaded and ready</span>
            <span v-else-if="localStatus === 'loading'"
              >Downloading {{ selectedModel.label }}{{ percent != null ? ` … ${percent}%` : '…' }}</span
            >
            <span v-else-if="localError" class="err"
              >Could not load the model. It may be too large for this device.</span
            >
            <span v-else-if="cached" class="ready"
              ><Icon name="check" :size="14" /> Downloaded — loads instantly when you use it</span
            >
            <span v-else>Download {{ selectedModel.label }} ({{ selectedModel.sizeGB }} GB, once)</span>
          </div>
          <button class="btn" :disabled="localStatus === 'loading' || ready" @click="load">
            {{ ready ? 'Ready' : cached ? 'Load now' : 'Download' }}
          </button>
        </div>
        <div v-if="localStatus === 'loading' && percent != null" class="bar">
          <div class="fill" :style="{ width: `${percent}%` }" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 11vh;
  background: rgba(20, 20, 28, 0.32);
  backdrop-filter: blur(2px);
}
.sheet {
  width: min(420px, calc(100vw - 24px));
  background: var(--surface, #fff);
  color: var(--ink, #23232e);
  border-radius: 14px;
  box-shadow: var(--pop-shadow, 0 18px 50px rgba(0, 0, 0, 0.3));
  padding: 18px 20px 18px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.close {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 5px;
  border-radius: 8px;
}
.close:hover {
  background: var(--surface-sunken);
  color: var(--text);
}
.lead {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
}
.lead strong {
  color: var(--accent);
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 10px;
}
.fact {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--surface-sunken, rgba(0, 0, 0, 0.05));
  border-radius: 999px;
  padding: 4px 10px;
}
.explainer {
  margin: 0 0 14px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-muted);
}
.explainer strong {
  color: var(--text);
}
.warn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  color: var(--danger, #c0392b);
}
.toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  cursor: pointer;
}
.toggle input {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
}
.row-title {
  font-size: 14px;
  font-weight: 600;
}
.models {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 14px;
}
.model {
  text-align: left;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 11px;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.model:hover {
  background: var(--accent-wash);
}
.model.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.model-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.model-name {
  font-size: 14px;
  font-weight: 600;
}
.model-size {
  font-size: 12px;
  color: var(--text-muted);
}
.model-note {
  font-size: 12px;
  color: var(--text-muted);
}
.loadrow {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}
.loadtext {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-muted);
}
.ready {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--accent);
  font-weight: 600;
}
.err {
  color: var(--danger, #c0392b);
}
.btn {
  flex-shrink: 0;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 9px;
  padding: 8px 14px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.btn:hover:not(:disabled) {
  background: var(--accent-wash);
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.bar {
  height: 8px;
  border-radius: 999px;
  background: var(--surface-sunken, #ececf4);
  overflow: hidden;
  margin-top: 10px;
}
.fill {
  height: 100%;
  background: var(--accent, #4a72b0);
  transition: width 0.2s ease;
}
</style>
