// DeepSeek, which speaks the same chat protocol as OpenAI. It reads text only, so images
// in attachments are noted rather than sent.
import { openAiCompatible } from './openaiCompatible'

export const deepseek = openAiCompatible({
  id: 'deepseek',
  name: 'DeepSeek',
  vendor: 'DeepSeek',
  keyPlaceholder: 'sk-...',
  keyPrefix: 'sk-',
  consoleUrl: 'https://platform.deepseek.com/api_keys',
  steps: [
    'Sign in at platform.deepseek.com and open API keys.',
    'Create a key and copy it. It is shown once.',
    'Paste it here. It stays in this browser and is sent only to DeepSeek.',
  ],
  supportsImages: false,
  endpoint: 'https://api.deepseek.com/chat/completions',
  model: import.meta.env.VITE_DEEPSEEK_MODEL ?? 'deepseek-chat',
})
