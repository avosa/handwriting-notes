// A flashcard and the spaced-repetition schedule behind it. Cards are made from a note's content
// and reviewed over time: an easy card comes back rarely, a card you miss comes back soon. The
// schedule is a compact SM-2: each review nudges the interval and the ease, so study time lands on
// what you are about to forget rather than what you already know.
import { uid } from '@/util/id'

export interface Card {
  id: string
  /** The note this card was made from, so a note's cards can be found and cleaned up together. */
  noteId: string
  front: string
  back: string
  /** When the card is next due, in epoch ms. */
  due: number
  /** The current gap between reviews, in days. */
  intervalDays: number
  /** How easily it is recalled; higher means longer gaps. */
  ease: number
  /** How many times it has been recalled in a row. */
  reps: number
}

// How a review went, from hardest to easiest.
export type Grade = 'again' | 'good' | 'easy'

const DAY_MS = 86_400_000
const MIN_EASE = 1.3

export function newCard(noteId: string, front: string, back: string): Card {
  return { id: uid('card'), noteId, front, back, due: 0, intervalDays: 0, ease: 2.5, reps: 0 }
}

// Whether a card is ready to be reviewed at a given moment.
export function isDue(card: Card, now: number): boolean {
  return card.due <= now
}

// Fold a review's grade into the card: a miss resets it and brings it back in a minute; a pass
// grows the interval by the ease; an easy pass grows it further and raises the ease.
export function schedule(card: Card, grade: Grade, now: number): Card {
  let { intervalDays, ease, reps } = card
  if (grade === 'again') {
    reps = 0
    intervalDays = 0
    ease = Math.max(MIN_EASE, ease - 0.2)
    return { ...card, reps, intervalDays, ease, due: now + 60_000 }
  }
  reps += 1
  if (reps === 1) intervalDays = grade === 'easy' ? 4 : 1
  else if (reps === 2) intervalDays = grade === 'easy' ? 7 : 3
  else intervalDays = Math.max(1, Math.round(intervalDays * ease * (grade === 'easy' ? 1.3 : 1)))
  if (grade === 'easy') ease += 0.15
  return { ...card, reps, intervalDays, ease, due: now + intervalDays * DAY_MS }
}
