<script setup lang="ts">
// The start screen: a calm place to begin a new note or return to one. It opens with a
// row of templates, then the notes as ruled cards under Recent and Favourites, each
// with a star and a small menu to open, rename, duplicate, or delete. Choosing a note
// or a template opens it in the editor.
import { computed, nextTick, onMounted, ref } from 'vue'
import type { LibraryEntry } from '@/types'
import { useLibrary } from '@/store/library'
import { templates } from '@/content/blankDocument'
import { buildSearchIndex, useNoteSearch } from './noteSearch'
import NoteThumbnail from './NoteThumbnail.vue'
import Icon from '@/ui/Icon.vue'
import Popover from '@/ui/Popover.vue'

const emit = defineEmits<{ (e: 'close'): void }>()
const library = useLibrary()
const { matches, snippet } = useNoteSearch()

const tab = ref<'recent' | 'favorites' | 'archive' | 'trash'>('recent')
const sortMode = ref<'updated' | 'created' | 'az' | 'za'>('updated')
const query = ref('')
const renamingId = ref<string | null>(null)
const renameInput = ref<HTMLInputElement | null>(null)

// Read every note's words into the search index when the library opens, so a search reaches note
// contents and not only titles.
onMounted(() => void buildSearchIndex())

const activeTag = ref<string | null>(null)

// Which folder the recent view is looking inside; null is the top level. Folders only shape
// the recent tab; favourites, archive, and trash stay flat across the whole library.
const currentFolder = ref<string | null>(null)
const breadcrumb = computed(() => library.folderPath(currentFolder.value))
const subfolders = computed(() => library.foldersIn(currentFolder.value))
// Folders are browsed only when there is nothing narrowing the view; a search or a tag filter
// looks across every folder at once so a match is never hidden inside a closed folder.
const browsingFolders = computed(() => tab.value === 'recent' && !query.value.trim() && !activeTag.value)

const renamingFolderId = ref<string | null>(null)
const folderRenameInput = ref<HTMLInputElement | null>(null)

// How many notes and subfolders a folder holds, shown on its card so an empty one is obvious.
function folderCount(id: string): number {
  const notes = library.recent.filter((e) => (e.folderId ?? null) === id).length
  return notes + library.foldersIn(id).length
}

function openFolder(id: string | null) {
  currentFolder.value = id
}
async function makeFolder() {
  const id = library.createFolder('New folder', currentFolder.value)
  renamingFolderId.value = id
  await nextTick()
  folderRenameInput.value?.focus()
  folderRenameInput.value?.select()
}
async function startFolderRename(id: string) {
  renamingFolderId.value = id
  await nextTick()
  folderRenameInput.value?.focus()
  folderRenameInput.value?.select()
}
function commitFolderRename(id: string) {
  if (folderRenameInput.value) library.renameFolder(id, folderRenameInput.value.value)
  renamingFolderId.value = null
}
function removeFolder(id: string) {
  const parent = library.folderById(id)?.parentId ?? null
  library.deleteFolder(id)
  if (currentFolder.value === id) currentFolder.value = parent
}

// Order a list by the chosen sort, always floating pinned notes to the top so a pin holds
// wherever the sort would otherwise put the note.
function sortList(list: LibraryEntry[]): LibraryEntry[] {
  const by: Record<typeof sortMode.value, (a: LibraryEntry, b: LibraryEntry) => number> = {
    updated: (a, b) => b.updatedAt - a.updatedAt,
    created: (a, b) => b.createdAt - a.createdAt,
    az: (a, b) => a.title.localeCompare(b.title),
    za: (a, b) => b.title.localeCompare(a.title),
  }
  return [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || by[sortMode.value](a, b))
}

// Whether the current tab is one of the filed-away views, which share a compact card.
const filed = computed(() => tab.value === 'trash' || tab.value === 'archive')

const shown = computed(() => {
  if (tab.value === 'trash') return library.trash
  if (tab.value === 'archive') return sortList(library.archived)
  let list = tab.value === 'favorites' ? library.favorites : library.recent
  if (browsingFolders.value) list = list.filter((e) => (e.folderId ?? null) === currentFolder.value)
  if (activeTag.value) list = list.filter((e) => (e.tags ?? []).includes(activeTag.value!))
  const q = query.value.trim()
  if (q) list = list.filter((e) => matches(e.id, e.title, q))
  return sortList(list)
})

