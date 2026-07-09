<script setup lang="ts">
// The AI compose panel. Writing is free to try, but generating notes calls Claude with
// the writer's own key, so if none is connected it points them to add one. It offers a
// few example prompts to start from, accepts attachments, and rises as a centred card
// on a wide screen or a bottom sheet on a phone.
import { computed, ref } from 'vue'
import type { Attachment } from '@/types'
import { loadApiKey } from '@/store/persistence'
import Attachments from './Attachments.vue'
import Icon from '@/ui/Icon.vue'

const props = defineProps<{ hasContent: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'needs-key'): void
  (e: 'submit', instruction: string, attachments: Attachment[], useCurrent: boolean): void
}>()

const instruction = ref('')
const attachments = ref<Attachment[]>([])
// Start on the current note when there is something to work on, otherwise a fresh page.
const mode = ref<'new' | 'current'>(props.hasContent ? 'current' : 'new')

const examples = computed(() =>
  mode.value === 'current'
    ? [
        'Polish and tidy my notes',
        'Continue from where I left off',
        'Summarise this into key points',
        'Explain this more simply',
      ]
    : [
        'Take neat notes on the attached reading',
        'Explain sets and Venn diagrams with a diagram',
        'Summarise this into headings and bullet points',
        'Make a truth table for AND, OR, and NOT',
      ],
)

// Hand the request to the app and step aside, so the page is watched as Claude writes.
async function send() {
  if (!instruction.value.trim()) return
  if (!(await loadApiKey())) {
    emit('needs-key')
    return
  }
  emit('submit', instruction.value.trim(), attachments.value, mode.value === 'current')
  emit('close')
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="card">
      <div class="grip" />
      <header>
        <div class="badge"><Icon name="wand" :size="20" /></div>
        <div class="titles">
          <h2>Write with AI</h2>
          <p>Describe the notes you want. Claude drafts them onto new pages using the same tools you have.</p>
        </div>
        <button class="x" title="Close" @click="emit('close')"><Icon name="close" :size="18" /></button>
      </header>

      <div v-if="props.hasContent" class="mode">
        <button :class="{ on: mode === 'current' }" @click="mode = 'current'">Work on this note</button>
        <button :class="{ on: mode === 'new' }" @click="mode = 'new'">Start a new note</button>
      </div>

      <div class="examples">
        <button v-for="ex in examples" :key="ex" class="example" @click="instruction = ex">{{ ex }}</button>
      </div>

      <textarea
        v-model="instruction"
        class="field"
        rows="3"
        placeholder="Take notes on this, summarise the reading, make a table for…"
        @keydown.enter.exact.prevent="send"
      />
      <Attachments v-model="attachments" />

      <footer>
        <span class="note"><Icon name="key" :size="14" /> Free to use. Generating needs your Claude key.</span>
        <button class="send" :disabled="!instruction.trim()" @click="send">
          <Icon name="wand" :size="16" />Write notes
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 75;
  padding: 16px;
}
.card {
  width: min(560px, 100%);
  background: var(--surface);
  border-radius: 22px;
  padding: 22px;
  box-shadow: var(--pop-shadow);
  animation: pop 0.2s cubic-bezier(0.34, 1.4, 0.64, 1);
}
@keyframes pop {
  from {
    transform: scale(0.96) translateY(10px);
    opacity: 0;
  }
}
.grip {
  display: none;
}
header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}
.badge {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--accent-grad);
}
.titles {
  flex: 1;
}
h2 {
  margin: 0 0 3px;
  font-size: 19px;
  color: var(--brand);
}
.titles p {
  margin: 0;
  font-size: 13px;
  color: var(--text-soft);
  line-height: 1.5;
}
.x {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
}
.x:hover {
  background: var(--surface-sunken);
}
.mode {
  display: flex;
  gap: 3px;
  background: var(--surface-sunken);
  border-radius: 11px;
  padding: 3px;
  margin-bottom: 14px;
}
.mode button {
  flex: 1;
  border: none;
  background: transparent;
  border-radius: 9px;
  padding: 9px;
  cursor: pointer;
  color: var(--text-soft);
  font-size: 13px;
  font-weight: 500;
}
.mode button.on {
  background: var(--surface);
  color: var(--brand);
  box-shadow: 0 1px 4px var(--border);
}
.examples {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 12px;
}
.example {
  border: 1px solid var(--accent-wash-2);
  background: var(--accent-wash);
  color: var(--accent);
  border-radius: 999px;
  padding: 7px 13px;
  font-size: 12.5px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.example:hover {
  background: var(--accent-wash-2);
}
.field {
  width: 100%;
  resize: none;
  padding: 13px;
  border-radius: 13px;
  border: 1px solid var(--border);
  background: var(--surface-sunken);
  font-family: inherit;
  font-size: 14px;
  color: var(--text);
  margin-bottom: 8px;
}
.field::placeholder {
  color: var(--text-muted);
}
.field:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-wash-2);
}
.error {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 8px 0 0;
  color: var(--danger);
  font-size: 12.5px;
}
footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}
.note {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}
.send {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: none;
  border-radius: 12px;
  padding: 12px 20px;
  background: var(--accent-grad);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 4px 14px var(--accent-shadow);
}
.send:disabled {
  opacity: 0.5;
  cursor: default;
  box-shadow: none;
}

@media (max-width: 720px) {
  .backdrop {
    align-items: flex-end;
    justify-content: stretch;
    padding: 0;
  }
  .card {
    width: 100%;
    max-height: 85vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    border-radius: 22px 22px 0 0;
    padding: 18px 18px calc(20px + env(safe-area-inset-bottom));
    animation: rise 0.24s ease;
  }
  @keyframes rise {
    from {
      transform: translateY(100%);
    }
  }
  .grip {
    display: block;
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
    margin: 0 auto 14px;
  }
  header {
    margin-bottom: 14px;
  }
  /* Stack the mode toggle so long labels wrap cleanly instead of overflowing. */
  .mode {
    flex-wrap: wrap;
  }
  .mode button {
    flex: 1 1 45%;
    padding: 11px;
    font-size: 14px;
  }
  .example {
    padding: 9px 14px;
    font-size: 13.5px;
  }
  .field {
    font-size: 16px;
    padding: 14px;
    min-height: 96px;
  }
  /* Full-width, thumb-reachable footer: note above, big submit below. */
  footer {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .send {
    width: 100%;
    justify-content: center;
    padding: 15px 20px;
    font-size: 15px;
  }
}
</style>
