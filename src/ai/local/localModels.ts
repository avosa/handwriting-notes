// The in-browser LLMs the app can run on the user's own GPU, for a genuinely key-free AI tier.
// A small ladder of sizes so every device gets something: a tiny model for phones and
// Chromebooks, a balanced default for laptops, and a larger one for strong machines. The right
// one can be picked in settings, or the app suggests one based on the device.

export interface LocalModel {
  /** Stable app-side id kept in settings. */
  id: string
  /** Name shown to the writer. */
  label: string
  /** The WebLLM prebuilt model id actually loaded. */
  mlcId: string
  /** Rough one-time download size in GB, shown before committing to it. */
  sizeGB: number
  /** A short word on which devices it suits. */
  note: string
}

export const LOCAL_MODELS: LocalModel[] = [
  {
    id: 'tiny',
    label: 'Tiny — fastest',
    mlcId: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    sizeGB: 0.5,
    note: 'Runs on most devices, including many phones',
  },
  {
    id: 'small',
    label: 'Small — recommended',
    mlcId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    sizeGB: 0.9,
    note: 'A good balance; runs on most laptops',
  },
  {
    id: 'balanced',
    label: 'Balanced — best quality',
    mlcId: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    sizeGB: 2.0,
    note: 'Sharper answers; needs a stronger GPU',
  },
]

export const DEFAULT_LOCAL_MODEL = 'small'

export function modelById(id: string | undefined): LocalModel {
  return LOCAL_MODELS.find((m) => m.id === id) ?? LOCAL_MODELS.find((m) => m.id === DEFAULT_LOCAL_MODEL)!
}
