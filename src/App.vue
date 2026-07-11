<script setup lang="ts">
// The application shell. A calm top bar holds the document title and the main actions;
// the pages sit on a soft desk; the tools float in a dock at the bottom. The layout
// adapts from a wide desktop down to a phone, keeping every tool within reach.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Attachment } from './types'
import { useDocument } from './store/document'
import { useLibrary } from './store/library'
import { useSettings } from './store/settings'
import { useAi } from './compose/useAi'
import { refreshConnections } from './compose/aiConnection'
import { useTheme } from './theme/useTheme'
import NotePage from './editor/NotePage.vue'
import EditorBar from './editor/EditorBar.vue'
import SelectionMenu from './editor/SelectionMenu.vue'
import WholeNoteBar from './editor/WholeNoteBar.vue'
import LineSelectionBar from './editor/LineSelectionBar.vue'
import AiCursor from './editor/AiCursor.vue'
import ComposeSheet from './compose/ComposeSheet.vue'
import AiStatus from './compose/AiStatus.vue'
import ApiKeyDialog from './ui/ApiKeyDialog.vue'
import CommandPalette from './ui/CommandPalette.vue'
import type { Command } from './ui/CommandPalette.vue'
import ShortcutsSheet from './ui/ShortcutsSheet.vue'
import WelcomeSheet from './ui/WelcomeSheet.vue'
import WhatsNewSheet from './ui/WhatsNewSheet.vue'
import NoteInfo from './ui/NoteInfo.vue'
import { APP_DOMAIN } from './brand'
import { exportNoteAsText } from './export/toText'
import { exportPageAsPng } from './export/toPng'
import HandwritingPicker from './tools/HandwritingPicker.vue'
import ThemeSwitch from './ui/ThemeSwitch.vue'
import NavDrawer from './ui/NavDrawer.vue'
import HomeScreen from './home/HomeScreen.vue'
import Icon from './ui/Icon.vue'
import Popover from './ui/Popover.vue'

const documentStore = useDocument()
const library = useLibrary()
const settings = useSettings()
const { generating, phase, providerName, error: aiError, generate, stop } = useAi()
const { resolved: resolvedTheme } = useTheme()

const mode = ref<'write' | 'draw'>('write')
const showKey = ref(false)
const showCompose = ref(false)
const showHome = ref(false)
const showPalette = ref(false)
const showShortcuts = ref(false)
const showWelcome = ref(false)
const showWhatsNew = ref(false)
const showInfo = ref(false)
const drawerOpen = ref(false)

// Open the reader's mail app with a message addressed to the project, so a note of feedback
// is one click away without any account or form.
function sendFeedback() {
  window.location.href = `mailto:feedback@${APP_DOMAIN}?subject=Feedback`
}

// Save the page the reader is on as an image, falling back to the first if none is active.
async function savePageImage() {
  const pages = document.querySelectorAll<HTMLElement>('.note-page')
  const page = pages[documentStore.activePageIndex] ?? pages[0]
  if (page) await exportPageAsPng(page, documentStore.doc.title)
}

// The welcome card is shown once, the first time the app is opened on this device. A stored
// mark keeps it from returning; it can still be reopened from the command bar.
const WELCOMED_KEY = 'welcomed'
function dismissWelcome() {
  showWelcome.value = false
  try {
    localStorage.setItem(WELCOMED_KEY, '1')
  } catch {
    // Private modes can refuse storage; the card simply shows again next time.
  }
}
const exporting = ref<'pdf' | 'docx' | null>(null)

async function newNote() {
  await library.createNote('blank')
}

// Drawer actions close the menu first, then run — so the page eases back before a sheet
// or dialog takes over the screen.
function drawerHome() {
  drawerOpen.value = false
  showHome.value = true
}
function drawerNew() {
  drawerOpen.value = false
  void newNote()
}
function drawerKey() {
  drawerOpen.value = false
  showKey.value = true
}
function drawerCompose() {
  drawerOpen.value = false
  showCompose.value = true
}
function drawerSave(kind: 'pdf' | 'docx') {
  drawerOpen.value = false
  void saveAs(kind)
}

