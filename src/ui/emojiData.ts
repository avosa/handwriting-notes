// A curated set of common emoji, grouped so a small picker covers everyday note-taking without
// shipping a whole font or an index. Each entry carries a few keywords so a search finds it.
export interface EmojiGroup {
  name: string
  emoji: { char: string; keywords: string }[]
}

export const emojiGroups: EmojiGroup[] = [
  {
    name: 'Smileys',
    emoji: [
      { char: '😀', keywords: 'grin happy smile' },
      { char: '😄', keywords: 'happy smile joy' },
      { char: '😁', keywords: 'grin beam' },
      { char: '😂', keywords: 'laugh tears joy' },
      { char: '🙂', keywords: 'slight smile' },
      { char: '😉', keywords: 'wink' },
      { char: '😊', keywords: 'blush smile' },
      { char: '😍', keywords: 'love heart eyes' },
      { char: '😎', keywords: 'cool sunglasses' },
      { char: '🤔', keywords: 'think thinking hmm' },
      { char: '😅', keywords: 'sweat nervous' },
      { char: '😴', keywords: 'sleep tired' },
      { char: '😭', keywords: 'cry sob' },
      { char: '😱', keywords: 'shock scream fear' },
      { char: '🤯', keywords: 'mind blown' },
      { char: '🥳', keywords: 'party celebrate' },
    ],
  },
  {
    name: 'Gestures',
    emoji: [
      { char: '👍', keywords: 'thumbs up yes good' },
      { char: '👎', keywords: 'thumbs down no bad' },
      { char: '👏', keywords: 'clap applause' },
      { char: '🙌', keywords: 'raise hands celebrate' },
      { char: '🙏', keywords: 'pray thanks please' },
      { char: '👌', keywords: 'ok perfect' },
      { char: '✌️', keywords: 'peace victory' },
      { char: '🤝', keywords: 'handshake deal' },
      { char: '💪', keywords: 'strong muscle' },
      { char: '👀', keywords: 'eyes look' },
      { char: '🧠', keywords: 'brain smart' },
      { char: '❤️', keywords: 'heart love red' },
    ],
  },
  {
    name: 'Study',
    emoji: [
      { char: '📚', keywords: 'books study read' },
      { char: '📖', keywords: 'book open read' },
      { char: '✏️', keywords: 'pencil write' },
      { char: '📝', keywords: 'note memo write' },
      { char: '📌', keywords: 'pin important' },
      { char: '📎', keywords: 'clip attach' },
      { char: '🔖', keywords: 'bookmark' },
      { char: '💡', keywords: 'idea bulb light' },
      { char: '🔑', keywords: 'key important' },
      { char: '🎯', keywords: 'target goal aim' },
      { char: '⏰', keywords: 'time clock alarm' },
      { char: '📅', keywords: 'calendar date' },
      { char: '🧮', keywords: 'abacus math count' },
      { char: '🔬', keywords: 'science microscope' },
      { char: '🧪', keywords: 'chemistry test tube' },
      { char: '🌍', keywords: 'earth world globe' },
    ],
  },
  {
    name: 'Marks',
    emoji: [
      { char: '✅', keywords: 'check done yes tick' },
      { char: '❌', keywords: 'cross wrong no' },
      { char: '⚠️', keywords: 'warning caution' },
      { char: '❓', keywords: 'question' },
      { char: '❗', keywords: 'exclaim important' },
      { char: '⭐', keywords: 'star favourite' },
      { char: '🔥', keywords: 'fire hot lit' },
      { char: '✨', keywords: 'sparkle shine new' },
      { char: '➡️', keywords: 'arrow right next' },
      { char: '⬅️', keywords: 'arrow left back' },
      { char: '🔺', keywords: 'up increase triangle' },
      { char: '🔻', keywords: 'down decrease triangle' },
      { char: '➕', keywords: 'plus add' },
      { char: '➖', keywords: 'minus subtract' },
      { char: '🟰', keywords: 'equals' },
      { char: '♾️', keywords: 'infinity' },
    ],
  },
]

// Every emoji flattened with its keywords, for searching across all groups at once.
export function searchEmoji(query: string): string[] {
  const q = query.trim().toLowerCase()
  const all = emojiGroups.flatMap((g) => g.emoji)
  if (!q) return all.map((e) => e.char)
  return all.filter((e) => e.keywords.includes(q)).map((e) => e.char)
}
