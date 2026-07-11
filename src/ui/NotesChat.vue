<script setup lang="ts">
// Chat with your notes: ask a question and get an answer grounded in your own material, with
// citations back to the notes it came from. Retrieval runs on-device; the answer is streamed.
// It admits when your notes don't cover something instead of bluffing like a generic chatbot.
import { nextTick, ref, watch } from 'vue'
import { useNotesChat } from '@/compose/useNotesChat'
import { embedStatus, embedProgress } from '@/ai/embeddings/embedder'
import { indexing } from '@/ai/embeddings/semanticIndex'
import { localStatus, localProgress } from '@/ai/local/localLlm'
import Icon from './Icon.vue'
import AnswerMarkdown from './AnswerMarkdown.vue'

const emit = defineEmits<{ (e: 'close'): void; (e: 'open', id: string): void; (e: 'need-key'): void }>()
const { messages, busy, error, needsKey, ask, stop } = useNotesChat()

const draft = ref('')
const scroller = ref<HTMLElement | null>(null)

const SUGGESTIONS = [
  'Summarise what I know about this topic',
  'Make this note clearer and better structured',
  'Add a short summary to the top of this note',
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
  if (localStatus.value === 'loading')
    return `Preparing the on-device model${localProgress.value != null ? ` … ${Math.round(localProgress.value * 100)}%` : '…'}`
  if (embedStatus.value === 'loading')
    return `Preparing on-device search${embedProgress.value != null ? ` … ${Math.round(embedProgress.value * 100)}%` : '…'}`
  if (indexing.value) return 'Reading your notes…'
  return 'Searching your notes…'
}
</script>

<template>
  <aside class="panel" role="complementary" aria-label="Chat with your notes">
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
          Ask about what you've written, or tell me to <em>edit</em> it — rewrite, add, restructure. Answers come from
          your notes, on your device, with citations.
        </p>
        <div class="suggest">
          <button v-for="s in SUGGESTIONS" :key="s" class="chip" @click="send(s)">{{ s }}</button>
        </div>
      </div>

      <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
        <div class="bubble">
          <template v-if="m.role === 'assistant' && !m.text && m.streaming">
            <span class="thinking">{{ m.mode === 'edit' ? 'Editing your note…' : statusLine() }}</span>
          </template>
          <template v-else-if="m.role === 'assistant'">
            <AnswerMarkdown :text="m.text" :sources="m.sources" @open="emit('open', $event)" /><span
              v-if="m.streaming"
              class="caret"
              >▍</span
            >
          </template>
          <template v-else>
            <span class="text">{{ m.text }}</span>
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
      <textarea v-model="draft" rows="1" placeholder="Ask, or tell me to edit…" @keydown.enter.exact.prevent="send()" />
      <button v-if="busy" type="button" class="go stop" title="Stop" @click="stop">
        <Icon name="stop" :size="16" />
      </button>
      <button v-else type="submit" class="go" :disabled="!draft.trim()" title="Ask">
        <Icon name="send" :size="16" />
      </button>
    </form>
  </aside>
</template>

<style scoped>
/* The chat docks to the right as a real panel beside the notes (not an overlay that blurs them),
   so the page stays crisp and clickable while chatting. Its width is the shared --chat-w, which the
   app uses to make room, so the two sit together with nothing hidden. On a phone it fills the width. */
.panel {
  position: fixed;
  top: var(--topbar-h, 60px);
  right: 0;
  height: calc(100% - var(--topbar-h, 60px));
  width: var(--chat-w, min(400px, 40vw));
  z-index: 66;
  background: var(--surface, #fff);
  color: var(--ink, #23232e);
  border-left: 1px solid var(--border-subtle);
  border-top-left-radius: 16px;
  box-shadow: -14px 0 44px rgba(20, 20, 28, 0.16);
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

/* On a phone the chat fills the width below the top bar, so no rounded corner or side border. */
@media (max-width: 720px) {
  .panel {
    border-left: none;
    border-top-left-radius: 0;
    box-shadow: none;
  }
  textarea {
    font-size: 16px; /* keeps iOS from zooming when the field is focused */
  }
}
</style>
