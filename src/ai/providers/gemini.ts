// Gemini, from Google. It reads images as well as text, reached through Google's
// OpenAI-compatible chat endpoint so it shares the same protocol as the others.
import { openAiCompatible } from './openaiCompatible'

export const gemini = openAiCompatible({
  id: 'gemini',
  name: 'Gemini',
  vendor: 'Google',
  keyPlaceholder: 'AIza...',
  keyPrefix: 'AIza',
  consoleUrl: 'https://aistudio.google.com/app/apikey',
  consoleLabel: 'aistudio.google.com',
  steps: ['Open aistudio.google.com → Get API key.', 'Create a key and copy it.', 'Paste it below.'],
  reads: { images: true, pdf: true, docs: false },
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  model: import.meta.env.VITE_GEMINI_MODEL ?? 'gemini-flash-latest',
})
