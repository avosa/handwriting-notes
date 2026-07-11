<script setup lang="ts">
// One editable run of handwriting. It shows the stored runs, lets the browser handle
// caret and selection, and reads the DOM back into runs on every change so the
// document stays plain data. Enter and an empty Backspace are surfaced to the parent
// so paragraphs and list items behave the way a writer expects.
import { onMounted, ref, watch } from 'vue'
import type { TextRun } from '@/types'
import {
  htmlToRuns,
  plainText,
  runsToHtml,
  splitRuns,
  splitPasteText,
  parsePasteGroups,
  type PasteGroup,
} from '@/ui/richText'

const model = defineModel<TextRun[]>({ required: true })
// `splitLines` lines that split: a paragraph or a list item breaks in two at the caret on
// enter and takes each pasted line onto its own line, where a heading or a note stays one.
const props = defineProps<{ placeholder?: string; singleLine?: boolean; splitLines?: boolean }>()
const emit = defineEmits<{
  (e: 'enter', after: TextRun[]): void
  (e: 'paste-lines', lines: string[]): void
  (e: 'paste-structure', groups: PasteGroup[]): void
  (e: 'merge-back', runs: TextRun[]): void
  (e: 'empty-backspace'): void
  (e: 'focus'): void
  (e: 'blur'): void
  (e: 'select-all-note'): void
  (e: 'slash', payload: { query: string; x: number; y: number }): void
  (e: 'slash-close'): void
}>()

const el = ref<HTMLElement | null>(null)
let editing = false

function render() {
  if (el.value && !editing) el.value.innerHTML = runsToHtml(model.value)
}

onMounted(render)
watch(model, render, { deep: true })

function onInput() {
  if (!el.value) return
  editing = true
  model.value = htmlToRuns(el.value)
  reportSlash()
}

// A slash typed at the very start of an otherwise empty line opens the block menu: while the
// whole line reads as `/` and the letters after it, the parent is told the query and where the
// caret sits so it can float the menu there. Anything else — words before the slash, a space,
// or the slash gone — closes it, so the menu only lives while a command is being typed.
function reportSlash() {
  if (!props.splitLines || !el.value) return
  // Read the line straight from the DOM, which is the source of truth at input time; the model
  // has not caught up yet. The empty-line placeholder is a zero-width space, so it is stripped.
  const line = (el.value.textContent ?? '').replace(/\u200B/g, '')
  const match = /^\/(\w*)$/.exec(line)
  if (!match || caretOffset() !== line.length) {
    emit('slash-close')
    return
  }
  const sel = window.getSelection()
  const rect = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : el.value?.getBoundingClientRect()
  const box = rect && (rect.width || rect.height) ? rect : el.value?.getBoundingClientRect()
  emit('slash', { query: match[1], x: box?.left ?? 0, y: box?.bottom ?? 0 })
}
function onFocus() {
  editing = true
  emit('focus')
}
// A plain click on a link places the caret, so the link can be edited; a modifier-click opens
// it in a new tab, the way an editor lets you follow a link without leaving the text editable.
function onClick(event: MouseEvent) {
  if (!event.metaKey && !event.ctrlKey) return
  const node = event.target
  const anchor = node instanceof Element ? node.closest('a[href]') : null
  const href = anchor?.getAttribute('href')
  if (href) {
    event.preventDefault()
    window.open(href, '_blank', 'noopener,noreferrer')
  }
}
function onBlur() {
  editing = false
  emit('blur')
  emit('slash-close')
  // The DOM is normally left as the browser has it: re-rendering would replace the text nodes
  // and detach a selection a colour picker needs to keep. But when the model has moved on while
  // this line was focused, for instance a merge shifted a different line's words into it, the
  // DOM is stale and must be redrawn so it does not show the line that used to be here.
  if (el.value && plainText(htmlToRuns(el.value)) !== plainText(model.value)) render()
}
function selectAll() {
  if (!el.value) return
  const range = document.createRange()
  range.selectNodeContents(el.value)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

// How many characters sit before the caret in this line, so the line can be split there.
function caretOffset(): number {
  const host = el.value
  if (!host) return 0
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return plainText(model.value).length
  const range = sel.getRangeAt(0)
  const pre = range.cloneRange()
  pre.selectNodeContents(host)
  pre.setEnd(range.endContainer, range.endOffset)
  return pre.toString().split('\u200B').join('').length
}

// Paste as the note's own lines: strip whatever markers and formatting a copy carried, put
// the first line where the caret is, and hand the rest to the parent to place as it wants.
// A line that does not split takes the whole clean text so nothing is lost.
function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text/plain') ?? ''
  event.preventDefault()
  if (!props.splitLines) {
    const lines = splitPasteText(text)
    if (lines.length) {
      editing = true
      document.execCommand('insertText', false, lines.join('\n'))
    }
    return
  }
  const groups = parsePasteGroups(text)
  if (!groups.length) return
  editing = true
  if (groups.length === 1) {
    const group = groups[0]
    if (group.heading !== undefined) {
      document.execCommand('insertText', false, group.heading)
      return
    }
    const items = group.items ?? []
    document.execCommand('insertText', false, items[0] ?? '')
    if (items.length > 1) emit('paste-lines', items.slice(1))
    return
  }
  // Several sections: hand the whole shape to the parent to lay out as headings and lists.
  emit('paste-structure', groups)
}

