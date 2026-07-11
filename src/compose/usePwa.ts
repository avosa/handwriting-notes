// The installable-app glue: it registers the service worker, offers to install the app to the
// home screen when the browser allows, and watches for a newer version so the reader can reload
// into it on their own terms rather than having the page change under them.
import { onMounted, ref } from 'vue'

// The browser's own install event, which is not in the standard DOM types.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Whether the browser has offered to install the app, and a newer version is ready to load. These
// are module-level so the whole app shares one state no matter where the composable is used.
const canInstall = ref(false)
const updateReady = ref(false)
let deferredPrompt: BeforeInstallPromptEvent | null = null
let waitingWorker: ServiceWorker | null = null
let started = false

function trackInstalling(worker: ServiceWorker | null) {
  if (!worker) return
  worker.addEventListener('statechange', () => {
    // A worker reaching "installed" while one already controls the page is an update, not the
    // first install, so offer to load it.
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      waitingWorker = worker
      updateReady.value = true
    }
  })
}

function start() {
  if (started) return
  started = true

  window.addEventListener('beforeinstallprompt', (event) => {
    // Hold onto the event so the app can offer install on its own button instead of the
    // browser's mini-infobar.
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    canInstall.value = true
  })
  window.addEventListener('appinstalled', () => {
    canInstall.value = false
    deferredPrompt = null
  })

  if (!('serviceWorker' in navigator)) return

  // In development the service worker would sit in front of the dev server and serve stale,
  // cached modules instead of the latest edits — so it is only registered in production builds.
  // Any worker left over from a previous run (or from testing a build locally) is torn down here,
  // along with its OWN shell caches, so `bun dev` is always fresh. Only the app-shell caches are
  // cleared, never every cache: a downloaded on-device model lives in its own Cache Storage bucket
  // (webllm/…), and wiping all caches on each dev load was silently deleting that model, so it had
  // to be downloaded again after every restart.
  if (!import.meta.env.PROD) {
    void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((reg) => void reg.unregister()))
    if ('caches' in window)
      void caches
        .keys()
        .then((keys) => keys.filter((key) => key.startsWith('notes-shell')).forEach((key) => void caches.delete(key)))
    return
  }

  void navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      // A newer worker may already be waiting from a previous visit.
      if (registration.waiting && navigator.serviceWorker.controller) {
        waitingWorker = registration.waiting
        updateReady.value = true
      }
      registration.addEventListener('updatefound', () => trackInstalling(registration.installing))
    })
    .catch(() => {})

  // When the new worker takes over, load the fresh app once.
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}

export function usePwa() {
  onMounted(start)

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    deferredPrompt = null
    canInstall.value = false
  }

  function dismissInstall() {
    canInstall.value = false
  }

  // Ask the waiting worker to take over; the controllerchange handler then reloads the page.
  function reload() {
    updateReady.value = false
    if (waitingWorker) waitingWorker.postMessage({ type: 'skip-waiting' })
    else window.location.reload()
  }

  return { canInstall, updateReady, install, dismissInstall, reload }
}
