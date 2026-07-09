// A live view of which providers have a key connected. Keys live in the local database;
// this mirrors their presence reactively so the compose panel can tell, without a round
// trip, whether the AI in use is ready or still needs connecting. Refreshed on start and
// whenever a key is connected or removed.
import { reactive } from 'vue'
import type { ProviderId } from '@/types'
import { providerList } from '@/ai/providers'
import { loadApiKey } from '@/store/persistence'

const connected = reactive<Record<string, boolean>>({})

export async function refreshConnections(): Promise<void> {
  await Promise.all(
    providerList.map(async (provider) => {
      connected[provider.id] = !!(await loadApiKey(provider.id))
    }),
  )
}

export function useConnections(): Record<string, boolean> {
  return connected
}

export function isConnected(id: ProviderId): boolean {
  return !!connected[id]
}
