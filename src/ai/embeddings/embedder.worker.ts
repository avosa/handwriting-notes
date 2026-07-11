/// <reference lib="webworker" />
// The embedding engine, run off the main thread. It loads a small sentence-embedding model once
// and turns blocks of text into vectors entirely on the user's device — no note content ever
// leaves the browser. It prefers the GPU (WebGPU) and falls back to WASM so it runs on any
// machine. Only the public model weights are fetched, once, then cached by the browser.
import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers'

// The weights come from the model hub on first use and are cached thereafter; we never look for
// a local copy in the bundle (there is none yet — self-hosting the weights is a pre-launch step).
env.allowLocalModels = false

const MODEL = 'Xenova/all-MiniLM-L6-v2'

type InMessage = { type: 'init' } | { type: 'embed'; id: number; texts: string[] }

type OutMessage =
  | { type: 'ready'; device: 'webgpu' | 'wasm' }
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'result'; id: number; vectors: number[][] }
  | { type: 'error'; id?: number; message: string }

const post = (message: OutMessage) => (self as unknown as Worker).postMessage(message)

let extractor: FeatureExtractionPipeline | null = null
let device: 'webgpu' | 'wasm' = 'wasm'
let loading: Promise<FeatureExtractionPipeline> | null = null

// Whether this worker can reach a WebGPU adapter. When it cannot, WASM carries the work.
async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    if (!gpu) return false
    return (await gpu.requestAdapter()) != null
  } catch {
    return false
  }
}

// Load the model the first time it is needed, reporting download progress, and remember it.
async function load(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor
  if (loading) return loading
  loading = (async () => {
    device = (await hasWebGPU()) ? 'webgpu' : 'wasm'
    const pipe = await pipeline('feature-extraction', MODEL, {
      device,
      // A quantised model keeps the one-time download small and runs well on both backends.
      dtype: 'q8',
      progress_callback: (p: { status: string; loaded?: number; total?: number }) => {
        if (p.status === 'progress' && p.total) post({ type: 'progress', loaded: p.loaded ?? 0, total: p.total })
      },
    })
    extractor = pipe as FeatureExtractionPipeline
    post({ type: 'ready', device })
    return extractor
  })()
  return loading
}

self.addEventListener('message', async (event: MessageEvent<InMessage>) => {
  const data = event.data
  try {
    if (data.type === 'init') {
      await load()
      return
    }
    if (data.type === 'embed') {
      const pipe = await load()
      // Mean-pool and normalise so each text becomes one unit-length vector; cosine similarity
      // is then a plain dot product downstream.
      const output = await pipe(data.texts, { pooling: 'mean', normalize: true })
      const dims = output.dims as number[]
      const rows = dims[0]
      const width = dims[dims.length - 1]
      const flat = output.data as Float32Array
      const vectors: number[][] = []
      for (let r = 0; r < rows; r++) {
        vectors.push(Array.from(flat.subarray(r * width, r * width + width)))
      }
      post({ type: 'result', id: data.id, vectors })
    }
  } catch (error) {
    post({ type: 'error', id: 'id' in data ? data.id : undefined, message: String(error) })
  }
})
