<script setup lang="ts">
// The application shell: a quiet top bar, the stack of note pages sized to the
// viewport, the floating instrument tray, and the compose bar. The paper is the star,
// so the chrome stays light and out of the way.
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { APP_NAME } from './brand'
import { useDocument } from './store/document'
import { getHandwriting } from './handwriting/registry'
import { useSettings } from './store/settings'
import NotePage from './editor/NotePage.vue'
import Toolbar from './tools/Toolbar.vue'
import InstructionBar from './compose/InstructionBar.vue'
import ApiKeyDialog from './ApiKeyDialog.vue'

const documentStore = useDocument()
const settings = useSettings()
const handwriting = computed(() => getHandwriting(settings.activeHandwritingId))

const mode = ref<'write' | 'draw'>('write')
const showKey = ref(false)
const exporting = ref<'pdf' | 'docx' | null>(null)

// Fit the page width to the viewport, leaving room for the chrome and margins.
const pageWidth = ref(720)
function fit() {
  pageWidth.value = Math.min(820, Math.max(360, window.innerWidth - 120))
}
onMounted(fit)
window.addEventListener('resize', fit)
onBeforeUnmount(() => window.removeEventListener('resize', fit))

// The exporters pull in large libraries, so they are loaded only when first used.
async function exportPdf() {
  exporting.value = 'pdf'
  try {
    const { downloadPdf } = await import('./export/toPdf')
    await downloadPdf(documentStore.doc)
  } finally {
    exporting.value = null
  }
}
async function exportDocx() {
  exporting.value = 'docx'
  try {
    const { downloadDocx } = await import('./export/toDocx')
    await downloadDocx(documentStore.doc)
  } finally {
    exporting.value = null
  }
}
</script>

<template>
  <div class="app">
    <header class="bar">
      <div class="brand">{{ APP_NAME }}</div>
      <div class="doc-title">{{ documentStore.doc.title }}</div>
      <div class="spacer" />
      <span class="hand" :title="handwriting.name">✍ {{ handwriting.name }}</span>
      <button class="ghost" title="Anthropic API key" @click="showKey = true">🔑 Key</button>
      <button class="ghost" :disabled="exporting !== null" @click="exportPdf">
        {{ exporting === 'pdf' ? 'Exporting…' : 'PDF' }}
      </button>
      <button class="ghost" :disabled="exporting !== null" @click="exportDocx">
        {{ exporting === 'docx' ? 'Exporting…' : 'DOCX' }}
      </button>
    </header>

    <main class="stack">
      <NotePage
        v-for="(page, i) in documentStore.doc.pages"
        :key="page.id"
        :page="page"
        :page-index="i"
        :width-px="pageWidth"
        :mode="mode"
      />
      <button class="add-page" @click="documentStore.addBlankPage()">＋ Add page</button>
    </main>

    <div class="tools">
      <Toolbar :mode="mode" @update:mode="mode = $event" />
    </div>

    <footer class="compose">
      <InstructionBar />
    </footer>

    <ApiKeyDialog v-if="showKey" @close="showKey = false" />
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 18px;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(51, 51, 76, 0.1);
  z-index: 10;
}
.brand {
  font-weight: 700;
  color: #29297e;
}
.doc-title {
  color: #6a6a80;
  font-size: 14px;
}
.spacer {
  flex: 1;
}
.hand {
  font-size: 13px;
  color: #6a6a80;
}
.ghost {
  border: 1px solid rgba(51, 51, 76, 0.18);
  background: #fff;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  color: #33334c;
  font-size: 13px;
}
.ghost:disabled {
  opacity: 0.5;
  cursor: default;
}
.stack {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 28px 20px 160px;
}
.add-page {
  border: 1px dashed rgba(51, 51, 76, 0.3);
  background: transparent;
  border-radius: 10px;
  padding: 12px 20px;
  color: #6a6a80;
  cursor: pointer;
}
.tools {
  position: fixed;
  left: 50%;
  bottom: 92px;
  transform: translateX(-50%);
  z-index: 20;
}
.compose {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(51, 51, 76, 0.1);
  z-index: 15;
}
</style>
