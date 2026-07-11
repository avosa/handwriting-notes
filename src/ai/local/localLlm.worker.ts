/// <reference lib="webworker" />
// Runs the in-browser LLM off the main thread. WebLLM does the heavy lifting on the GPU here;
// the main thread only sends prompts and receives streamed tokens, so generating never freezes
// the page. This worker is a thin host — WebLLM's own handler does the work.
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm'

const handler = new WebWorkerMLCEngineHandler()
self.addEventListener('message', (event) => handler.onmessage(event))
