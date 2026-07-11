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
let loading: Promise<FeatureExtractionPipeline> | null = null

// Load the sentence model the first time it is needed, reporting download progress, and remember
// it. Embeddings run on WASM: the model is tiny, WASM is fast enough for it, and it runs reliably
// on every device without competing with the (larger) generation model for the GPU. The heavy
// generation model is the one that uses WebGPU. If loading fails, the pending state is cleared so a
// later request tries again rather than being stuck on a dead promise.
async function load(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor
  if (loading) return loading
  loading = (async () => {
    try {
      extractor = (await pipeline('feature-extraction', MODEL, {
        device: 'wasm',
        // A quantised model keeps the one-time download small and runs well on WASM.
        dtype: 'q8',
        progress_callback: (p: { status: string; loaded?: number; total?: number }) => {
          if (p.status === 'progress' && p.total) post({ type: 'progress', loaded: p.loaded ?? 0, total: p.total })
        },
      })) as FeatureExtractionPipeline
      post({ type: 'ready', device: 'wasm' })
      return extractor
    } catch (error) {
      loading = null
      throw error
    }
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
