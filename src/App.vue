<script setup lang="ts">
// The application shell. A calm top bar holds the document title and the main actions;
// the pages sit on a soft desk; the tools float in a dock at the bottom. The layout
// adapts from a wide desktop down to a phone, keeping every tool within reach.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { APP_NAME } from './brand'
import { useDocument } from './store/document'
import NotePage from './editor/NotePage.vue'
import EditorBar from './editor/EditorBar.vue'
import SelectionMenu from './editor/SelectionMenu.vue'
import ComposeSheet from './compose/ComposeSheet.vue'
import ApiKeyDialog from './ui/ApiKeyDialog.vue'
import HandwritingPicker from './tools/HandwritingPicker.vue'
import Icon from './ui/Icon.vue'
import Popover from './ui/Popover.vue'

const documentStore = useDocument()

const mode = ref<'write' | 'draw'>('write')
const showKey = ref(false)
const showCompose = ref(false)
const exporting = ref<'pdf' | 'docx' | null>(null)

const pageCount = computed(() => documentStore.doc.pages.length)

const pageWidth = ref(760)
function fit() {
  pageWidth.value = Math.min(800, Math.max(300, window.innerWidth - 56))
}
onMounted(fit)
window.addEventListener('resize', fit)
onBeforeUnmount(() => window.removeEventListener('resize', fit))

const title = computed({
  get: () => documentStore.doc.title,
  set: (v: string) => documentStore.setTitle(v),
})

async function saveAs(kind: 'pdf' | 'docx') {
  exporting.value = kind
  try {
    if (kind === 'pdf') await (await import('./export/toPdf')).downloadPdf(documentStore.doc)
    else await (await import('./export/toDocx')).downloadDocx(documentStore.doc)
  } finally {
    exporting.value = null
  }
}
function addPage() {
  documentStore.setActivePage(documentStore.addBlankPage())
  requestAnimationFrame(() => document.querySelector('.stack')?.scrollTo({ top: 1e9, behavior: 'smooth' }))
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="left">
        <div class="mark"><Icon name="pencil" :size="18" /></div>
        <span class="brand">{{ APP_NAME }}</span>
      </div>

      <div class="center">
        <input v-model="title" class="doc-title" spellcheck="false" aria-label="Document title" />
        <span class="pages">{{ pageCount }} {{ pageCount === 1 ? 'page' : 'pages' }}</span>
      </div>

      <div class="right">
        <HandwritingPicker class="hide-mobile" />
        <Popover align="right">
          <template #trigger>
            <button class="chip" :disabled="exporting !== null">
              <Icon name="download" :size="18" /><span class="chip-text">{{ exporting ? 'Saving…' : 'Save' }}</span>
            </button>
          </template>
          <template #default>
            <div class="menu">
              <button class="menu-item" @click="saveAs('pdf')">
                <Icon name="file" :size="18" /><span>PDF document</span>
              </button>
              <button class="menu-item" @click="saveAs('docx')">
                <Icon name="file" :size="18" /><span>Word document</span>
              </button>
            </div>
          </template>
        </Popover>
        <button class="icon-btn" title="Claude API key" @click="showKey = true"><Icon name="key" :size="18" /></button>
        <button class="chip primary" @click="showCompose = true">
          <Icon name="wand" :size="18" /><span class="chip-text">Write with AI</span>
        </button>
      </div>
    </header>

    <main class="stack">
      <div v-for="(page, i) in documentStore.doc.pages" :key="page.id" class="page-wrap">
        <NotePage :page="page" :page-index="i" :width-px="pageWidth" :mode="mode" />
        <div class="page-num">{{ i + 1 }} / {{ pageCount }}</div>
      </div>
      <button class="add-page" @click="addPage"><Icon name="pageAdd" :size="18" /> Add page</button>
    </main>

    <div class="dock-wrap">
      <EditorBar :mode="mode" @update:mode="mode = $event" />
    </div>

    <SelectionMenu />
    <ComposeSheet v-if="showCompose" @close="showCompose = false" @needs-key="showKey = true" />
    <ApiKeyDialog v-if="showKey" @close="showKey = false" />
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(1200px 600px at 50% -10%, #f2ede2, transparent), linear-gradient(180deg, #ece7dc, #e6e0d3);
}
.topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  padding: 10px 18px;
  padding-top: max(10px, env(safe-area-inset-top));
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(18px) saturate(1.4);
  border-bottom: 1px solid rgba(51, 51, 76, 0.07);
  z-index: 30;
}
.left {
  display: flex;
  align-items: center;
  gap: 9px;
}
.mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  color: #fff;
  background: linear-gradient(135deg, #4a72b0, #6a4fa0);
}
.brand {
  font-weight: 700;
  color: #29297e;
  font-size: 15px;
  white-space: nowrap;
}
.center {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}
.doc-title {
  border: none;
  background: transparent;
  font-size: 15px;
  font-weight: 600;
  color: #33334c;
  font-family: inherit;
  text-align: center;
  max-width: 44vw;
  padding: 3px 8px;
  border-radius: 8px;
}
.doc-title:focus {
  outline: none;
  background: rgba(51, 51, 76, 0.06);
}
.pages {
  font-size: 11px;
  color: #9a9aa8;
}
.right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(51, 51, 76, 0.14);
  background: #fff;
  border-radius: 10px;
  padding: 8px 13px;
  cursor: pointer;
  color: #33334c;
  font-size: 14px;
  white-space: nowrap;
}
.chip:hover {
  background: rgba(74, 114, 176, 0.08);
}
.chip.primary {
  border: none;
  color: #fff;
  background: linear-gradient(135deg, #4a72b0, #6a4fa0);
  box-shadow: 0 3px 12px rgba(74, 114, 176, 0.35);
}
.chip:disabled {
  opacity: 0.55;
  cursor: default;
}
.icon-btn {
  display: inline-flex;
  border: 1px solid rgba(51, 51, 76, 0.14);
  background: #fff;
  border-radius: 10px;
  padding: 8px;
  cursor: pointer;
  color: #33334c;
}
.icon-btn:hover {
  background: rgba(74, 114, 176, 0.08);
}
.stack {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 30px;
  padding: 30px 16px 170px;
  scroll-behavior: smooth;
}
.page-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.page-num {
  font-size: 12px;
  color: #9a9aa8;
  font-variant-numeric: tabular-nums;
}
.add-page {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px dashed rgba(51, 51, 76, 0.28);
  background: rgba(255, 255, 255, 0.35);
  border-radius: 12px;
  padding: 13px 22px;
  color: #6a6a80;
  cursor: pointer;
  font-size: 14px;
}
.add-page:hover {
  background: rgba(255, 255, 255, 0.7);
  color: #33334c;
}
.dock-wrap {
  position: fixed;
  left: 50%;
  bottom: max(18px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 40;
}
.menu {
  display: flex;
  flex-direction: column;
  padding: 6px;
  min-width: 210px;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 11px;
  border: none;
  background: transparent;
  border-radius: 10px;
  padding: 10px 11px;
  cursor: pointer;
  color: #33334c;
  font-size: 14px;
  text-align: left;
}
.menu-item:hover {
  background: rgba(74, 114, 176, 0.1);
}

@media (max-width: 720px) {
  .brand,
  .chip-text,
  .hide-mobile {
    display: none;
  }
  .chip,
  .icon-btn {
    padding: 8px;
  }
  .topbar {
    padding: 8px 12px;
    gap: 8px;
  }
  .doc-title {
    max-width: 40vw;
  }
  .stack {
    padding: 16px 8px 150px;
    gap: 22px;
  }
}
</style>
