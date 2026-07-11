// One-shot text completion that works with whatever AI the writer has connected: the on-device
// model when it is turned on and the hardware can run it, otherwise their own BYO-key provider.
// It returns plain text, so a feature like a meeting summary states what it wants once and never
// re-implements the local-versus-key choice that chat already makes.
import { getProvider } from '@/ai/providers'
import { loadApiKey } from '@/store/persistence'
import { useSettings } from '@/store/settings'
import { webgpuAvailable, localStream } from '@/ai/local/localLlm'
import { modelById } from '@/ai/local/localModels'

/** Whether the on-device model is both switched on and runnable on this device. */
function localUsable(): boolean {
  const settings = useSettings()
  return !!settings.localAiEnabled && webgpuAvailable()
}

/** Whether any AI is reachable at all — the on-device model, or a saved provider key. Lets a
 *  feature ask for a key up front instead of failing mid-way. */
export async function hasAnyAi(): Promise<boolean> {
  if (localUsable()) return true
  const provider = getProvider(useSettings().activeProvider)
  return !!(await loadApiKey(provider.id))
}

export interface CompletionOptions {
  maxTokens?: number
  signal?: AbortSignal
}

// Complete a prompt to plain text. Streams from the on-device model when it is on (accumulated
// into one string, so the caller sees a single result either way); otherwise calls the connected
// provider. Throws a writer-facing message when no AI is available.
export async function completeText(system: string, prompt: string, opts: CompletionOptions = {}): Promise<string> {
  const settings = useSettings()
  const maxTokens = opts.maxTokens ?? 800
  if (localUsable()) {
    let out = ''
    const mlcId = modelById(settings.localModelId).mlcId
    for await (const delta of localStream(mlcId, system, prompt, maxTokens, opts.signal)) out += delta
    return out
  }
  const provider = getProvider(settings.activeProvider)
  const key = await loadApiKey(provider.id)
  if (!key) throw new Error(`Add your ${provider.vendor} API key first, or turn on On-device AI.`)
  return await provider.complete(system, prompt, key, maxTokens)
}
