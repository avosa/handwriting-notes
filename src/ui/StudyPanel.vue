<script setup lang="ts">
// The study surface: make flashcards from a note, then either review the cards that are due —
// spaced repetition reschedules each by how well it went, so time lands on what is about to be
// forgotten — or quiz yourself over the whole deck for a score. Cards and schedule are entirely on
// the device. Space flips a card; the number keys grade it, so a session runs from the keyboard.
import { computed, onMounted, ref } from 'vue'
import { useStudy } from '@/study/useStudy'
import type { Card } from '@/study/card'
import Icon from './Icon.vue'
import { useFocusTrap } from './useFocusTrap'

const emit = defineEmits<{ (e: 'close'): void }>()
const study = useStudy()

const card = ref<HTMLElement | null>(null)
useFocusTrap(card, () => emit('close'))

type Mode = 'review' | 'quiz'
const mode = ref<Mode>('review')
const queue = ref<Card[]>([])
const pos = ref(0)
const flipped = ref(false)
// How many were answered right in the current quiz run, for the score at the end.
const correct = ref(0)

const current = computed(() => queue.value[pos.value] ?? null)
const remaining = computed(() => Math.max(0, queue.value.length - pos.value))
// A run that had cards and has reached the end — the moment to show a quiz score or a caught-up note.
const finished = computed(() => queue.value.length > 0 && pos.value >= queue.value.length)
const hasCards = computed(() => study.cards.value.length > 0)

