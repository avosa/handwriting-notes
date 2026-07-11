// Continuous local persistence. Every note, the library index, the settings, the API
// key, and attachment blobs live in IndexedDB so a crash, refresh, or going offline
// never loses work. Each note is stored under its own id; a small index lists them for
// the home screen. Writes are debounced; the first load hydrates the stores before the
// app renders.
import { openDB, type IDBPDatabase } from 'idb'
import type { Folder, LibraryEntry, NoteDocument, ProviderId, SavedSearch, Settings } from '@/types'
import { useDocument } from './document'
import { useSettings } from './settings'
import { useLibrary } from './library'

const DB_NAME = 'handwriting-notes'
const DB_VERSION = 4
const SETTINGS_KEY = 'current'
const API_KEY_KEY = 'anthropic-api-key'
const LIBRARY_KEY = 'library'
const FOLDERS_KEY = 'folders'
const SEARCHES_KEY = 'saved-searches'
const CURRENT_ID_KEY = 'current-note-id'
const VERSION_KEY = 'schema-version'
// Notes carry the shape they were written with. The library format is version 3; a note
// from an earlier shape is migrated in, and a malformed note is skipped rather than
// rendered, so a stored note can never blank the page.
const SCHEMA_VERSION = 3

/** A saved snapshot of a note at a moment in time, for the version history. */
export interface VersionRecord {
  id: string
  noteId: string
  ts: number
  title: string
  doc: NoteDocument
}

/** One block's on-device embedding, the unit of the local semantic index. Keyed by
 *  "noteId::blockId"; the hash lets an unchanged block be skipped on re-index. */
export interface VectorRecord {
  noteId: string
  blockId: string
  text: string
  hash: string
  vector: number[]
}

interface Stores {
  document: NoteDocument
  settings: Settings
  blobs: Blob
  meta: string | LibraryEntry[] | Folder[] | SavedSearch[]
  versions: VersionRecord
  vectors: VectorRecord
}

let dbPromise: Promise<IDBPDatabase<Stores>> | null = null

function db(): Promise<IDBPDatabase<Stores>> {
  if (!dbPromise) {
    dbPromise = openDB<Stores>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        // Create any store that is missing, by name rather than by version number. This is
        // self-healing: a database left in a partial state by an interrupted earlier upgrade
        // (for example a store that never got created) is repaired on the next open, instead of
        // being stuck missing a store its version says it should have.
        //   document/settings/blobs/meta — the originals
        //   versions — per-note history snapshots
        //   vectors  — the local semantic index, one embedding per block
        for (const name of ['document', 'settings', 'blobs', 'meta', 'versions', 'vectors'] as const) {
          if (!database.objectStoreNames.contains(name)) database.createObjectStore(name)
        }
      },
    })
  }
  return dbPromise
}

