// DeepSeek, which speaks the same chat protocol as OpenAI. Its chat model reads text only,
// so images and documents in attachments are noted rather than sent.
import { openAiCompatible } from './openaiCompatible'

export const deepseek = openAiCompatible({
  id: 'deepseek',
  name: 'DeepSeek',
  vendor: 'DeepSeek',
  keyPlaceholder: 'sk-...',
  keyPrefix: 'sk-',
  consoleUrl: 'https://platform.deepseek.com/api_keys',
  consoleLabel: 'platform.deepseek.com',
  steps: [
    'Open platform.deepseek.com → API keys.',
    "Create a key and copy it. It's shown only once.",
    'Paste it below.',
  ],
  reads: { images: false, pdf: false, docs: false },
  endpoint: 'https://api.deepseek.com/chat/completions',
  model: import.meta.env.VITE_DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
})