// Every folder as a flat, indented list, for the move-to menu on a note.
const folderChoices = computed(() => {
  const out: { id: string; label: string }[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of library.foldersIn(parentId)) {
      out.push({ id: folder.id, label: `${' '.repeat(depth)}${folder.name}` })
      walk(folder.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})
const newTag = ref('')
function addTag(id: string) {
  const t = newTag.value.trim()
  if (t) library.toggleTag(id, t)
  newTag.value = ''
}
// A short excerpt for a searched note, shown under its title so a match is explained.
function excerptFor(id: string): string {
  return query.value.trim() ? snippet(id, query.value) : ''
}

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
  // A note started while browsing a folder is filed there, so it lands where the writer is.
  await library.createNote(key, browsingFolders.value ? currentFolder.value : null)
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
        <input v-model="query" placeholder="Search notes and their contents" spellcheck="false" />
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
          <button :class="{ on: tab === 'archive' }" @click="tab = 'archive'">
            <Icon name="archive" :size="15" /> Archive
            <span v-if="library.archived.length" class="count">{{ library.archived.length }}</span>
          </button>
          <button :class="{ on: tab === 'trash' }" @click="tab = 'trash'">
            <Icon name="trash" :size="15" /> Trash
            <span v-if="library.trash.length" class="count">{{ library.trash.length }}</span>
          </button>
          <div v-if="tab !== 'trash'" class="sort">
            <label>Sort</label>
            <select v-model="sortMode">
              <option value="updated">Last edited</option>
              <option value="created">Date created</option>
              <option value="az">Title A–Z</option>
              <option value="za">Title Z–A</option>
            </select>
          </div>
        </div>

        <div v-if="tab === 'trash' && library.trash.length" class="trash-bar">
          <span>Notes here are removed for good after 30 days.</span>
          <button class="empty-trash" @click="library.emptyTrash()">Empty trash now</button>
        </div>

        <div v-if="tab !== 'trash' && library.allTags.length" class="tag-filter">
          <button class="tag-chip" :class="{ on: !activeTag }" @click="activeTag = null">All</button>
          <button
            v-for="t in library.allTags"
            :key="t"
            class="tag-chip"
            :class="{ on: activeTag === t }"
            @click="activeTag = activeTag === t ? null : t"
          >
            #{{ t }}
          </button>
        </div>

        <!-- Folder navigation, only while browsing the recent tab. A breadcrumb walks back up,
             and a row of subfolders sits above the notes in the current folder. -->
        <div v-if="browsingFolders" class="folder-bar">
          <nav class="crumbs">
            <button class="crumb" :class="{ on: currentFolder === null }" @click="openFolder(null)">
              <Icon name="home" :size="14" /> All notes
            </button>
            <template v-for="f in breadcrumb" :key="f.id">
              <Icon name="chevronRight" :size="13" class="sep-i" />
              <button class="crumb" :class="{ on: currentFolder === f.id }" @click="openFolder(f.id)">
                {{ f.name }}
              </button>
            </template>
          </nav>
          <button class="new-folder" title="New folder" @click="makeFolder">
            <Icon name="folderPlus" :size="15" /> New folder
          </button>
        </div>

        <div v-if="browsingFolders && subfolders.length" class="folder-grid">
          <div v-for="f in subfolders" :key="f.id" class="folder-card">
            <button class="folder-open" @dblclick="openFolder(f.id)" @click="openFolder(f.id)">
              <Icon name="folder" :size="22" />
              <input
                v-if="renamingFolderId === f.id"
                ref="folderRenameInput"
                class="folder-rename"
                :value="f.name"
                @click.stop
                @blur="commitFolderRename(f.id)"
                @keydown.enter.prevent="commitFolderRename(f.id)"
              />
              <span v-else class="folder-name">{{ f.name }}</span>
              <span class="folder-count">{{ folderCount(f.id) }}</span>
            </button>
            <Popover align="right">
              <template #trigger>
                <button class="folder-more" title="Folder actions"><Icon name="dots" :size="15" /></button>
              </template>
              <template #default>
                <div class="menu">
                  <button class="menu-item" @click="openFolder(f.id)">
                    <Icon name="folder" :size="16" /><span>Open</span>
                  </button>
                  <button class="menu-item" @click="startFolderRename(f.id)">
                    <Icon name="write" :size="16" /><span>Rename</span>
                  </button>
                  <div class="sep" />
                  <button class="menu-item danger" @click="removeFolder(f.id)">
                    <Icon name="trash" :size="16" /><span>Delete folder</span>
                  </button>
                </div>
              </template>
            </Popover>
          </div>
        </div>

        <div v-if="shown.length" class="grid">
          <div v-for="e in shown" :key="e.id" class="card" :class="{ current: e.id === library.currentId && !filed }">
            <button v-if="tab === 'trash'" class="open dim" title="Restore" @click="library.restoreNote(e.id)">
              <NoteThumbnail :title="e.title" />
            </button>
            <button
              v-else-if="tab === 'archive'"
              class="open dim"
              title="Unarchive"
              @click="library.unarchiveNote(e.id)"
            >
              <NoteThumbnail :title="e.title" />
            </button>
            <button v-else class="open" @click="open(e.id)"><NoteThumbnail :title="e.title" /></button>

            <span v-if="!filed && e.pinned" class="pin-badge" title="Pinned"><Icon name="pin" :size="13" /></span>
            <button
              v-if="!filed"
              class="fav"
              :class="{ on: e.favorite }"
              :title="e.favorite ? 'Unfavourite' : 'Favourite'"
              @click.stop="library.toggleFavorite(e.id)"
            >
              <Icon :name="e.favorite ? 'starFilled' : 'star'" :size="16" />
            </button>

            <div v-if="tab === 'trash'" class="trash-card">
              <span class="name plain">{{ e.title || 'Untitled' }}</span>
              <span class="date">Deleted {{ when(e.deletedAt ?? 0) }}</span>
              <div class="trash-actions">
                <button class="tbtn" @click="library.restoreNote(e.id)">
                  <Icon name="arrowLeft" :size="14" /> Restore
                </button>
                <button class="tbtn danger" @click="library.purgeNote(e.id)">
                  <Icon name="trash" :size="14" /> Delete forever
                </button>
              </div>
            </div>

            <div v-else-if="tab === 'archive'" class="trash-card">
              <span class="name plain">{{ e.title || 'Untitled' }}</span>
              <span class="date">Archived {{ when(e.archivedAt ?? 0) }}</span>
              <div class="trash-actions">
                <button class="tbtn" @click="library.unarchiveNote(e.id)">
                  <Icon name="arrowLeft" :size="14" /> Unarchive
                </button>
                <button class="tbtn danger" @click="library.deleteNote(e.id)">
                  <Icon name="trash" :size="14" /> Delete
                </button>
              </div>
            </div>

            <div v-else class="meta">
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
                    <button class="menu-item" @click="library.togglePin(e.id)">
                      <Icon name="pin" :size="16" /><span>{{ e.pinned ? 'Unpin' : 'Pin to top' }}</span>
                    </button>
                    <button class="menu-item" @click="library.archiveNote(e.id)">
                      <Icon name="archive" :size="16" /><span>Archive</span>
                    </button>
                    <div class="sep" />
                    <div class="move-to">
                      <span class="move-label">Move to</span>
                      <button
                        class="menu-item small"
                        :class="{ on: (e.folderId ?? null) === null }"
                        @click="library.moveNoteToFolder(e.id, null)"
                      >
                        <Icon name="home" :size="15" /><span>Top level</span>
                      </button>
                      <button
                        v-for="c in folderChoices"
                        :key="c.id"
                        class="menu-item small"
                        :class="{ on: e.folderId === c.id }"
                        @click="library.moveNoteToFolder(e.id, c.id)"
                      >
                        <Icon name="folder" :size="15" /><span>{{ c.label }}</span>
                      </button>
                    </div>
                    <div class="sep" />
                    <div class="tag-editor">
                      <div v-if="(e.tags ?? []).length" class="tag-list">
                        <button
                          v-for="t in e.tags"
                          :key="t"
                          class="tag-chip small"
                          title="Remove tag"
                          @click="library.toggleTag(e.id, t)"
                        >
                          #{{ t }} ✕
                        </button>
                      </div>
                      <input
                        class="tag-input"
                        placeholder="Add a tag…"
                        :value="renamingId === e.id ? '' : newTag"
                        @focus="newTag = ''"
                        @input="newTag = ($event.target as HTMLInputElement).value"
                        @keydown.enter.prevent="addTag(e.id)"
                      />
                    </div>
                    <div class="sep" />
                    <button class="menu-item danger" @click="library.deleteNote(e.id)">
                      <Icon name="trash" :size="16" /><span>Delete</span>
                    </button>
                  </div>
                </template>
              </Popover>
            </div>
            <div v-if="!filed && (e.tags ?? []).length" class="card-tags">
              <span v-for="t in e.tags" :key="t" class="tag-chip small ghost">#{{ t }}</span>
            </div>
            <span v-if="!filed" class="date">{{ when(e.updatedAt) }}</span>
            <p v-if="!filed && excerptFor(e.id)" class="excerpt">{{ excerptFor(e.id) }}</p>
          </div>
        </div>

        <div v-else-if="!(browsingFolders && subfolders.length)" class="empty">
          <Icon
            :name="tab === 'favorites' ? 'star' : tab === 'archive' ? 'archive' : tab === 'trash' ? 'trash' : 'grid'"
            :size="26"
          />
          <p>
            {{
              tab === 'favorites'
                ? 'Star a note to keep it here.'
                : tab === 'archive'
                  ? 'Archive a note to file it away here.'
                  : tab === 'trash'
                    ? 'The trash is empty.'
                    : browsingFolders && currentFolder
                      ? 'This folder is empty. Start a note or add a folder.'
                      : 'No notes yet. Start one above.'
            }}
          </p>
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
    radial-gradient(1200px 600px at 50% -10%, var(--desk-1), transparent),
    linear-gradient(180deg, var(--desk-2), var(--desk-3));
}
.bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 20px;
  padding-top: max(12px, env(safe-area-inset-top));
  background: var(--topbar-bg);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border-subtle);
}
.back {
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
}
.back:hover {
  background: var(--accent-wash);
}
.search {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
  max-width: 340px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
}
.search input {
  border: none;
  outline: none;
  width: 100%;
  font-size: 14px;
  color: var(--text);
  font-family: inherit;
  background: transparent;
}
.search input::placeholder {
  color: var(--text-muted);
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 24px clamp(16px, 5vw, 56px) 60px;
}
h1 {
  margin: 6px 0 22px;
  font-size: 26px;
  color: var(--brand);
}
h2 {
  margin: 0 0 12px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
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
  background: var(--surface);
  display: grid;
  place-items: center;
  color: var(--accent);
  box-shadow:
    0 4px 16px rgba(51, 51, 76, 0.1),
    0 0 0 1px var(--border-subtle);
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
  overflow: hidden;
}
.template:hover .tpaper {
  transform: translateY(-3px);
  box-shadow:
    0 10px 26px rgba(51, 51, 76, 0.18),
    0 0 0 1px var(--border-subtle);
}
.tname {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-top: 4px;
}
.thint {
  font-size: 12px;
  color: var(--text-muted);
}
.tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  padding: 9px 12px;
  cursor: pointer;
  color: var(--text-soft);
  font-size: 15px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tabs button.on {
  color: var(--brand);
  border-bottom-color: var(--accent);
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
  box-shadow:
    0 4px 16px rgba(51, 51, 76, 0.1),
    0 0 0 1px var(--border-subtle);
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}
.open:hover {
  transform: translateY(-3px);
  box-shadow:
    0 10px 26px rgba(51, 51, 76, 0.18),
    0 0 0 1px var(--border-subtle);
}
.card.current .open {
  box-shadow:
    0 0 0 2px var(--accent),
    0 6px 18px var(--accent-shadow);
}
.fav {
  position: absolute;
  top: 8px;
  right: 8px;
  border: none;
  background: var(--surface);
  backdrop-filter: blur(4px);
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  cursor: pointer;
  box-shadow: 0 0 0 1px var(--border-subtle);
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
  color: var(--text);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rename {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 3px 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  background: var(--surface);
  font-family: inherit;
  outline: none;
}
.more {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 3px;
  border-radius: 7px;
}
.more:hover {
  background: var(--surface-sunken);
  color: var(--text);
}
.date {
  font-size: 12px;
  color: var(--text-muted);
}
.excerpt {
  margin: 3px 0 0;
  font-size: 12px;
  line-height: 1.35;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tag-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px 0 10px;
}
.tag-chip {
  border: none;
  border-radius: 999px;
  padding: 4px 11px;
  font-size: 12px;
  cursor: pointer;
  background: var(--accent-wash, rgba(74, 114, 176, 0.1));
  color: var(--ink, #33334c);
}
.tag-chip.on {
  background: var(--accent, #4a72b0);
  color: #fff;
}
.tag-chip.small {
  padding: 2px 8px;
  font-size: 11px;
}
.tag-chip.ghost {
  background: transparent;
  border: 1px solid var(--hairline, rgba(0, 0, 0, 0.12));
  color: var(--text-muted);
  cursor: default;
}
.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 4px 0 0;
}
.tag-editor {
  padding: 4px 8px;
}
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 5px;
}
.tag-input {
  width: 100%;
  box-sizing: border-box;
  border: none;
  outline: none;
  background: var(--accent-wash, rgba(74, 114, 176, 0.08));
  color: inherit;
  border-radius: 6px;
  padding: 6px 8px;
  font: inherit;
  font-size: 13px;
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
  color: var(--text);
  font-size: 14px;
  text-align: left;
}
.menu-item:hover {
  background: var(--accent-wash-2);
}
.menu-item.danger {
  color: var(--danger);
}
.menu-item.danger:hover {
  background: var(--danger-wash);
}
.sep {
  height: 1px;
  background: var(--border);
  margin: 5px 8px;
}
.folder-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.crumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
}
.crumb {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 8px;
}
.crumb:hover {
  background: var(--surface-sunken);
  color: var(--text);
}
.crumb.on {
  color: var(--text);
  font-weight: 600;
}
.sep-i {
  color: var(--text-muted);
  opacity: 0.6;
}
.new-folder {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 9px;
  padding: 7px 12px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.new-folder:hover {
  background: var(--accent-wash);
}
.folder-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 22px;
}
.folder-card {
  position: relative;
  display: flex;
  align-items: center;
}
.folder-open {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border-subtle);
  background: var(--surface);
  border-radius: 10px;
  padding: 12px 40px 12px 12px;
  cursor: pointer;
  color: var(--accent);
  text-align: left;
  box-shadow: 0 2px 8px rgba(51, 51, 76, 0.06);
}
.folder-open:hover {
  background: var(--accent-wash);
}
.folder-name {
  flex: 1;
  min-width: 0;
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.folder-rename {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 3px 6px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  background: var(--surface);
  outline: none;
}
.folder-count {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 600;
}
.folder-more {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 7px;
}
.folder-more:hover {
  background: var(--surface-sunken);
  color: var(--text);
}
.move-to {
  padding: 2px 0;
  max-height: 190px;
  overflow-y: auto;
}
.move-label {
  display: block;
  padding: 4px 10px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.menu-item.small {
  padding: 7px 10px;
  font-size: 13px;
}
.menu-item.small.on {
  color: var(--accent);
  font-weight: 600;
}
.menu-item.small span {
  white-space: pre;
}
.sort {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
}
.sort select {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 8px;
  padding: 5px 8px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.pin-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--surface);
  color: var(--accent);
  box-shadow: 0 0 0 1px var(--border-subtle);
}
.count {
  display: inline-grid;
  place-items: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--surface-sunken);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
}
.trash-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--text-muted);
}
.empty-trash {
  border: 1px solid var(--danger, #c0392b);
  background: transparent;
  color: var(--danger, #c0392b);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}
.empty-trash:hover {
  background: var(--danger-wash, rgba(192, 57, 43, 0.1));
}
.open.dim {
  opacity: 0.7;
}
.open.dim:hover {
  opacity: 1;
}
.trash-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 8px;
}
.name.plain {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.trash-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.tbtn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 8px;
  padding: 5px 9px;
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
}
.tbtn:hover {
  background: var(--accent-wash);
}
.tbtn.danger {
  color: var(--danger, #c0392b);
  border-color: transparent;
}
.tbtn.danger:hover {
  background: var(--danger-wash, rgba(192, 57, 43, 0.1));
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 20px;
  color: var(--text-muted);
}
.empty p {
  margin: 0;
  font-size: 14px;
}

@media (max-width: 720px) {
  .bar {
    gap: 10px;
    padding: 10px 14px;
    padding-top: max(10px, env(safe-area-inset-top));
  }
  .back {
    /* Icon-only, but keep it a comfortable tap target. */
    padding: 10px 12px;
  }
  .back span {
    display: none;
  }
  .search {
    max-width: none;
    padding: 10px 12px;
  }
  .search input {
    font-size: 16px;
  }
  .scroll {
    padding: 18px 16px calc(60px + env(safe-area-inset-bottom));
    padding-left: max(16px, env(safe-area-inset-left));
    padding-right: max(16px, env(safe-area-inset-right));
  }
  h1 {
    margin: 4px 0 18px;
    font-size: 22px;
  }
  /* Templates scroll horizontally rather than cramming into a clipped grid. */
  .templates {
    display: flex;
    grid-template-columns: none;
    gap: 12px;
    margin-bottom: 28px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x mandatory;
    padding-bottom: 6px;
    margin-left: -2px;
    margin-right: -2px;
    padding-left: 2px;
    padding-right: 2px;
  }
  .template {
    flex: 0 0 132px;
    scroll-snap-align: start;
  }
  .tabs {
    flex-wrap: wrap;
  }
  .tabs button {
    flex: 1;
    justify-content: center;
    font-size: 15px;
    padding: 11px 8px;
  }
  .sort {
    flex-basis: 100%;
    margin-left: 0;
    justify-content: flex-end;
    padding: 6px 0;
  }
  /* Two roomy columns that fill the width with proper gutters. */
  .grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
  .fav {
    width: 32px;
    height: 32px;
  }
}

@media (max-width: 420px) {
  .grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }
  .template {
    flex-basis: 150px;
  }
}
</style>
