<script setup lang="ts">
// Chat with your notes: ask a question and get an answer grounded in your own material, with
// citations back to the notes it came from. Retrieval runs on-device; the answer is streamed.
// It admits when your notes don't cover something instead of bluffing like a generic chatbot.
import { nextTick, ref, watch } from 'vue'
import { useNotesChat } from '@/compose/useNotesChat'
import { embedStatus, embedProgress } from '@/ai/embeddings/embedder'
import { indexing } from '@/ai/embeddings/semanticIndex'
import Icon from './Icon.vue'
import { useFocusTrap } from './useFocusTrap'

const emit = defineEmits<{ (e: 'close'): void; (e: 'open', id: string): void; (e: 'need-key'): void }>()
const { messages, busy, error, needsKey, ask, stop } = useNotesChat()

const card = ref<HTMLElement | null>(null)
useFocusTrap(card, () => emit('close'))

const draft = ref('')
const scroller = ref<HTMLElement | null>(null)

const SUGGESTIONS = [
  'Summarise what I know about this topic',
  'What are the key points across my notes?',
  'Quiz me on my recent notes',
]

async function send(text?: string) {
  const q = (text ?? draft.value).trim()
  if (!q || busy.value) return
  draft.value = ''
  await ask(q)
}

// When a key is needed, hand off to the app to open the key dialog.
watch(needsKey, (v) => {
  if (v) emit('need-key')
})

// Keep the newest message in view as the answer streams in.
watch(
  () => messages.value.map((m) => m.text).join('|'),
  () => nextTick(() => scroller.value?.scrollTo({ top: scroller.value.scrollHeight })),
)

// While an answer is pending but no text has arrived yet, say what the device is doing.
const statusLine = () => {
  if (embedStatus.value === 'loading')
    return `Preparing the on-device model${embedProgress.value != null ? ` … ${Math.round(embedProgress.value * 100)}%` : '…'}`
  if (indexing.value) return 'Reading your notes…'
  return 'Searching your notes…'
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <aside ref="card" class="panel" role="dialog" aria-modal="true" aria-label="Chat with your notes" tabindex="-1">
      <header class="head">
        <div class="title">
          <Icon name="aiChat" :size="17" />
          <h2>Chat with your notes</h2>
        </div>
        <button class="close" title="Close" @click="emit('close')"><Icon name="close" :size="16" /></button>
      </header>

      <div ref="scroller" class="scroll">
        <div v-if="!messages.length" class="empty">
          <p class="lead">
            Ask anything about what you've written. Answers come from <em>your</em> notes, on your device, with
            citations.
          </p>
          <div class="suggest">
            <button v-for="s in SUGGESTIONS" :key="s" class="chip" @click="send(s)">{{ s }}</button>
          </div>
        </div>

        <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
          <div class="bubble">
            <template v-if="m.role === 'assistant' && !m.text && m.streaming">
              <span class="thinking">{{ statusLine() }}</span>
            </template>
            <template v-else>
              <span class="text">{{ m.text }}<span v-if="m.streaming" class="caret">▍</span></span>
            </template>
          </div>
          <div v-if="m.sources && m.sources.length" class="sources">
            <span class="src-label">From your notes</span>
            <button v-for="s in m.sources" :key="s.n" class="src" :title="s.text" @click="emit('open', s.noteId)">
              <span class="src-n">{{ s.n }}</span
              >{{ s.title }}
            </button>
          </div>
        </div>
      </div>

      <p v-if="needsKey" class="notice">
        Connect an AI key to answer from your notes.
        <button class="link" @click="emit('need-key')">Add a key</button>
      </p>
      <p v-if="error" class="err">{{ error }}</p>

      <form class="composer" @submit.prevent="send()">
        <textarea v-model="draft" rows="1" placeholder="Ask your notes…" @keydown.enter.exact.prevent="send()" />
        <button v-if="busy" type="button" class="go stop" title="Stop" @click="stop">
          <Icon name="stop" :size="16" />
        </button>
        <button v-else type="submit" class="go" :disabled="!draft.trim()" title="Ask">
          <Icon name="send" :size="16" />
        </button>
      </form>
    </aside>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  justify-content: flex-end;
  background: rgba(20, 20, 28, 0.32);
  backdrop-filter: blur(2px);
}
.panel {
  width: min(420px, calc(100vw - 12px));
  height: 100%;
  background: var(--surface, #fff);
  color: var(--ink, #23232e);
  box-shadow: var(--pop-shadow, 0 18px 50px rgba(0, 0, 0, 0.3));
  display: flex;
  flex-direction: column;
  padding-top: max(0px, env(safe-area-inset-top));
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
}
.title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--accent);
}
.head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
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
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.empty {
  margin: auto 0;
  color: var(--text-muted);
}
.lead {
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 1.5;
}
.lead em {
  color: var(--accent);
  font-style: normal;
  font-weight: 600;
}
.suggest {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.chip {
  text-align: left;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.chip:hover {
  background: var(--accent-wash);
  border-color: var(--accent);
}
.msg {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.msg.user {
  align-items: flex-end;
}
.bubble {
  max-width: 92%;
  border-radius: 14px;
  padding: 10px 13px;
  font-size: 14px;
  line-height: 1.5;
}
.msg.user .bubble {
  background: linear-gradient(135deg, #4a72b0, #7e3f8a);
  color: #fff;
  border-bottom-right-radius: 5px;
}
.msg.assistant .bubble {
  background: var(--surface-sunken);
  color: var(--text);
  border-bottom-left-radius: 5px;
}
.text {
  white-space: pre-wrap;
  word-break: break-word;
}
.thinking {
  color: var(--text-muted);
  font-style: italic;
}
.caret {
  color: var(--accent);
  animation: blink 1s steps(2) infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
.sources {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.src-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.src {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 999px;
  padding: 3px 10px 3px 4px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.src:hover {
  background: var(--accent-wash);
}
.src-n {
  display: inline-grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.notice {
  margin: 0;
  padding: 10px 16px;
  font-size: 13px;
  color: var(--text-muted);
  border-top: 1px solid var(--border-subtle);
}
.err {
  margin: 0;
  padding: 10px 16px;
  font-size: 13px;
  color: var(--danger, #c0392b);
}
.link {
  border: none;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 0 2px;
}
.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 12px 12px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border-subtle);
}
textarea {
  flex: 1;
  resize: none;
  max-height: 140px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  color: var(--text);
  background: var(--surface);
  outline: none;
}
textarea:focus {
  border-color: var(--accent);
}
.go {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  color: #fff;
  background: linear-gradient(135deg, #4a72b0, #7e3f8a);
}
.go:disabled {
  opacity: 0.5;
  cursor: default;
}
.go.stop {
  background: var(--danger, #c0392b);
}
</style>
