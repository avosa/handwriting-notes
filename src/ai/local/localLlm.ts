// The main-thread handle to the in-browser LLM. It loads a WebLLM model on the user's GPU (once,
// cached), reports download progress, and streams generated text — so summarise, title, and chat
// can run with no API key at all. It only runs where WebGPU is available; callers fall back to a
// connected provider key elsewhere, so AI is always offered.
import { ref } from 'vue'
import { CreateWebWorkerMLCEngine, type MLCEngineInterface, type InitProgressReport } from '@mlc-ai/web-llm'

export type LocalStatus = 'idle' | 'loading' | 'ready' | 'error'

export const localStatus = ref<LocalStatus>('idle')
// Download/compile progress of the current model, 0..1, or null when not loading.
export const localProgress = ref<number | null>(null)
export const localError = ref<string | null>(null)
// The WebLLM id of the model currently loaded, or null.
export const loadedModel = ref<string | null>(null)

let engine: MLCEngineInterface | null = null
let worker: Worker | null = null
let loadPromise: Promise<void> | null = null

// Whether this device can run a local model at all. WebGPU is required; without it the app uses a
// connected provider key instead.
export function webgpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export function localReady(mlcId: string): boolean {
  return localStatus.value === 'ready' && loadedModel.value === mlcId && !!engine
}

// Whether a model's weights are already on this device, cached from an earlier download. This
// survives a page reload (the in-memory load state does not), so the UI can show a model as ready
// to use without asking for the download again.
export async function isModelCached(mlcId: string): Promise<boolean> {
  try {
    const { hasModelInCache } = await import('@mlc-ai/web-llm')
    return await hasModelInCache(mlcId)
  } catch {
    return false
  }
}

// Load a model (or switch to a different one), reporting progress. The engine and its worker are
// created once and reused; switching models reloads weights in place.
async function ensureLoaded(mlcId: string): Promise<void> {
  if (loadedModel.value === mlcId && engine) return
  if (loadPromise) {
    await loadPromise
    if (loadedModel.value === mlcId && engine) return
  }
  loadPromise = (async () => {
    localStatus.value = 'loading'
    localError.value = null
    localProgress.value = null
    try {
      if (!worker) worker = new Worker(new URL('./localLlm.worker.ts', import.meta.url), { type: 'module' })
      const initProgressCallback = (report: InitProgressReport) => {
        localProgress.value = typeof report.progress === 'number' ? report.progress : null
      }
      if (!engine) {
        engine = await CreateWebWorkerMLCEngine(worker, mlcId, { initProgressCallback })
      } else {
        await engine.reload(mlcId)
      }
      loadedModel.value = mlcId
      localStatus.value = 'ready'
      localProgress.value = null
    } catch (error) {
      localError.value = String(error)
      localStatus.value = 'error'
      throw error
    } finally {
      loadPromise = null
    }
  })()
  return loadPromise
}

// Warm a model up on demand (from settings), so the first real use is instant.
export async function preloadLocalModel(mlcId: string): Promise<void> {
  await ensureLoaded(mlcId)
}

// Stream a completion from the local model as plain text deltas, matching the provider stream
// shape so callers can swap between local and key-based generation freely.
export async function* localStream(
  mlcId: string,
  system: string,
  prompt: string,
  maxTokens: number,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  await ensureLoaded(mlcId)
  if (!engine) throw new Error('The on-device model is not available.')
  const onAbort = () => {
    try {
      engine?.interruptGenerate()
    } catch {
      // Interrupting a finished generation is harmless.
    }
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const chunks = await engine.chat.completions.create({
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.6,
    })
    for await (const chunk of chunks) {
      const delta = chunk.choices?.[0]?.delta?.content ?? ''
      if (delta) yield delta
    }
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}
