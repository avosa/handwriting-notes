// Entry point for turning a handwriting sample into a named style. Detection is not
// wired yet; this captures the sample and names the style from the writer's first
// name so the data path and UI exist for when detection lands.
import type { Handwriting } from '@/types'
import { getHandwriting } from './registry'

export interface HandwritingSample {
  firstName: string
  /** The uploaded image of handwriting, held as a blob key in IndexedDB. */
  sampleBlobRef: string
}

export interface UploadResult {
  handwriting: Handwriting
  detectionReady: boolean
}

/**
 * Register a sample under a style named for the writer. Until detection exists the
 * new style reuses the default fonts, so notes stay legible while the name is real.
 */
export function registerSample(sample: HandwritingSample): UploadResult {
  const base = getHandwriting('sanobia')
  const firstName = sample.firstName.trim() || 'Your'
  return {
    handwriting: {
      ...base,
      id: `sample-${firstName.toLowerCase()}`,
      name: `${firstName}'s handwriting`,
    },
    detectionReady: false,
  }
}
