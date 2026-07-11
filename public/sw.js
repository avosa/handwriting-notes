// A small service worker so the app loads and runs offline. It caches every same-origin file it
// serves — the app shell, the scripts, the styles, the fonts — and on a return visit serves them
// from the cache at once while refreshing them in the background (stale-while-revalidate). The
// note data itself already lives in the browser's database, so with the shell cached the whole
// app works with no network. There is no precise precache list: whatever the app fetches is kept.
const CACHE = 'notes-shell-v1'

// A new worker used to take over the moment it installed. Now it waits instead, so the app can
// show an "update ready" prompt and let the reader reload when they choose. The page asks the
// waiting worker to take over by posting { type: 'skip-waiting' }.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from earlier versions of this worker so an update never serves stale bytes.
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const cached = await cache.match(request)
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone())
          return response
        })
        .catch(() => null)
      // A navigation offline falls back to the cached app shell so any route still opens.
      if (cached) {
        void network
        return cached
      }
      const fresh = await network
      if (fresh) return fresh
      if (request.mode === 'navigate') {
        const shell = await cache.match('/')
        if (shell) return shell
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' })
    })(),
  )
})