/** A structured deep clone, so Vue reactive proxies never reach IndexedDB. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isValidDocument(doc: unknown): doc is NoteDocument {
  if (!doc || typeof doc !== 'object') return false
  const pages = (doc as NoteDocument).pages
  if (!Array.isArray(pages)) return false
  return pages.every((page) =>
    Array.isArray(page.blocks) ? page.blocks.every((b) => b.type !== 'text' || Array.isArray(b.text?.runs)) : false,
  )
}

export async function loadNote(id: string): Promise<NoteDocument | undefined> {
  const doc = await (await db()).get('document', id)
  return isValidDocument(doc) ? doc : undefined
}

// Every saved note, for building the local search index. Only well-formed notes come back, so a
// stray record cannot break a search over the library.
export async function loadAllNotes(): Promise<NoteDocument[]> {
  const all = await (await db()).getAll('document')
  return all.filter(isValidDocument)
}

// A full, portable backup of the library: every note, the list, and the attachment blobs as
// base64. API keys are never included, so a backup is safe to store or move. Returns a plain
// object ready to be written to a file.
export async function exportAll(): Promise<object> {
  const { blobToBase64 } = await import('@/ai/attachmentEncoding')
  const database = await db()
  const notes = (await database.getAll('document')).filter(isValidDocument)
  const library = (await database.get('meta', LIBRARY_KEY)) ?? []
  const folders = (await database.get('meta', FOLDERS_KEY)) ?? []
  const searches = (await database.get('meta', SEARCHES_KEY)) ?? []
  const keys = await database.getAllKeys('blobs')
  const blobs: { key: string; mime: string; data: string }[] = []
  for (const key of keys) {
    const blob = await database.get('blobs', key as string)
    if (blob) blobs.push({ key: key as string, mime: blob.type, data: await blobToBase64(blob) })
  }
  return { app: 'handwriting-notes', version: 1, exportedAt: Date.now(), notes, library, folders, searches, blobs }
}

// Restore a backup, merging it into whatever is already saved: notes and blobs are written by id
// (a matching id is overwritten), and library rows are merged so nothing already there is lost.
export async function importAll(data: {
  notes?: NoteDocument[]
  library?: LibraryEntry[]
  folders?: Folder[]
  searches?: SavedSearch[]
  blobs?: { key: string; mime: string; data: string }[]
}): Promise<void> {
  const database = await db()
  for (const note of data.notes ?? []) if (isValidDocument(note)) await database.put('document', plain(note), note.id)
  const existing = ((await database.get('meta', LIBRARY_KEY)) ?? []) as LibraryEntry[]
  const byId = new Map(existing.map((e) => [e.id, e]))
  for (const e of data.library ?? []) byId.set(e.id, e)
  await database.put('meta', plain([...byId.values()]), LIBRARY_KEY)
  const existingFolders = ((await database.get('meta', FOLDERS_KEY)) ?? []) as Folder[]
  const foldersById = new Map(existingFolders.map((f) => [f.id, f]))
  for (const f of data.folders ?? []) foldersById.set(f.id, f)
  await database.put('meta', plain([...foldersById.values()]), FOLDERS_KEY)
  const existingSearches = ((await database.get('meta', SEARCHES_KEY)) ?? []) as SavedSearch[]
  const searchesById = new Map(existingSearches.map((s) => [s.id, s]))
  for (const s of data.searches ?? []) searchesById.set(s.id, s)
  await database.put('meta', plain([...searchesById.values()]), SEARCHES_KEY)
  for (const b of data.blobs ?? []) {
    const bytes = Uint8Array.from(atob(b.data), (c) => c.charCodeAt(0))
    await database.put('blobs', new Blob([bytes], { type: b.mime }), b.key)
  }
}

export async function saveNote(doc: NoteDocument): Promise<void> {
  await (await db()).put('document', plain(doc), doc.id)
}

// The most snapshots kept per note, and the least time between two automatic ones. Together
// these bound the history to a manageable timeline without recording every keystroke.
const MAX_VERSIONS = 40
const MIN_VERSION_GAP_MS = 3 * 60 * 1000

// Every stored snapshot for a note, newest first.
export async function listVersions(noteId: string): Promise<VersionRecord[]> {
  const all = await (await db()).getAll('versions')
  return all.filter((v) => v.noteId === noteId).sort((a, b) => b.ts - a.ts)
}

export async function getVersion(id: string): Promise<VersionRecord | undefined> {
  return (await db()).get('versions', id)
}

// Trim a note's history down to the newest MAX_VERSIONS, dropping the oldest beyond that.
async function pruneVersions(noteId: string): Promise<void> {
  const versions = await listVersions(noteId)
  const database = await db()
  for (const old of versions.slice(MAX_VERSIONS)) await database.delete('versions', old.id)
}

/**
 * Record a snapshot of a note. An automatic save is skipped when the newest snapshot is very
 * recent or the note is unchanged since it, so the history stays a timeline of real edits;
 * `force` records regardless, for a snapshot the writer asked for or one taken before a restore.
 * Returns whether a snapshot was actually written.
 */
export async function saveVersion(doc: NoteDocument, force = false): Promise<boolean> {
  const database = await db()
  const versions = await listVersions(doc.id)
  const latest = versions[0]
  if (!force && latest) {
    const tooSoon = doc.updatedAt - latest.ts < MIN_VERSION_GAP_MS
    const unchanged = JSON.stringify(latest.doc) === JSON.stringify(plain(doc))
    if (tooSoon || unchanged) return false
  }
  const ts = Date.now()
  const id = `${doc.id}:${ts}:${versions.length}`
  const record: VersionRecord = { id, noteId: doc.id, ts, title: doc.title, doc: plain(doc) }
  await database.put('versions', record, id)
  await pruneVersions(doc.id)
  return true
}

export async function deleteVersionsFor(noteId: string): Promise<void> {
  const database = await db()
  for (const v of await listVersions(noteId)) await database.delete('versions', v.id)
}

// --- Local semantic index storage -------------------------------------------------------------
// Each block's embedding lives under "noteId::blockId" so a note's vectors are easy to gather,
// refresh, and drop. Vectors never leave the device.
function vectorKey(noteId: string, blockId: string): string {
  return `${noteId}::${blockId}`
}

export async function putVector(record: VectorRecord): Promise<void> {
  await (await db()).put('vectors', plain(record), vectorKey(record.noteId, record.blockId))
}

