<script setup lang="ts">
// A small window on how much room the notes take on this device: how much of the browser's
// allowance is used, whether the data is protected from eviction, and a way to free space by
// clearing attachment blobs that no note or version points at any more.
import { computed, onMounted, ref } from 'vue'
import {
  storageEstimate,
  isStoragePersisted,
  requestPersistentStorage,
  findOrphanBlobs,
  cleanupOrphanBlobs,
} from '@/store/persistence'
import Icon from './Icon.vue'
import { useFocusTrap } from './useFocusTrap'

const emit = defineEmits<{ (e: 'close'): void }>()

const card = ref<HTMLElement | null>(null)
useFocusTrap(card, () => emit('close'))

const usage = ref(0)
const quota = ref(0)
const supported = ref(true)
const persisted = ref(false)
const orphanCount = ref(0)
const busy = ref(false)
const freedNote = ref('')

const percent = computed(() => (quota.value ? Math.min(100, Math.round((usage.value / quota.value) * 100)) : 0))
// A gentle warning band so the reader knows before the browser starts evicting data.
const nearFull = computed(() => quota.value > 0 && percent.value >= 80)

function mb(bytes: number): string {
  if (!bytes) return '0 MB'
  const m = bytes / (1024 * 1024)
  return m >= 1024 ? `${(m / 1024).toFixed(1)} GB` : `${m.toFixed(m < 10 ? 1 : 0)} MB`
}

async function refresh() {
  const estimate = await storageEstimate()
  if (estimate) {
    usage.value = estimate.usage
    quota.value = estimate.quota
  } else {
    supported.value = false
  }
  persisted.value = await isStoragePersisted()
  orphanCount.value = (await findOrphanBlobs()).length
}
onMounted(refresh)

async function protect() {
  busy.value = true
  try {
    persisted.value = await requestPersistentStorage()
  } finally {
    busy.value = false
  }
}

async function freeSpace() {
  busy.value = true
  try {
    const freed = await cleanupOrphanBlobs()
    freedNote.value = freed ? `Freed ${freed} leftover ${freed === 1 ? 'file' : 'files'}.` : 'Nothing to clean up.'
    await refresh()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="card" class="sheet" role="dialog" aria-modal="true" aria-label="Storage" tabindex="-1">
      <header class="head">
        <h2>Storage</h2>
        <button class="close" title="Close" @click="emit('close')"><Icon name="close" :size="16" /></button>
      </header>

      <template v-if="supported">
        <div class="bar" :class="{ warn: nearFull }">
          <div class="fill" :style="{ width: `${percent}%` }" />
        </div>
        <p class="usage">
          <strong>{{ mb(usage) }}</strong> used of {{ mb(quota) }} available ({{ percent }}%)
        </p>
        <p v-if="nearFull" class="warn-note">
          <Icon name="sun" :size="14" /> Storage is getting full. Free up space or export a backup to be safe.
        </p>
      </template>
      <p v-else class="usage">This browser does not report storage usage.</p>

      <div class="row">
        <div class="row-text">
          <span class="row-title">Protect from eviction</span>
          <span class="row-sub">{{
            persisted
              ? 'On — your notes will not be cleared automatically.'
              : 'Ask the browser to keep your notes even when space is low.'
          }}</span>
        </div>
        <button v-if="!persisted" class="btn" :disabled="busy" @click="protect">Protect</button>
        <span v-else class="on-tag"><Icon name="check" :size="14" /> On</span>
      </div>

      <div class="row">
        <div class="row-text">
          <span class="row-title">Free up space</span>
          <span class="row-sub">
            {{
              freedNote ||
              (orphanCount
                ? `${orphanCount} leftover ${orphanCount === 1 ? 'file' : 'files'} from removed images can be cleared.`
                : 'No leftover files. Everything stored is in use.')
            }}
          </span>
        </div>
        <button class="btn" :disabled="busy || !orphanCount" @click="freeSpace">Clean up</button>
      </div>
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
  padding-top: 12vh;
  background: rgba(20, 20, 28, 0.32);
  backdrop-filter: blur(2px);
}
.sheet {
  width: min(400px, calc(100vw - 24px));
  background: var(--surface, #fff);
  color: var(--ink, #23232e);
  border-radius: 14px;
  box-shadow: var(--pop-shadow, 0 18px 50px rgba(0, 0, 0, 0.3));
  padding: 18px 20px 16px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
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
.bar {
  height: 10px;
  border-radius: 999px;
  background: var(--surface-sunken, #ececf4);
  overflow: hidden;
}
.fill {
  height: 100%;
  background: var(--accent, #4a72b0);
  transition: width 0.2s ease;
}
.bar.warn .fill {
  background: var(--danger, #c0392b);
}
.usage {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--text-muted);
}
.usage strong {
  color: var(--text);
}
.warn-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--danger, #c0392b);
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 0 0;
  margin-top: 14px;
  border-top: 1px solid var(--hairline, rgba(0, 0, 0, 0.07));
}
.row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row-title {
  font-size: 14px;
  font-weight: 600;
}
.row-sub {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
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
.on-tag {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent, #4a72b0);
}
</style>
