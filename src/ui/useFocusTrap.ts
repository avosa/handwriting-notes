import { onBeforeUnmount, onMounted, type Ref } from 'vue'

// Keeps keyboard focus inside an open dialog: Tab cycles within it, Escape asks it to close,
// and when it closes focus returns to whatever the reader was on before it opened, so the
// keyboard never wanders onto the page hidden behind it.
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function useFocusTrap(container: Ref<HTMLElement | null>, close: () => void) {
  let returnTo: HTMLElement | null = null

  function focusable(): HTMLElement[] {
    const host = container.value
    if (!host) return []
    return Array.from(host.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
      return
    }
    if (event.key !== 'Tab') return
    const items = focusable()
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  onMounted(() => {
    returnTo = document.activeElement as HTMLElement | null
    const host = container.value
    host?.addEventListener('keydown', onKeydown)
    host?.focus()
  })

  onBeforeUnmount(() => {
    container.value?.removeEventListener('keydown', onKeydown)
    returnTo?.focus?.()
  })
}
