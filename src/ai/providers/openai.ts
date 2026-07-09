// ChatGPT, from OpenAI. It reads images as well as text.
import { openAiCompatible } from './openaiCompatible'

export const openai = openAiCompatible({
  id: 'openai',
  name: 'ChatGPT',
  vendor: 'OpenAI',
  keyPlaceholder: 'sk-...',
  keyPrefix: 'sk-',
  consoleUrl: 'https://platform.openai.com/api-keys',
  consoleLabel: 'platform.openai.com',
  steps: [
    'Open platform.openai.com → API keys.',
    "Create a secret key and copy it. It's shown only once.",
    'Paste it below.',
  ],
  reads: { images: true, pdf: true, docs: true },
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: import.meta.env.VITE_OPENAI_MODEL ?? 'gpt-5.5',
})
