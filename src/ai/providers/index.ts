// The AI providers the app can use, and the lookup the rest of the app goes through.
// Claude is the default and first; an unknown id falls back to it.
import { anthropic } from './anthropic'
import { openai } from './openai'
import { gemini } from './gemini'
import { deepseek } from './deepseek'
import type { Provider, ProviderId } from './types'

export const providerList: Provider[] = [anthropic, openai, gemini, deepseek]

const byId: Record<ProviderId, Provider> = { anthropic, openai, gemini, deepseek }

export function getProvider(id: string | undefined): Provider {
  return byId[id as ProviderId] ?? anthropic
}

export type { Provider, ProviderId, ChatRequest } from './types'
