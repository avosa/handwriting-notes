// Train-on-your-handwriting, the client half. A writer copies a set of short prompts in their own
// hand and each is captured as ink and kept on the device. These samples are what a personal
// handwriting font is trained from — the training itself needs server compute and lands with the
// backend, so here the job is to gather clean, labelled samples and hold them safely until then.
import type { Stroke } from '@/types'

/** One captured prompt: the text the writer was asked to copy and the ink they wrote it in. */
export interface HandwritingSample {
  id: string
  prompt: string
  strokes: Stroke[]
  createdAt: number
}

// The prompts to copy, in the order shown. Together they cover the lower and upper case letters, the
// digits, and a few natural words, so a trained font has every glyph to learn from.
export const TRAINING_PROMPTS: string[] = [
  'a b c d e f g h i',
  'j k l m n o p q r',
  's t u v w x y z',
  'A B C D E F G H I',
  'J K L M N O P Q R',
  'S T U V W X Y Z',
  '0 1 2 3 4 5 6 7 8 9',
  'The quick brown fox',
  'jumps over the lazy dog',
  'notes for later',
  'a few good words',
]
