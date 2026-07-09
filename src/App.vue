<script setup lang="ts">
// The application shell: a quiet top bar, the stack of note pages, the floating tool
// bar, the compose bar, and the selection menu. Chrome stays light so the paper is
// the star, and the layout adapts from a wide desktop to a phone without losing any
// of the tools.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { APP_NAME } from './brand'
import { useDocument } from './store/document'
import NotePage from './editor/NotePage.vue'
import EditorBar from './editor/EditorBar.vue'
import SelectionMenu from './editor/SelectionMenu.vue'
import ComposeSheet from './compose/ComposeSheet.vue'
import ApiKeyDialog from './ui/ApiKeyDialog.vue'
import Icon from './ui/Icon.vue'
import Popover from './ui/Popover.vue'

const documentStore = useDocument()

const mode = ref<'write' | 'draw'>('write')
const showKey = ref(false)
const showCompose = ref(false)
const exporting = ref<'pdf' | 'docx' | null>(null)

const pageWidth = ref(760)
function fit() {
  pageWidth.value = Math.min(820, Math.max(320, window.innerWidth - 48))
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
    if (kind === 'pdf') {
      const { downloadPdf } = await import('./export/toPdf')
      await downloadPdf(documentStore.doc)
    } else {
      const { downloadDocx } = await import('./export/toDocx')
      await downloadDocx(documentStore.doc)
    }
  } finally {
    exporting.value = null
  }
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">{{ APP_NAME }}</div>
      <input v-model="title" class="doc-title" spellcheck="false" aria-label="Document title" />
      <div class="spacer" />

      <Popover align="right">
        <template #trigger>
          <button class="chip" :disabled="exporting !== null">
            <Icon name="download" :size="18" />
            <span class="chip-text">{{ exporting ? 'Saving…' : 'Save as' }}</span>
          </button>
        </template>
        <template #default>
          <div class="menu">
            <button class="menu-item" @click="saveAs('pdf')">
              <Icon name="file" :size="18" /><span>PDF document</span>
            </button>
            <button class="menu-item" @click="saveAs('docx')">
              <Icon name="file" :size="18" /><span>Word document (.docx)</span>
            </button>
          </div>
        </template>
      </Popover>

      <button class="chip primary" @click="showCompose = true">
        <Icon name="wand" :size="18" />
        <span class="chip-text">Write with AI</span>
      </button>
      <button class="icon-btn" title="Claude API key" @click="showKey = true"><Icon name="key" :size="18" /></button>
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
      <button class="add-page" @click="documentStore.setActivePage(documentStore.addBlankPage())">
        <Icon name="pageAdd" :size="18" /> Add page
      </button>
    </main>

    <div class="dock">
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
}
.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  padding-top: max(10px, env(safe-area-inset-top));
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(51, 51, 76, 0.08);
  z-index: 30;
}
.brand {
  font-weight: 700;
  color: #29297e;
  font-size: 15px;
  white-space: nowrap;
}
.doc-title {
  border: none;
  background: transparent;
  font-size: 14px;
  color: #6a6a80;
  font-family: inherit;
  max-width: 240px;
  padding: 4px 6px;
  border-radius: 7px;
}
.doc-title:focus {
  outline: none;
  background: rgba(51, 51, 76, 0.06);
  color: #33334c;
}
.spacer {
  flex: 1;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(51, 51, 76, 0.16);
  background: #fff;
  border-radius: 10px;
  padding: 8px 13px;
  cursor: pointer;
  color: #33334c;
  font-size: 14px;
}
.chip:hover {
  background: rgba(74, 114, 176, 0.08);
}
.chip.primary {
  border: none;
  color: #fff;
  background: linear-gradient(135deg, #4a72b0, #6a4fa0);
}
.chip:disabled {
  opacity: 0.55;
  cursor: default;
}
.icon-btn {
  display: inline-flex;
  border: 1px solid rgba(51, 51, 76, 0.16);
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
  gap: 22px;
  padding: 26px 16px 150px;
}
.add-page {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px dashed rgba(51, 51, 76, 0.28);
  background: transparent;
  border-radius: 12px;
  padding: 12px 20px;
  color: #6a6a80;
  cursor: pointer;
  font-size: 14px;
}
.add-page:hover {
  background: rgba(255, 255, 255, 0.5);
}
.dock {
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
  gap: 10px;
  border: none;
  background: transparent;
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
  color: #33334c;
  font-size: 14px;
  text-align: left;
}
.menu-item:hover {
  background: rgba(74, 114, 176, 0.1);
}

@media (max-width: 640px) {
  .brand {
    display: none;
  }
  .chip-text {
    display: none;
  }
  .chip {
    padding: 8px;
  }
  .stack {
    padding: 16px 8px 150px;
  }
}
</style>