// Start a run and step back so the AI is watched writing onto the page. Working on the
// current note carries its words along as context so the AI can build on them; starting a
// new note opens a fresh page first, so the writing becomes its own note rather than more
// pages added to the one on screen. The note that was on screen is parked in the library.
async function onSubmit(instruction: string, attachments: Attachment[], useCurrent: boolean) {
  let context: string | undefined
  if (useCurrent) {
    const { noteToAddressableText } = await import('./ai/noteContext')
    context = noteToAddressableText(documentStore.doc)
  } else if (noteHasContent.value) {
    await newNote()
  }
  void generate(instruction, attachments, context)
}

const noteHasContent = computed(() =>
  documentStore.doc.pages.some((page) =>
    page.blocks.some((b) => (b.type === 'text' ? b.text.runs.some((r) => r.text.trim()) : true)),
  ),
)

// Bring a specific line into view, so coming to rest lands on an actual block rather than
// the far bottom of the stack.
function scrollToBlock(id: string | null, block: 'nearest' | 'center' = 'nearest') {
  if (!id) return
  requestAnimationFrame(() => {
    document.querySelector(`[data-block-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block, behavior: 'smooth' })
  })
}

// Follow the writing while the AI works: keep the line being typed lifted a little above the
// bottom dock, so the words are never written behind the toolbar. The page is eased up only
// when the line dips into that band, so it reads as a gentle pull rather than a jump, and the
// writer can still scroll freely everywhere else.
const HEADROOM_PX = 30
let followFrame = 0
function followWriting() {
  const stack = document.querySelector('.stack') as HTMLElement | null
  const dock = document.querySelector('.dock-wrap') as HTMLElement | null
  const id = documentStore.writingBlockId
  if (stack && dock && id) {
    const el = stack.querySelector(`[data-block-id="${CSS.escape(id)}"]`)
    if (el) {
      const lineBottom = el.getBoundingClientRect().bottom
      const limit = dock.getBoundingClientRect().top - HEADROOM_PX
      const overshoot = lineBottom - limit
      if (overshoot > 1) stack.scrollBy({ top: overshoot * 0.25 })
    }
  }
  if (documentStore.generating) followFrame = requestAnimationFrame(followWriting)
}
watch(
  () => documentStore.generating,
  (now, was) => {
    if (now && !was) followFrame = requestAnimationFrame(followWriting)
    if (was && !now) {
      cancelAnimationFrame(followFrame)
      // Come to rest on the last line written, deterministically.
      scrollToBlock(documentStore.selectedBlockId, 'center')
    }
  },
)

const pageCount = computed(() => documentStore.doc.pages.length)

// Right-clicking a page, or tapping its menu button, opens page actions at that spot.
const pageMenu = ref<{ index: number; x: number; y: number } | null>(null)
function openPageMenu(index: number, event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  // Keep the menu on screen: flip it up near the bottom, and in from the right edge.
  const menuW = 200
  const menuH = 170
  const x = Math.min(event.clientX, window.innerWidth - menuW)
  const y = event.clientY + menuH > window.innerHeight ? event.clientY - menuH : event.clientY
  pageMenu.value = { index, x: Math.max(8, x), y: Math.max(8, y) }
}
function closePageMenu() {
  pageMenu.value = null
}
function pageAction(fn: (i: number) => void) {
  if (pageMenu.value) fn(pageMenu.value.index)
  closePageMenu()
}

const pageWidth = ref(760)
function fit() {
  pageWidth.value = Math.min(800, Math.max(300, window.innerWidth - 56))
}

// Undo and redo with the usual keys. Real inputs keep their own undo; the handwriting
// blocks are contenteditable, so those use the note's history instead.
const themeIcon = computed(() => (resolvedTheme.value === 'dark' ? 'moon' : 'sun'))

// A full-screen space carries its own top bar and its own way back, so the menu toggle
// steps aside there instead of floating over it.
const overlayOpen = computed(() => showHome.value || showCompose.value || showKey.value)

// Everything the command bar can reach, each a plain title and the action it runs. Built
// from the same handlers the chrome uses, so the bar never drifts from what the buttons do.
const commands = computed<Command[]>(() => [
  { id: 'new', title: 'New note', icon: 'plus', run: () => void newNote() },
  { id: 'home', title: 'All notes', icon: 'grid', run: () => (showHome.value = true) },
  { id: 'compose', title: 'Write with AI', icon: 'wand', run: () => (showCompose.value = true) },
  { id: 'write', title: 'Write mode', icon: 'write', run: () => (mode.value = 'write') },
  { id: 'draw', title: 'Draw mode', icon: 'draw', run: () => (mode.value = 'draw') },
  { id: 'pdf', title: 'Export as PDF', icon: 'download', run: () => void saveAs('pdf') },
  { id: 'docx', title: 'Export as Word', icon: 'download', run: () => void saveAs('docx') },
  { id: 'md', title: 'Export as Markdown', icon: 'download', run: () => exportNoteAsText(documentStore.doc, 'md') },
  { id: 'txt', title: 'Export as text', icon: 'download', run: () => exportNoteAsText(documentStore.doc, 'txt') },
  { id: 'html', title: 'Export as HTML', icon: 'download', run: () => exportNoteAsText(documentStore.doc, 'html') },
  { id: 'png', title: 'Export page as image', icon: 'image', run: () => void savePageImage() },
  { id: 'keys', title: 'AI keys', icon: 'key', run: () => (showKey.value = true) },
  { id: 'undo', title: 'Undo', icon: 'undo', run: () => documentStore.undo() },
  { id: 'redo', title: 'Redo', icon: 'redo', run: () => documentStore.redo() },
  { id: 'theme-light', title: 'Theme: Light', icon: 'sun', run: () => settings.setTheme('light') },
  { id: 'theme-dark', title: 'Theme: Dark', icon: 'moon', run: () => settings.setTheme('dark') },
  { id: 'theme-system', title: 'Theme: System', icon: 'device', run: () => settings.setTheme('system') },
  { id: 'shortcuts', title: 'Keyboard shortcuts', hint: '?', run: () => (showShortcuts.value = true) },
  { id: 'welcome', title: 'Show welcome', icon: 'wand', run: () => (showWelcome.value = true) },
  { id: 'info', title: 'Note info', hint: 'words, reading time', run: () => (showInfo.value = true) },
  { id: 'whats-new', title: "What's new", run: () => (showWhatsNew.value = true) },
  { id: 'feedback', title: 'Send feedback', icon: 'send', run: sendFeedback },
])

// Whether the keyboard focus sits somewhere that owns the keystroke, so app shortcuts that
// are bare letters do not fire while the reader is typing.
function inTextEntry(): boolean {
  const el = document.activeElement as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

function onKeydown(event: KeyboardEvent) {
  // A quiet way to reach any action from the keyboard, from anywhere including inside a line.
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    showPalette.value = !showPalette.value
    return
  }
  // A bare question mark opens the shortcut list, as long as the reader is not typing one.
  if (event.key === '?' && !inTextEntry()) {
    event.preventDefault()
    showShortcuts.value = true
    return
  }
  if (event.key === 'Escape' && drawerOpen.value) {
    drawerOpen.value = false
    return
  }
  if (event.key === 'Escape' && documentStore.allSelected) {
    documentStore.clearWholeNote()
    return
  }
  if (event.key === 'Escape' && documentStore.lineSelection) {
    documentStore.clearLineSelection()
    return
  }
  const meta = event.metaKey || event.ctrlKey
  if (!meta || (event.key.toLowerCase() !== 'z' && event.key.toLowerCase() !== 'y')) return
  const tag = (document.activeElement as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  event.preventDefault()
  const redo = event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)
  if (redo) documentStore.redo()
  else documentStore.undo()
}

function askAiWholeNote() {
  documentStore.clearWholeNote()
  showCompose.value = true
}

onMounted(() => {
  fit()
  void refreshConnections()
  try {
    if (!localStorage.getItem(WELCOMED_KEY)) showWelcome.value = true
  } catch {
    // Without storage the welcome just opens each visit, which is harmless.
  }
})
window.addEventListener('resize', fit)
window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => {
  window.removeEventListener('resize', fit)
  window.removeEventListener('keydown', onKeydown)
})

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
  <div class="app-root">
    <a class="skip-link" href="#main-notes">Skip to notes</a>
    <Transition name="scrim">
      <div v-if="drawerOpen" class="drawer-scrim hide-desktop" @click="drawerOpen = false" />
    </Transition>
    <aside class="drawer hide-desktop" :class="{ open: drawerOpen }" aria-label="Menu">
      <NavDrawer
        :exporting="exporting"
        @home="drawerHome"
        @new="drawerNew"
        @save-pdf="drawerSave('pdf')"
        @save-docx="drawerSave('docx')"
        @api-key="drawerKey"
        @compose="drawerCompose"
      />
    </aside>

    <!-- The menu toggle rides with the drawer instead of being carried off on the pushed
         page: at rest it sits at the top left; opening carries it to the drawer's right
         edge; tapping it opens or closes the menu. Phone only. -->
    <button
      v-if="!overlayOpen"
      class="menu-toggle hide-desktop"
      :class="{ open: drawerOpen }"
      :aria-label="drawerOpen ? 'Close menu' : 'Open menu'"
      @click="drawerOpen = !drawerOpen"
    >
      <Icon name="menu" :size="22" />
    </button>

    <div class="app surface" :class="{ pushed: drawerOpen }">
      <header class="topbar">
        <div class="left">
          <button class="icon-btn hide-mobile" title="All notes" @click="showHome = true">
            <Icon name="grid" :size="18" />
          </button>
          <button class="icon-btn hide-mobile" title="New note" @click="newNote">
            <Icon name="plus" :size="18" />
          </button>
          <button
            class="icon-btn hide-mobile"
            title="Undo"
            :disabled="!documentStore.canUndo"
            @click="documentStore.undo()"
          >
            <Icon name="undo" :size="18" />
          </button>
          <button
            class="icon-btn hide-mobile"
            title="Redo"
            :disabled="!documentStore.canRedo"
            @click="documentStore.redo()"
          >
            <Icon name="redo" :size="18" />
          </button>
        </div>

        <div class="center">
          <input v-model="title" class="doc-title" spellcheck="false" aria-label="Document title" />
          <span class="pages">{{ pageCount }} {{ pageCount === 1 ? 'page' : 'pages' }}</span>
        </div>

        <div class="right">
          <button
            class="icon-btn hide-desktop"
            title="Undo"
            :disabled="!documentStore.canUndo"
            @click="documentStore.undo()"
          >
            <Icon name="undo" :size="18" />
          </button>
          <button
            class="icon-btn hide-desktop"
            title="Redo"
            :disabled="!documentStore.canRedo"
            @click="documentStore.redo()"
          >
            <Icon name="redo" :size="18" />
          </button>
          <HandwritingPicker class="hide-mobile" />
          <Popover align="right" class="hide-mobile">
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
          <Popover align="right" class="hide-mobile">
            <template #trigger>
              <button class="icon-btn" title="Appearance"><Icon :name="themeIcon" :size="18" /></button>
            </template>
            <template #default>
              <div class="theme-menu">
                <div class="theme-menu-label">Appearance</div>
                <ThemeSwitch />
              </div>
            </template>
          </Popover>
          <button class="icon-btn hide-mobile" title="Claude API key" @click="showKey = true">
            <Icon name="key" :size="18" />
          </button>
          <button v-if="generating" class="chip primary stop" title="Stop the AI" @click="stop">
            <Icon name="stop" :size="18" /><span class="chip-text">Stop</span>
          </button>
          <button v-else class="chip primary" title="Write with AI" @click="showCompose = true">
            <Icon name="wand" :size="18" /><span class="chip-text">Write with AI</span>
          </button>
        </div>
      </header>

      <main
        id="main-notes"
        class="stack"
        tabindex="-1"
        aria-label="Note pages"
        :class="{ 'all-selected': documentStore.allSelected }"
      >
        <div
          v-for="(page, i) in documentStore.doc.pages"
          :key="page.id"
          class="page-wrap"
          @contextmenu="openPageMenu(i, $event)"
        >
          <NotePage :page="page" :page-index="i" :width-px="pageWidth" :mode="mode" />
          <div class="page-num">
            <span>Page {{ i + 1 }} of {{ pageCount }}</span>
            <button class="page-more" title="Page actions" @click="openPageMenu(i, $event)">
              <Icon name="dots" :size="16" />
            </button>
          </div>
        </div>
        <button class="add-page" @click="addPage"><Icon name="pageAdd" :size="18" /> Add page</button>
      </main>

      <Transition name="fade">
        <div v-if="pageMenu" class="page-menu-scrim" @click="closePageMenu" @contextmenu.prevent="closePageMenu">
          <div class="page-menu" :style="{ left: `${pageMenu.x}px`, top: `${pageMenu.y}px` }" @click.stop>
            <button @click="pageAction((i) => documentStore.setActivePage(documentStore.addPageAfter(i)))">
              <Icon name="pageAdd" :size="17" /><span>Add page after</span>
            </button>
            <button @click="pageAction((i) => documentStore.setActivePage(documentStore.duplicatePage(i)))">
              <Icon name="copy" :size="17" /><span>Duplicate page</span>
            </button>
            <template v-if="pageCount > 1">
              <div class="sep" />
              <button class="danger" @click="pageAction((i) => documentStore.deletePage(i))">
                <Icon name="trash" :size="17" /><span>Delete page</span>
              </button>
            </template>
          </div>
        </div>
      </Transition>

      <div class="dock-wrap">
        <EditorBar :mode="mode" @update:mode="mode = $event" />
      </div>

      <div class="live-wrap">
        <AiStatus :phase="phase" :name="providerName" />
      </div>

      <Transition name="toast">
        <div v-if="aiError" class="toast" @click="aiError = null">
          <Icon name="close" :size="15" />
          <span>{{ aiError }}</span>
        </div>
      </Transition>

      <SelectionMenu />
      <AiCursor />
      <Transition name="toast">
        <WholeNoteBar
          v-if="documentStore.allSelected"
          @ask-ai="askAiWholeNote"
          @clear="documentStore.clearWholeNote()"
        />
      </Transition>
      <Transition name="toast">
        <LineSelectionBar v-if="documentStore.lineSelection" />
      </Transition>

      <!-- While the menu is open the pushed page is a tap target that closes it. -->
      <button
        v-if="drawerOpen"
        class="surface-backdrop hide-desktop"
        aria-label="Close menu"
        @click="drawerOpen = false"
      />
    </div>

    <!-- The connect dialog reads as a step in front of the compose panel, not a second
         modal on top of it: the panel is kept mounted so a draft survives, but hidden while
         the dialog is open so the two never stack or compete. -->
    <ComposeSheet
      v-if="showCompose"
      v-show="!showKey"
      :has-content="noteHasContent"
      @close="showCompose = false"
      @needs-key="showKey = true"
      @submit="onSubmit"
    />
    <ApiKeyDialog v-if="showKey" @close="showKey = false" />

    <CommandPalette v-if="showPalette" :commands="commands" @close="showPalette = false" />

    <ShortcutsSheet v-if="showShortcuts" @close="showShortcuts = false" />

    <WelcomeSheet v-if="showWelcome" @close="dismissWelcome" />

    <WhatsNewSheet v-if="showWhatsNew" @close="showWhatsNew = false" />

    <NoteInfo v-if="showInfo" @close="showInfo = false" />

    <Transition name="home-fade">
      <HomeScreen v-if="showHome" @close="showHome = false" />
    </Transition>
  </div>
</template>

<style scoped>
.app-root {
  position: relative;
  height: 100%;
  overflow-x: clip;
  background: var(--desk-3);
  --drawer-w: min(84vw, 320px);
}
.drawer {
  position: fixed;
  inset-block: 0;
  left: 0;
  width: var(--drawer-w);
  z-index: 70;
  transform: translateX(-100%);
  transition: transform 0.32s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
}
.drawer.open {
  transform: translateX(0);
  box-shadow: 10px 0 40px rgba(0, 0, 0, 0.32);
}
/* Rides on the same curve as the drawer and the page push, so the three read as one
   motion. Open, it rests just inside the drawer's right edge. */
.menu-toggle {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 72;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: calc(max(8px, env(safe-area-inset-top)) + 46px);
  padding-top: max(8px, env(safe-area-inset-top));
  /* No border and no fill of its own on the bar: it shows the top bar straight through
     so it is indistinguishable from it, leaving only the icon to tap. Open, it takes the
     drawer's surface so it blends into the sidebar the same way. */
  border: none;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  transition: transform 0.32s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
  -webkit-tap-highlight-color: transparent;
}
.menu-toggle.open {
  background: var(--surface);
  transform: translateX(calc(var(--drawer-w) - 56px));
}
.drawer-scrim {
  position: fixed;
  inset: 0;
  z-index: 65;
  background: var(--scrim);
}
.surface-backdrop {
  position: absolute;
  inset: 0;
  z-index: 60;
  border: none;
  background: transparent;
}
.app,
.surface {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(1200px 600px at 50% -10%, var(--desk-1), transparent),
    linear-gradient(180deg, var(--desk-2), var(--desk-3));
  transition:
    transform 0.32s cubic-bezier(0.4, 0, 0.2, 1),
    border-radius 0.32s ease;
}
.topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  padding: 10px 18px;
  padding-top: max(10px, env(safe-area-inset-top));
  background: var(--topbar-bg);
  backdrop-filter: blur(18px) saturate(1.4);
  border-bottom: 1px solid var(--border-subtle);
  z-index: 30;
}
.left {
  display: flex;
  align-items: center;
  gap: 9px;
}
.logo {
  flex-shrink: 0;
}
.brand {
  font-weight: 700;
  color: var(--brand);
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
  color: var(--text);
  font-family: inherit;
  text-align: center;
  max-width: 44vw;
  padding: 3px 8px;
  border-radius: 8px;
}
.doc-title:focus {
  outline: none;
  background: var(--surface-sunken);
}
.pages {
  font-size: 11px;
  color: var(--text-muted);
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
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 10px;
  padding: 8px 13px;
  cursor: pointer;
  color: var(--text);
  font-size: 14px;
  white-space: nowrap;
}
.chip:hover {
  background: var(--accent-wash);
}
.chip.primary {
  border: none;
  color: #fff;
  background: var(--accent-grad);
  box-shadow: 0 3px 12px var(--accent-shadow);
}
/* During a run the same slot offers Stop, in a warm red so ending the writing is obvious and
   always one tap away even though the status badge steps aside. */
.chip.primary.stop {
  background: linear-gradient(135deg, #d1544f, #b73b3a);
  box-shadow: 0 3px 12px rgba(183, 59, 58, 0.4);
}
.chip:disabled {
  opacity: 0.55;
  cursor: default;
}
.icon-btn {
  display: inline-flex;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 10px;
  padding: 8px;
  cursor: pointer;
  color: var(--text);
}
.icon-btn:hover {
  background: var(--accent-wash);
}
.icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.icon-btn:disabled:hover {
  background: var(--surface);
}
.theme-menu {
  padding: 10px;
  min-width: 240px;
}
.theme-menu-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: 2px 4px 8px;
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
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.page-more {
  display: inline-flex;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: 7px;
  padding: 3px;
  cursor: pointer;
}
.page-more:hover {
  background: var(--surface-sunken);
  color: var(--text);
}
.page-menu-scrim {
  position: fixed;
  inset: 0;
  z-index: 60;
}
.page-menu {
  position: fixed;
  transform: translate(-6px, 6px);
  min-width: 190px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 13px;
  padding: 6px;
  box-shadow: var(--menu-shadow);
}
.page-menu button {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  border: none;
  background: transparent;
  border-radius: 9px;
  padding: 10px 11px;
  cursor: pointer;
  color: var(--text);
  font-size: 14px;
  text-align: left;
}
.page-menu button:hover {
  background: var(--accent-wash-2);
}
.page-menu button.danger {
  color: var(--danger);
}
.page-menu button.danger:hover {
  background: var(--danger-wash);
}
.page-menu .sep {
  height: 1px;
  background: var(--border);
  margin: 5px 8px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.12s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.add-page {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px dashed var(--border);
  background: color-mix(in srgb, var(--surface) 35%, transparent);
  border-radius: 12px;
  padding: 13px 22px;
  color: var(--text-soft);
  cursor: pointer;
  font-size: 14px;
}
.add-page:hover {
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  color: var(--text);
}
.dock-wrap {
  position: fixed;
  left: 50%;
  bottom: max(18px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 40;
}
.live-wrap {
  position: fixed;
  left: 50%;
  bottom: calc(max(18px, env(safe-area-inset-bottom)) + 78px);
  transform: translateX(-50%);
  z-index: 45;
}
.live-pop-enter-active,
.live-pop-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.live-pop-enter-from,
.live-pop-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}
.toast {
  position: fixed;
  top: calc(max(10px, env(safe-area-inset-top)) + 60px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(560px, 92vw);
  padding: 11px 16px;
  background: var(--danger);
  color: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 34px rgba(183, 59, 58, 0.35);
  font-size: 13px;
  cursor: pointer;
  z-index: 90;
}
.scrim-enter-active,
.scrim-leave-active {
  transition: opacity 0.28s ease;
}
.scrim-enter-from,
.scrim-leave-to {
  opacity: 0;
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}
.home-fade-enter-active,
.home-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.home-fade-enter-from,
.home-fade-leave-to {
  opacity: 0;
  transform: scale(1.01);
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
  color: var(--text);
  font-size: 14px;
  text-align: left;
}
.menu-item:hover {
  background: var(--accent-wash-2);
}

/* The drawer and its toggle belong to the phone; the desktop keeps its full top bar. */
@media (min-width: 721px) {
  .hide-desktop {
    display: none !important;
  }
}

@media (max-width: 720px) {
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
    /* Leave room at the left for the floating menu toggle that sits over the bar. */
    padding-left: 60px;
    gap: 8px;
    grid-template-columns: auto 1fr auto;
  }
  .left {
    gap: 4px;
  }
  .doc-title {
    max-width: 46vw;
  }
  .stack {
    padding: 16px 8px 150px;
    gap: 22px;
  }
  /* Push-drawer: the whole page eases aside and shrinks to a card as the menu slides
     in over the desk behind it. The transform makes the surface the containing block
     for its fixed dock and bars, so they ride along as one motion. */
  .surface.pushed {
    transform: translateX(var(--drawer-w)) scale(0.94);
    transform-origin: left center;
    border-radius: 22px;
    overflow: hidden;
    box-shadow: 0 0 60px rgba(0, 0, 0, 0.5);
  }
}
</style>
