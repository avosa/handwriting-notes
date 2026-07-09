// Resolves the writer's theme choice into a concrete light or dark appearance and keeps
// the document in sync. 'system' follows the OS, updating live when it flips (for
// example at dusk). The resolved value is shared so any component — the logo that swaps
// its outline, a preview swatch — can react to it without re-deriving the rule.
import { computed, ref, watch, type Ref } from 'vue'
import type { ThemeChoice } from '@/types'
import { useSettings } from '@/store/settings'

const media = window.matchMedia('(prefers-color-scheme: dark)')
const systemDark = ref(media.matches)
media.addEventListener('change', (e) => (systemDark.value = e.matches))

let started = false

/**
 * Wires the active theme to the document. Call once, from the app shell. Returns the
 * resolved 'light' | 'dark' so callers can branch on the real appearance.
 */
export function useTheme(): { choice: Ref<ThemeChoice>; resolved: Ref<'light' | 'dark'> } {
  const settings = useSettings()
  const choice = computed(() => settings.theme)
  const resolved = computed<'light' | 'dark'>(() =>
    choice.value === 'system' ? (systemDark.value ? 'dark' : 'light') : choice.value,
  )

  if (!started) {
    started = true
    watch(
      resolved,
      (value) => {
        document.documentElement.dataset.theme = value
        const meta = document.querySelector('meta[name="theme-color"]')
        if (meta) meta.setAttribute('content', value === 'dark' ? '#15151d' : '#ece7dc')
      },
      { immediate: true },
    )
  }

  return { choice, resolved }
}

/** The resolved appearance, for components that only need to read it. */
export function resolvedTheme(): Ref<'light' | 'dark'> {
  const settings = useSettings()
  return computed<'light' | 'dark'>(() =>
    settings.theme === 'system' ? (systemDark.value ? 'dark' : 'light') : settings.theme,
  )
}
