// What has changed lately, newest first. Shown in the What's new card. The first entry's
// version is the current one, so a stored mark can tell when there is something unseen.
export interface Release {
  version: string
  date: string
  items: string[]
}

export const changelog: Release[] = [
  {
    version: '0.7',
    date: 'July 2026',
    items: [
      'Type / on an empty line to turn it into a heading, list, quote, code, or divider.',
      'Tab nests a list item deeper and shift-Tab lifts it out, numbered by level and exported nested.',
      'Find and replace on the command or control key plus F, with matches lit in place.',
      'Right-click a page for a page break anywhere, and pages flow and merge like a document.',
      'Backspace at the start of a line now pulls it up past a divider or figure above.',
    ],
  },
  {
    version: '0.6',
    date: 'July 2026',
    items: [
      'A command bar on the command or control key plus K reaches any action by name.',
      'A shortcut list opens on the question mark key, and a welcome card greets a first visit.',
      'Printing now leaves only the sheets, each on its own page.',
      'Motion is quieted for readers whose system asks for less of it.',
      'The compose and key dialogs keep keyboard focus and announce themselves to assistive tech.',
    ],
  },
  {
    version: '0.5',
    date: 'July 2026',
    items: [
      'Manus joins Claude, ChatGPT, Gemini, and DeepSeek as an AI you can connect.',
      'The writing status moves on faster so the page is clear to watch sooner.',
    ],
  },
  {
    version: '0.4',
    date: 'July 2026',
    items: [
      'Select a run of lines across blocks to style them together or merge them into one paragraph.',
      'Pasting adopts the note formatting, and list editing behaves like a real document.',
    ],
  },
]