export async function getAllVectors(): Promise<VectorRecord[]> {
  return (await db()).getAll('vectors')
}

export async function getNoteVectors(noteId: string): Promise<VectorRecord[]> {
  return (await getAllVectors()).filter((v) => v.noteId === noteId)
}

export async function deleteVector(noteId: string, blockId: string): Promise<void> {
  await (await db()).delete('vectors', vectorKey(noteId, blockId))
}

export async function deleteVectorsForNote(noteId: string): Promise<void> {
  const database = await db()
  const keys = (await database.getAllKeys('vectors')) as string[]
  for (const key of keys) {
    if (key.startsWith(`${noteId}::`)) await database.delete('vectors', key)
  }
}

// The keys of every attachment blob a note points at, across all its pages.
function blobRefsInDoc(doc: NoteDocument): string[] {
  const refs: string[] = []
  for (const page of doc.pages) {
    for (const block of page.blocks) {
      if (block.type === 'image' && block.blobRef) refs.push(block.blobRef)
    }
  }
  return refs
}

// Blob keys held in storage that no note or saved version points at any more — left behind when
// an image was removed or a note purged. Version snapshots count as references, so undoing a
// delete from the history never finds its picture gone.
export async function findOrphanBlobs(): Promise<string[]> {
  const database = await db()
  const referenced = new Set<string>()
  for (const doc of await database.getAll('document')) {
    if (isValidDocument(doc)) for (const ref of blobRefsInDoc(doc)) referenced.add(ref)
  }
  for (const version of await database.getAll('versions')) {
    for (const ref of blobRefsInDoc(version.doc)) referenced.add(ref)
  }
  const keys = (await database.getAllKeys('blobs')) as string[]
  return keys.filter((key) => !referenced.has(key))
}

// Delete every orphaned blob and report how many were freed.
export async function cleanupOrphanBlobs(): Promise<number> {
  const database = await db()
  const orphans = await findOrphanBlobs()
  for (const key of orphans) await database.delete('blobs', key)
  return orphans.length
}

// How much on-device storage the app is using and how much the browser allows, when it will say.
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate()
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
  }
  return null
}

// Ask the browser to keep this site's data from being evicted under pressure. Returns whether
// storage is persistent afterwards.
export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage?.persist) return navigator.storage.persist()
  return false
}

export async function isStoragePersisted(): Promise<boolean> {
  if (navigator.storage?.persisted) return navigator.storage.persisted()
  return false
}

export async function deleteNote(id: string): Promise<void> {
  await (await db()).delete('document', id)
}

export async function loadLibrary(): Promise<LibraryEntry[]> {
  const list = await (await db()).get('meta', LIBRARY_KEY)
  return Array.isArray(list) ? (list as LibraryEntry[]) : []
}

export async function saveLibrary(entries: LibraryEntry[]): Promise<void> {
  await (await db()).put('meta', plain(entries), LIBRARY_KEY)
}

export async function loadFolders(): Promise<Folder[]> {
  const list = await (await db()).get('meta', FOLDERS_KEY)
  return Array.isArray(list) ? (list as Folder[]) : []
}

export async function saveFolders(folders: Folder[]): Promise<void> {
  await (await db()).put('meta', plain(folders), FOLDERS_KEY)
}

export async function loadSavedSearches(): Promise<SavedSearch[]> {
  const list = await (await db()).get('meta', SEARCHES_KEY)
  return Array.isArray(list) ? (list as SavedSearch[]) : []
}

export async function saveSavedSearches(searches: SavedSearch[]): Promise<void> {
  await (await db()).put('meta', plain(searches), SEARCHES_KEY)
}

export async function loadCurrentId(): Promise<string | undefined> {
  const id = await (await db()).get('meta', CURRENT_ID_KEY)
  return typeof id === 'string' ? id : undefined
}

export async function saveCurrentId(id: string): Promise<void> {
  await (await db()).put('meta', id, CURRENT_ID_KEY)
}

export async function loadSettings(): Promise<Settings | undefined> {
  return (await db()).get('settings', SETTINGS_KEY) as Promise<Settings | undefined>
}

export async function saveSettings(settings: Settings): Promise<void> {
  await (await db()).put('settings', plain(settings), SETTINGS_KEY)
}

export async function putBlob(key: string, blob: Blob): Promise<void> {
  await (await db()).put('blobs', blob, key)
}
export async function getBlob(key: string): Promise<Blob | undefined> {
  return (await db()).get('blobs', key)
}
export async function deleteBlob(key: string): Promise<void> {
  await (await db()).delete('blobs', key)
}

