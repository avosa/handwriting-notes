import { describe, it, expect } from 'vitest'
import { newCard, schedule, isDue } from '@/study/card'

const NOW = 1_000_000_000_000
const DAY = 86_400_000

describe('flashcard scheduling', () => {
  it('a new card is due immediately', () => {
    const card = newCard('n1', 'Q', 'A')
    expect(isDue(card, NOW)).toBe(true)
    expect(card.reps).toBe(0)
  })

  it('a passing review grows the interval; the first is a day out, then a few days', () => {
    let card = newCard('n1', 'Q', 'A')
    card = schedule(card, 'good', NOW)
    expect(card.reps).toBe(1)
    expect(card.intervalDays).toBe(1)
    expect(card.due).toBe(NOW + DAY)
    card = schedule(card, 'good', card.due)
    expect(card.reps).toBe(2)
    expect(card.intervalDays).toBe(3)
  })

  it('a miss resets the streak and brings the card back in a minute, lowering the ease', () => {
    let card = schedule(newCard('n1', 'Q', 'A'), 'good', NOW)
    card = schedule(card, 'good', card.due)
    const missed = schedule(card, 'again', card.due)
    expect(missed.reps).toBe(0)
    expect(missed.intervalDays).toBe(0)
    expect(missed.due).toBe(card.due + 60_000)
    expect(missed.ease).toBeLessThan(card.ease)
    expect(missed.ease).toBeGreaterThanOrEqual(1.3)
  })

  it('an easy review pushes the interval and ease further than a good one', () => {
    const good = schedule(newCard('n1', 'Q', 'A'), 'good', NOW)
    const easy = schedule(newCard('n1', 'Q', 'A'), 'easy', NOW)
    expect(easy.intervalDays).toBeGreaterThan(good.intervalDays)
    expect(easy.ease).toBeGreaterThan(good.ease)
  })

  it('ease never falls below the floor no matter how many misses', () => {
    let card = newCard('n1', 'Q', 'A')
    for (let i = 0; i < 20; i++) card = schedule(card, 'again', NOW)
    expect(card.ease).toBeGreaterThanOrEqual(1.3)
  })
})
