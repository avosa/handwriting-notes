// The study surface's brain: it makes flashcards from a note with the AI, keeps them on the
// device, and runs the review — handing out the cards that are due and folding each grade back into
// the schedule. Generation uses the connected provider or the on-device model, the same as the
// rest of the app; the cards and the schedule are entirely local.
import { ref } from 'vue'
import { getAllCards, putCard, deleteCard } from '@/store/persistence'
import { useDocument } from '@/store/document'
import { toPlainText } from '@/export/toText'
import { completeText, hasAnyAi } from '@/ai/complete'
import { newCard, schedule, isDue, type Card, type Grade } from './card'

const CARDS_SYSTEM = `Make study flashcards from the notes the user gives. Each card is a clear question and a short answer drawn only from the notes. Reply with only the cards, one per line, as "Question :: Answer". Between 4 and 10 cards. No preamble, no numbering. Never use a hyphen or dash as punctuation.`

// Parse the model's "Question :: Answer" lines into card fronts and backs.
function parseCards(text: string): { front: string; back: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf('::')
      if (at === -1) return null
      const front = line
        .slice(0, at)
        .replace(/^[\d.)\s-]+/, '')
        .trim()
      const back = line.slice(at + 2).trim()
      return front && back ? { front, back } : null
    })
    .filter((c): c is { front: string; back: string } => !!c)
}

export function useStudy() {
  const documentStore = useDocument()

  const cards = ref<Card[]>([])
  const generating = ref(false)
  const error = ref<string | null>(null)

  async function refresh(): Promise<void> {
    cards.value = await getAllCards()
  }

  // The cards ready to review right now, hardest-scheduled first.
  function due(now = Date.now()): Card[] {
    return cards.value.filter((c) => isDue(c, now)).sort((a, b) => a.due - b.due)
  }

  // Make cards from the open note and save them. Uses whatever AI is connected — the on-device model
  // when it is on, otherwise the writer's key; without either, it asks for one.
  async function makeFromCurrentNote(): Promise<number> {
    error.value = null
    const text = toPlainText(documentStore.doc).trim()
    if (!text) {
      error.value = 'Write some notes to make cards from first.'
      return 0
    }
    if (!(await hasAnyAi())) {
      error.value = 'Add your API key, or turn on on-device AI, to make cards.'
      return 0
    }
    generating.value = true
    try {
      const out = await completeText(CARDS_SYSTEM, text, { maxTokens: 800 })
      const parsed = parseCards(out)
      if (!parsed.length) throw new Error('No cards could be made from this note.')
      const noteId = documentStore.doc.id
      for (const c of parsed) await putCard(newCard(noteId, c.front, c.back))
      await refresh()
      return parsed.length
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Cards could not be made.'
      return 0
    } finally {
      generating.value = false
    }
  }

  // Record how a review went and reschedule the card.
  async function grade(card: Card, g: Grade): Promise<void> {
    const next = schedule(card, g, Date.now())
    await putCard(next)
    const i = cards.value.findIndex((c) => c.id === card.id)
    if (i !== -1) cards.value[i] = next
  }

  async function remove(id: string): Promise<void> {
    await deleteCard(id)
    cards.value = cards.value.filter((c) => c.id !== id)
  }

  return { cards, due, generating, error, refresh, makeFromCurrentNote, grade, remove }
}
