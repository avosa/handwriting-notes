// ChatGPT, from OpenAI. It reads images as well as text.
import { openAiCompatible } from './openaiCompatible'

export const openai = openAiCompatible({
  id: 'openai',
  name: 'ChatGPT',
  vendor: 'OpenAI',
  keyPlaceholder: 'sk-...',
  keyPrefix: 'sk-',
  consoleUrl: 'https://platform.openai.com/api-keys',
  steps: [
    'Sign in at platform.openai.com and open API keys under your profile.',
    'Create a new secret key and copy it. It is shown once.',
    'Paste it here. It stays in this browser and is sent only to OpenAI.',
  ],
  supportsImages: true,
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: import.meta.env.VITE_OPENAI_MODEL ?? 'gpt-4o',
})