function onKeydown(event: KeyboardEvent) {
  // Select the whole line; a second press, when the line is already fully selected,
  // reaches for the whole note instead.
  if ((event.key === 'a' || event.key === 'A') && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    const full = plainText(model.value).length
    const selected = window.getSelection()?.toString().length ?? 0
    if (full > 0 && selected >= full) emit('select-all-note')
    else selectAll()
    return
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    if (props.splitLines) {
      // Break the line at the caret: what is before it stays, what is after moves to the new
      // line. This line's own text is redrawn to what remains at once, so the words that
      // moved down do not linger here and read as a duplicate.
      const [before, after] = splitRuns(model.value, caretOffset())
      editing = true
      model.value = before
      if (el.value) el.value.innerHTML = runsToHtml(before)
      emit('enter', after)
    } else {
      emit('enter', [{ text: '' }])
    }
    return
  }
  if (event.key === 'Backspace') {
    const sel = window.getSelection()
    const collapsed = !sel || sel.isCollapsed
    if (props.splitLines) {
      // At the very start of a line, join it onto the line above; anywhere else it is a normal
      // character delete.
      if (collapsed && caretOffset() === 0) {
        event.preventDefault()
        emit('merge-back', model.value)
      }
      return
    }
    if (plainText(model.value) === '') {
      event.preventDefault()
      emit('empty-backspace')
    }
  }
}

// Place the caret at a character offset along the line, so a merge lands it at the seam
// between the two joined lines rather than at the start or the very end.
function placeCaret(host: HTMLElement, offset: number) {
  const sel = window.getSelection()
  if (!sel) return
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let remaining = offset
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const raw = node.textContent ?? ''
    const real = raw.replace(/\u200B/g, '')
    if (remaining <= real.length) {
      let index = 0
      let seen = 0
      while (index < raw.length && seen < remaining) {
        if (raw[index] !== '\u200B') seen += 1
        index += 1
      }
      range.setStart(node, index)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
    remaining -= real.length
  }
  range.selectNodeContents(host)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

defineExpose({
  focus: (offset?: number) => {
    const host = el.value
    if (!host) return
    // Sync the DOM to the model before focusing: when a slash command emptied this line while it
    // was still focused, the earlier render was skipped, so the stale `/query` would otherwise
    // linger under the caret. Redraw only when they actually differ to keep a live selection.
    if (plainText(htmlToRuns(host)) !== plainText(model.value)) {
      editing = false
      render()
    }
    host.focus()
    if (offset !== undefined) placeCaret(host, offset)
  },
})
</script>

<template>
  <div
    ref="el"
    class="editable"
    :class="{ empty: plainText(model) === '' }"
    contenteditable="true"
    spellcheck="false"
    :data-placeholder="props.placeholder ?? ''"
    @input="onInput"
    @focus="onFocus"
    @blur="onBlur"
    @keydown="onKeydown"
    @paste="onPaste"
    @click="onClick"
  />
</template>

<style scoped>
.editable {
  position: relative;
  outline: none;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  min-height: 1em;
  cursor: text;
}
/* The hint is absolutely placed so it never pushes the caret; the caret rests at the
   start of the line, and the hint sits behind it. */
.editable.empty::before {
  content: attr(data-placeholder);
  position: absolute;
  left: 0;
  top: 0;
  color: rgba(51, 51, 76, 0.32);
  pointer-events: none;
}
</style>