// A fresh shuffle each quiz so the order is never the same twice.
function shuffled(cards: Card[]): Card[] {
  const out = cards.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function start(next: Mode = mode.value) {
  mode.value = next
  queue.value = next === 'review' ? study.due() : shuffled(study.cards.value)
  pos.value = 0
  flipped.value = false
  correct.value = 0
}

onMounted(async () => {
  await study.refresh()
  start('review')
})

// Review: grade the card, which reschedules it, and move on.
async function answer(grade: 'again' | 'good' | 'easy') {
  if (!current.value || mode.value !== 'review') return
  await study.grade(current.value, grade)
  pos.value += 1
  flipped.value = false
}

// Quiz: mark yourself right or wrong for the score; the schedule is left untouched, so a self test
// never disturbs the review spacing.
function mark(right: boolean) {
  if (!current.value || mode.value !== 'quiz') return
  if (right) correct.value += 1
  pos.value += 1
  flipped.value = false
}

async function make() {
  const n = await study.makeFromCurrentNote()
  if (n) start()
}

// Keyboard: space or enter flips; once revealed, the number keys grade (review) or mark (quiz).
function onKey(event: KeyboardEvent) {
  if (!current.value) return
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    flipped.value = !flipped.value
    return
  }
  if (!flipped.value) return
  if (mode.value === 'review') {
    if (event.key === '1') void answer('again')
    else if (event.key === '2') void answer('good')
    else if (event.key === '3') void answer('easy')
  } else {
    if (event.key === '1') mark(false)
    else if (event.key === '2') mark(true)
  }
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="card" class="sheet" role="dialog" aria-modal="true" aria-label="Study" tabindex="-1" @keydown="onKey">
      <header class="head">
        <div class="switch" role="tablist" aria-label="Study mode">
          <button
            role="tab"
            :aria-selected="mode === 'review'"
            :class="{ on: mode === 'review' }"
            @click="start('review')"
          >
            Review
          </button>
          <button role="tab" :aria-selected="mode === 'quiz'" :class="{ on: mode === 'quiz' }" @click="start('quiz')">
            Quiz
          </button>
        </div>
        <div class="head-right">
          <span v-if="current" class="count">{{ remaining }} left</span>
          <button class="close" title="Close" @click="emit('close')"><Icon name="close" :size="16" /></button>
        </div>
      </header>

      <div v-if="current" class="review">
        <div class="flash" @click="flipped = !flipped">
          <span class="side-label">{{ flipped ? 'Answer' : 'Question' }}</span>
          <p class="face">{{ flipped ? current.back : current.front }}</p>
          <span v-if="!flipped" class="tap">Tap or press space to reveal</span>
        </div>
        <div v-if="!flipped" class="actions">
          <button class="reveal" @click="flipped = true">Show answer</button>
        </div>
        <div v-else-if="mode === 'review'" class="grades three">
          <button class="grade again" @click="answer('again')">Again</button>
          <button class="grade good" @click="answer('good')">Good</button>
          <button class="grade easy" @click="answer('easy')">Easy</button>
        </div>
        <div v-else class="grades two">
          <button class="grade again" @click="mark(false)">Missed</button>
          <button class="grade good" @click="mark(true)">Got it</button>
        </div>
      </div>

      <div v-else class="done">
        <template v-if="mode === 'quiz' && finished">
          <p class="score">{{ correct }} / {{ queue.length }}</p>
          <p class="done-msg">correct this round.</p>
          <button class="again-btn" @click="start('quiz')">Quiz again</button>
        </template>
        <template v-else>
          <Icon name="check" :size="26" />
          <p v-if="mode === 'quiz'" class="done-msg">No cards yet. Make some from the note you have open.</p>
          <p v-else-if="hasCards" class="done-msg">All caught up — nothing due right now.</p>
          <p v-else class="done-msg">No cards yet. Make some from the note you have open.</p>
        </template>
      </div>

      <p v-if="study.error.value" class="err">{{ study.error.value }}</p>
      <button class="make" :disabled="study.generating.value" @click="make">
        <Icon name="sparkleEdit" :size="15" />
        {{ study.generating.value ? 'Making cards…' : 'Make cards from this note' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 10vh;
  background: rgba(20, 20, 28, 0.32);
  backdrop-filter: blur(2px);
}
.sheet {
  width: min(440px, calc(100vw - 24px));
  background: var(--surface, #fff);
  color: var(--ink, #23232e);
  border-radius: 14px;
  box-shadow: var(--pop-shadow, 0 18px 50px rgba(0, 0, 0, 0.3));
  padding: 18px 20px 18px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.switch {
  display: flex;
  gap: 2px;
  background: var(--surface-sunken);
  border-radius: 10px;
  padding: 3px;
}
.switch button {
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 6px 14px;
  cursor: pointer;
  color: var(--text-soft, var(--text-muted));
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}
.switch button.on {
  background: var(--surface);
  color: var(--accent);
  box-shadow: 0 1px 4px rgba(51, 51, 76, 0.14);
}
.head-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.count {
  font-size: 12px;
  color: var(--text-muted);
}
.close {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 5px;
  border-radius: 8px;
}
.close:hover {
  background: var(--surface-sunken);
  color: var(--text);
}
.flash {
  min-height: 160px;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  cursor: pointer;
  background: var(--surface-2, var(--surface));
}
.side-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.face {
  margin: 0;
  font-size: 17px;
  line-height: 1.45;
  color: var(--text);
}
.tap {
  font-size: 12px;
  color: var(--text-muted);
}
.actions {
  margin-top: 12px;
}
.reveal {
  width: 100%;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 11px;
  padding: 11px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.reveal:hover {
  background: var(--accent-wash);
}
.grades {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}
.grades.three {
  grid-template-columns: repeat(3, 1fr);
}
.grades.two {
  grid-template-columns: repeat(2, 1fr);
}
.grade {
  border: none;
  border-radius: 11px;
  padding: 11px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  color: #fff;
}
.grade.again {
  background: var(--danger, #c0392b);
}
.grade.good {
  background: var(--accent, #4a72b0);
}
.grade.easy {
  background: #3f8f5c;
}
.grade:hover {
  filter: brightness(1.08);
}
.done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 30px 20px;
  color: var(--text-muted);
}
.done-msg {
  margin: 0;
  font-size: 14px;
  text-align: center;
}
.score {
  margin: 0;
  font-size: 34px;
  font-weight: 800;
  color: var(--accent);
}
.again-btn {
  margin-top: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 11px;
  padding: 9px 16px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.again-btn:hover {
  background: var(--accent-wash);
  border-color: var(--accent);
}
.err {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--danger, #c0392b);
}
.make {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  margin-top: 14px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--accent);
  border-radius: 11px;
  padding: 11px;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.make:hover:not(:disabled) {
  background: var(--accent-wash);
  border-color: var(--accent);
}
.make:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
