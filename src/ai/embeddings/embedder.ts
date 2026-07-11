// The main-thread handle to the embedding worker. It spawns the worker lazily on first use, so
// nothing downloads until the writer first asks for a semantic feature, and exposes a small
// promise-based API plus reactive status for the UI to show loading and which backend won.
import { ref } from 'vue'

export type EmbedStatus = 'idle' | 'loading' | 'ready' | 'error'

export const embedStatus = ref<EmbedStatus>('idle')
export const embedDevice = ref<'webgpu' | 'wasm' | null>(null)
// Download progress of the one-time model fetch, 0..1, or null when not downloading.
export const embedProgress = ref<number | null>(null)

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (v: number[][]) => void; reject: (e: Error) => void }>()

function ensureWorker(): Worker {
  if (worker) return worker
  embedStatus.value = 'loading'
  worker = new Worker(new URL('./embedder.worker.ts', import.meta.url), { type: 'module' })
  worker.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data
    if (msg.type === 'ready') {
      embedStatus.value = 'ready'
      embedDevice.value = msg.device
      embedProgress.value = null
    } else if (msg.type === 'progress') {
      embedProgress.value = msg.total ? msg.loaded / msg.total : null
    } else if (msg.type === 'result') {
      pending.get(msg.id)?.resolve(msg.vectors)
      pending.delete(msg.id)
    } else if (msg.type === 'error') {
      if (msg.id != null) {
        pending.get(msg.id)?.reject(new Error(msg.message))
        pending.delete(msg.id)
      }
      if (embedStatus.value === 'loading') embedStatus.value = 'error'
    }
  })
  worker.addEventListener('error', () => {
    embedStatus.value = 'error'
  })
  return worker
}

// Kick off the model download without embedding anything yet, so the UI can warm it up on an
// explicit opt-in and show progress.
export function warmUpEmbedder(): void {
  ensureWorker().postMessage({ type: 'init' })
}

// Turn texts into unit-length vectors. Resolves once the (possibly first-time) model is ready.
export function embed(texts: string[]): Promise<number[][]> {
  if (!texts.length) return Promise.resolve([])
  const w = ensureWorker()
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ type: 'embed', id, texts })
  })
}

// One vector for one string, for a search query.
export async function embedOne(text: string): Promise<number[]> {
  const [vec] = await embed([text])
  return vec ?? []
}
