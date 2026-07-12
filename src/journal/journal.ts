// The daily note. A journal entry is an ordinary note titled with its date and tagged so the day's
// note can be found again; reaching for "today's note" opens the one for today, or starts it. The
// title is a full, readable date so the entries read as a diary and sort naturally by day.

/** The tag every journal note carries, so today's entry can be found without scanning content. */
export const JOURNAL_TAG = 'journal'

/** The title for a given day's note — a full, readable date, e.g. "Monday, 14 July 2025". */
export function journalTitle(date = new Date()): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