// Each provider keeps its own key under its own name. Anthropic keeps the original name
// it has always used, so a key connected before other providers existed is still found.
function apiKeyName(provider: ProviderId): string {
  return provider === 'anthropic' ? API_KEY_KEY : `${provider}-api-key`
}
export async function loadApiKey(provider: ProviderId = 'anthropic'): Promise<string | undefined> {
  return (await db()).get('meta', apiKeyName(provider)) as Promise<string | undefined>
}
export async function saveApiKey(provider: ProviderId, key: string): Promise<void> {
  await (await db()).put('meta', key, apiKeyName(provider))
}
export async function clearApiKey(provider: ProviderId): Promise<void> {
  await (await db()).delete('meta', apiKeyName(provider))
}

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let handle: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    if (handle) clearTimeout(handle)
    handle = setTimeout(() => fn(...args), ms)
  }
}

function entryFor(doc: NoteDocument, favorite = false): LibraryEntry {
  return { id: doc.id, title: doc.title, createdAt: doc.createdAt, updatedAt: doc.updatedAt, favorite }
}

// Bring a note saved in the earlier single-note format into the library, so upgrading
// keeps the writer's work.
async function migrateSingleNote(database: IDBPDatabase<Stores>): Promise<LibraryEntry[]> {
  const old = await database.get('document', 'current')
  if (isValidDocument(old)) {
    await database.put('document', plain(old), old.id)
    await database.delete('document', 'current')
    await database.put('meta', old.id, CURRENT_ID_KEY)
    return [entryFor(old)]
  }
  return []
}

/**
 * Hydrate the stores from disk, then keep saving them as they change. Called once at
 * startup before the app is shown so restored work is on screen immediately.
 */
export async function installPersistence(): Promise<void> {
  const documentStore = useDocument()
  const settingsStore = useSettings()
  const libraryStore = useLibrary()
  const database = await db()

  const savedSettings = await loadSettings()
  if (savedSettings) settingsStore.hydrate(savedSettings)

  const version = await database.get('meta', VERSION_KEY)
  let entries: LibraryEntry[]
  if (version === String(SCHEMA_VERSION)) {
    entries = await loadLibrary()
  } else {
    entries = await migrateSingleNote(database)
    await database.put('meta', String(SCHEMA_VERSION), VERSION_KEY)
  }

  // Open the most recent live note, or start a fresh one if the library is empty. A note in
  // the trash is never reopened, so a device does not come back to a note the writer deleted.
  const live = entries.filter((e) => !e.deletedAt && !e.archivedAt)
  let currentId = await loadCurrentId()
  let openDoc: NoteDocument | undefined
  if (currentId && live.some((e) => e.id === currentId)) openDoc = await loadNote(currentId)
  if (!openDoc && live.length) openDoc = await loadNote(live[0].id)
  if (!openDoc) {
    openDoc = documentStore.doc
    entries = [entryFor(openDoc), ...entries]
    await saveNote(openDoc)
  }
  currentId = openDoc.id

  const folders = await loadFolders()
  const searches = await loadSavedSearches()

  documentStore.hydrate(openDoc)
  libraryStore.hydrate(entries, currentId, folders, searches)
  await saveLibrary(entries)
  await saveCurrentId(currentId)
  // Clear out notes that have sat in the trash past the grace period, so it never grows without
  // bound. Done after hydrate so the list on screen is already up.
  void libraryStore.purgeExpiredTrash()

  const persistDoc = debounce((doc: NoteDocument) => {
    void saveNote(doc)
    libraryStore.touch(doc.id, doc.title, doc.updatedAt)
  }, 400)
  const persistSettings = debounce((settings: Settings) => void saveSettings(settings), 300)
  const persistLibrary = debounce((list: LibraryEntry[]) => void saveLibrary(list), 300)
  const persistFolders = debounce((list: Folder[]) => void saveFolders(list), 300)
  const persistSearches = debounce((list: SavedSearch[]) => void saveSavedSearches(list), 300)
  // Group a burst of typing into one undo step by recording once it settles.
  const recordHistory = debounce(() => documentStore.recordHistory(), 500)

  documentStore.$subscribe((_m, state) => {
    persistDoc(state.doc)
    recordHistory()
  })
  settingsStore.$subscribe((_m, state) => persistSettings(state))
  libraryStore.$subscribe((_m, state) => {
    persistLibrary(state.entries)
    persistFolders(state.folders)
    persistSearches(state.savedSearches)
    void saveCurrentId(state.currentId)
  })
}
