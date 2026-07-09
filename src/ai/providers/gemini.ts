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
  steps: [
    'Sign in at aistudio.google.com and open Get API key.',
    'Create a key and copy it.',
    'Paste it here. It stays in this browser and is sent only to Google.',
  ],
  reads: { images: true, pdf: true, docs: false },
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  model: import.meta.env.VITE_GEMINI_MODEL ?? 'gemini-flash-latest',
})
