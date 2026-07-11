// Continuous local persistence. Every note, the library index, the settings, the API
// key, and attachment blobs live in IndexedDB so a crash, refresh, or going offline
// never loses work. Each note is stored under its own id; a small index lists them for
// the home screen. Writes are debounced; the first load hydrates the stores before the
// app renders.
import { openDB, type IDBPDatabase } from 'idb'
import type { LibraryEntry, NoteDocument, ProviderId, Settings } from '@/types'
import { useDocument } from './document'
import { useSettings } from './settings'
import { useLibrary } from './library'

const DB_NAME = 'handwriting-notes'
const DB_VERSION = 1
const SETTINGS_KEY = 'current'
const API_KEY_KEY = 'anthropic-api-key'
const LIBRARY_KEY = 'library'
const CURRENT_ID_KEY = 'current-note-id'
const VERSION_KEY = 'schema-version'
// Notes carry the shape they were written with. The library format is version 3; a note
// from an earlier shape is migrated in, and a malformed note is skipped rather than
// rendered, so a stored note can never blank the page.
const SCHEMA_VERSION = 3

interface Stores {
  document: NoteDocument
  settings: Settings
  blobs: Blob
  meta: string | LibraryEntry[]
}

let dbPromise: Promise<IDBPDatabase<Stores>> | null = null

function db(): Promise<IDBPDatabase<Stores>> {
  if (!dbPromise) {
    dbPromise = openDB<Stores>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        database.createObjectStore('document')
        database.createObjectStore('settings')
        database.createObjectStore('blobs')
        database.createObjectStore('meta')
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
  const keys = await database.getAllKeys('blobs')
  const blobs: { key: string; mime: string; data: string }[] = []
  for (const key of keys) {
    const blob = await database.get('blobs', key as string)
    if (blob) blobs.push({ key: key as string, mime: blob.type, data: await blobToBase64(blob) })
  }
  return { app: 'handwriting-notes', version: 1, exportedAt: Date.now(), notes, library, blobs }
}

// Restore a backup, merging it into whatever is already saved: notes and blobs are written by id
// (a matching id is overwritten), and library rows are merged so nothing already there is lost.
export async function importAll(data: {
  notes?: NoteDocument[]
  library?: LibraryEntry[]
  blobs?: { key: string; mime: string; data: string }[]
}): Promise<void> {
  const database = await db()
  for (const note of data.notes ?? []) if (isValidDocument(note)) await database.put('document', plain(note), note.id)
  const existing = ((await database.get('meta', LIBRARY_KEY)) ?? []) as LibraryEntry[]
  const byId = new Map(existing.map((e) => [e.id, e]))
  for (const e of data.library ?? []) byId.set(e.id, e)
  await database.put('meta', plain([...byId.values()]), LIBRARY_KEY)
  for (const b of data.blobs ?? []) {
    const bytes = Uint8Array.from(atob(b.data), (c) => c.charCodeAt(0))
    await database.put('blobs', new Blob([bytes], { type: b.mime }), b.key)
  }
}

export async function saveNote(doc: NoteDocument): Promise<void> {
  await (await db()).put('document', plain(doc), doc.id)
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

  // Open the most recent note, or start a fresh one if the library is empty.
  let currentId = await loadCurrentId()
  let openDoc: NoteDocument | undefined
  if (currentId) openDoc = await loadNote(currentId)
  if (!openDoc && entries.length) openDoc = await loadNote(entries[0].id)
  if (!openDoc) {
    openDoc = documentStore.doc
    entries = [entryFor(openDoc), ...entries]
    await saveNote(openDoc)
  }
  currentId = openDoc.id

  documentStore.hydrate(openDoc)
  libraryStore.hydrate(entries, currentId)
  await saveLibrary(entries)
  await saveCurrentId(currentId)

  const persistDoc = debounce((doc: NoteDocument) => {
    void saveNote(doc)
    libraryStore.touch(doc.id, doc.title, doc.updatedAt)
  }, 400)
  const persistSettings = debounce((settings: Settings) => void saveSettings(settings), 300)
  const persistLibrary = debounce((list: LibraryEntry[]) => void saveLibrary(list), 300)
  // Group a burst of typing into one undo step by recording once it settles.
  const recordHistory = debounce(() => documentStore.recordHistory(), 500)

  documentStore.$subscribe((_m, state) => {
    persistDoc(state.doc)
    recordHistory()
  })
  settingsStore.$subscribe((_m, state) => persistSettings(state))
  libraryStore.$subscribe((_m, state) => {
    persistLibrary(state.entries)
    void saveCurrentId(state.currentId)
  })
}
