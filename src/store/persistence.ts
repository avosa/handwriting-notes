// Continuous local persistence. The document, settings, the API key, and attachment
// blobs all live in IndexedDB so a crash, refresh, or going offline never loses work.
// Writes are debounced; the first load hydrates the stores before the app renders.
import { openDB, type IDBPDatabase } from 'idb'
import type { NoteDocument, Settings } from '@/types'
import { useDocument } from './document'
import { useSettings } from './settings'

const DB_NAME = 'handwriting-notes'
const DB_VERSION = 1
const DOC_KEY = 'current'
const SETTINGS_KEY = 'current'
const API_KEY_KEY = 'anthropic-api-key'
// The saved document carries the shape it was written with. A document from an earlier
// shape is ignored rather than rendered, so a stored note can never blank the page.
const SCHEMA_VERSION = 2
const VERSION_KEY = 'schema-version'

interface Stores {
  document: NoteDocument
  settings: Settings
  blobs: Blob
  meta: string
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
  // Every text block must carry runs, the current shape. Anything else is discarded.
  return pages.every((page) =>
    Array.isArray(page.blocks) ? page.blocks.every((b) => b.type !== 'text' || Array.isArray(b.text?.runs)) : false,
  )
}

export async function loadDocument(): Promise<NoteDocument | undefined> {
  const database = await db()
  const version = await database.get('meta', VERSION_KEY)
  if (version !== String(SCHEMA_VERSION)) return undefined
  const doc = await database.get('document', DOC_KEY)
  return isValidDocument(doc) ? doc : undefined
}

export async function saveDocument(doc: NoteDocument): Promise<void> {
  const database = await db()
  await database.put('document', plain(doc), DOC_KEY)
  await database.put('meta', String(SCHEMA_VERSION), VERSION_KEY)
}

export async function loadSettings(): Promise<Settings | undefined> {
  return (await db()).get('settings', SETTINGS_KEY)
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

export async function loadApiKey(): Promise<string | undefined> {
  return (await db()).get('meta', API_KEY_KEY)
}

export async function saveApiKey(key: string): Promise<void> {
  await (await db()).put('meta', key, API_KEY_KEY)
}

export async function clearApiKey(): Promise<void> {
  await (await db()).delete('meta', API_KEY_KEY)
}

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let handle: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    if (handle) clearTimeout(handle)
    handle = setTimeout(() => fn(...args), ms)
  }
}

/**
 * Hydrate the stores from disk, then keep saving them as they change. Called once at
 * startup before the app is shown so restored work is on screen immediately.
 */
export async function installPersistence(): Promise<void> {
  const documentStore = useDocument()
  const settingsStore = useSettings()

  const savedDoc = await loadDocument()
  if (savedDoc) documentStore.hydrate(savedDoc)

  const savedSettings = await loadSettings()
  if (savedSettings) settingsStore.hydrate(savedSettings)

  const persistDoc = debounce((doc: NoteDocument) => void saveDocument(doc), 400)
  const persistSettings = debounce((settings: Settings) => void saveSettings(settings), 300)

  documentStore.$subscribe((_mutation, state) => persistDoc(state.doc))
  settingsStore.$subscribe((_mutation, state) => persistSettings(state))
}
