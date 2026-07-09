<script setup lang="ts">
// The start screen: a calm place to begin a new note or return to one. It opens with a
// row of templates, then the notes as ruled cards under Recent and Favourites, each
// with a star and a small menu to open, rename, duplicate, or delete. Choosing a note
// or a template opens it in the editor.
import { computed, nextTick, ref } from 'vue'
import { useLibrary } from '@/store/library'
import { templates } from '@/content/blankDocument'
import NoteThumbnail from './NoteThumbnail.vue'
import Icon from '@/ui/Icon.vue'
import Popover from '@/ui/Popover.vue'

const emit = defineEmits<{ (e: 'close'): void }>()
const library = useLibrary()

const tab = ref<'recent' | 'favorites'>('recent')
const query = ref('')
const renamingId = ref<string | null>(null)
const renameInput = ref<HTMLInputElement | null>(null)

const shown = computed(() => {
  const list = tab.value === 'favorites' ? library.favorites : library.recent
  const q = query.value.trim().toLowerCase()
  return q ? list.filter((e) => e.title.toLowerCase().includes(q)) : list
})

function when(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day === 1) return 'yesterday'
  if (day < 7) return `${day} days ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

async function newNote(key: string) {
  await library.createNote(key)
  emit('close')
}
async function open(id: string) {
  await library.openNote(id)
  emit('close')
}
async function startRename(id: string) {
  renamingId.value = id
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}
function commitRename(id: string) {
  if (renameInput.value) library.rename(id, renameInput.value.value)
  renamingId.value = null
}
</script>

<template>
  <div class="home">
    <header class="bar">
      <button class="back" title="Back to note" @click="emit('close')">
        <Icon name="arrowLeft" :size="18" /> Back to note
      </button>
      <div class="search">
        <Icon name="search" :size="16" />
        <input v-model="query" placeholder="Search notes" spellcheck="false" />
      </div>
    </header>

    <div class="scroll">
      <h1>Your notes</h1>

      <section class="new">
        <h2>Start something</h2>
        <div class="templates">
          <button v-for="t in templates" :key="t.key" class="template" @click="newNote(t.key)">
            <div class="tpaper">
              <Icon v-if="t.key === 'blank'" name="plus" :size="22" />
              <NoteThumbnail v-else :title="t.name" />
            </div>
            <span class="tname">{{ t.name }}</span>
            <span class="thint">{{ t.hint }}</span>
          </button>
        </div>
      </section>

      <section class="notes">
        <div class="tabs">
          <button :class="{ on: tab === 'recent' }" @click="tab = 'recent'">Recent</button>
          <button :class="{ on: tab === 'favorites' }" @click="tab = 'favorites'">
            <Icon name="star" :size="15" /> Favourites
          </button>
        </div>

        <div v-if="shown.length" class="grid">
          <div v-for="e in shown" :key="e.id" class="card" :class="{ current: e.id === library.currentId }">
            <button class="open" @click="open(e.id)"><NoteThumbnail :title="e.title" /></button>
            <button
              class="fav"
              :class="{ on: e.favorite }"
              :title="e.favorite ? 'Unfavourite' : 'Favourite'"
              @click.stop="library.toggleFavorite(e.id)"
            >
              <Icon :name="e.favorite ? 'starFilled' : 'star'" :size="16" />
            </button>
            <div class="meta">
              <input
                v-if="renamingId === e.id"
                ref="renameInput"
                class="rename"
                :value="e.title"
                @blur="commitRename(e.id)"
                @keydown.enter.prevent="commitRename(e.id)"
              />
              <button v-else class="name" @click="open(e.id)">{{ e.title || 'Untitled' }}</button>
              <Popover align="right">
                <template #trigger>
                  <button class="more" title="Note actions"><Icon name="dots" :size="16" /></button>
                </template>
                <template #default>
                  <div class="menu">
                    <button class="menu-item" @click="open(e.id)">
                      <Icon name="home" :size="16" /><span>Open</span>
                    </button>
                    <button class="menu-item" @click="startRename(e.id)">
                      <Icon name="write" :size="16" /><span>Rename</span>
                    </button>
                    <button class="menu-item" @click="library.duplicateNote(e.id)">
                      <Icon name="copy" :size="16" /><span>Duplicate</span>
                    </button>
                    <div class="sep" />
                    <button class="menu-item danger" @click="library.deleteNote(e.id)">
                      <Icon name="trash" :size="16" /><span>Delete</span>
                    </button>
                  </div>
                </template>
              </Popover>
            </div>
            <span class="date">{{ when(e.updatedAt) }}</span>
          </div>
        </div>

        <div v-else class="empty">
          <Icon :name="tab === 'favorites' ? 'star' : 'grid'" :size="26" />
          <p>{{ tab === 'favorites' ? 'Star a note to keep it here.' : 'No notes yet. Start one above.' }}</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.home {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(1200px 700px at 50% -10%, #f3eee3, transparent), linear-gradient(180deg, #ece7dc, #e6e0d3);
}
.bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 20px;
  padding-top: max(12px, env(safe-area-inset-top));
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(51, 51, 76, 0.07);
}
.back {
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
.back:hover {
  background: rgba(74, 114, 176, 0.08);
}
.search {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
  max-width: 340px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid rgba(51, 51, 76, 0.14);
  color: #9a9aa8;
}
.search input {
  border: none;
  outline: none;
  width: 100%;
  font-size: 14px;
  color: #33334c;
  font-family: inherit;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 24px clamp(16px, 5vw, 56px) 60px;
}
h1 {
  margin: 6px 0 22px;
  font-size: 26px;
  color: #29297e;
}
h2 {
  margin: 0 0 12px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9a9aa8;
}
.templates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 16px;
  margin-bottom: 36px;
}
.template {
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}
.tpaper {
  aspect-ratio: 3 / 4;
  border-radius: 10px;
  background: #fff;
  display: grid;
  place-items: center;
  color: #4a72b0;
  box-shadow: 0 4px 16px rgba(51, 51, 76, 0.1);
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
  overflow: hidden;
}
.template:hover .tpaper {
  transform: translateY(-3px);
  box-shadow: 0 10px 26px rgba(51, 51, 76, 0.18);
}
.tname {
  font-size: 14px;
  font-weight: 600;
  color: #33334c;
  margin-top: 4px;
}
.thint {
  font-size: 12px;
  color: #9a9aa8;
}
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(51, 51, 76, 0.1);
}
.tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  padding: 9px 12px;
  cursor: pointer;
  color: #6a6a80;
  font-size: 15px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tabs button.on {
  color: #29297e;
  border-bottom-color: #4a72b0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 20px;
}
.card {
  position: relative;
}
.open {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(51, 51, 76, 0.1);
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}
.open:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 26px rgba(51, 51, 76, 0.18);
}
.card.current .open {
  box-shadow:
    0 0 0 2px #4a72b0,
    0 6px 18px rgba(74, 114, 176, 0.28);
}
.fav {
  position: absolute;
  top: 8px;
  right: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(4px);
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  color: #9a9aa8;
  cursor: pointer;
}
.fav.on {
  color: #e8b22c;
}
.fav:hover {
  color: #e8b22c;
}
.meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
}
.name {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 14px;
  font-weight: 600;
  color: #33334c;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rename {
  flex: 1;
  min-width: 0;
  border: 1px solid #4a72b0;
  border-radius: 6px;
  padding: 3px 6px;
  font-size: 14px;
  font-weight: 600;
  color: #33334c;
  font-family: inherit;
  outline: none;
}
.more {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #9a9aa8;
  cursor: pointer;
  padding: 3px;
  border-radius: 7px;
}
.more:hover {
  background: rgba(51, 51, 76, 0.08);
  color: #33334c;
}
.date {
  font-size: 12px;
  color: #9a9aa8;
}
.menu {
  display: flex;
  flex-direction: column;
  padding: 6px;
  min-width: 170px;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: transparent;
  border-radius: 9px;
  padding: 9px 10px;
  cursor: pointer;
  color: #33334c;
  font-size: 14px;
  text-align: left;
}
.menu-item:hover {
  background: rgba(74, 114, 176, 0.1);
}
.menu-item.danger {
  color: #b73b3a;
}
.menu-item.danger:hover {
  background: rgba(183, 59, 58, 0.1);
}
.sep {
  height: 1px;
  background: rgba(51, 51, 76, 0.1);
  margin: 5px 8px;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 20px;
  color: #9a9aa8;
}
.empty p {
  margin: 0;
  font-size: 14px;
}

@media (max-width: 640px) {
  .back span {
    display: none;
  }
  .scroll {
    padding: 18px 14px 60px;
  }
}
</style>
