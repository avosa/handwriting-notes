// A small service worker so the app loads and runs offline, without ever trapping the reader on a
// stale shell. The trick is to treat the two kinds of request differently:
//
//   - The HTML document (a navigation) is fetched network-first: the reader always boots the
//     latest app, which points at the latest hashed scripts. The cached shell is only used as an
//     offline fallback. This is what keeps an update from ever showing a blank page — the old HTML
//     and the new scripts can never be served together.
//   - Everything else the app fetches — the hashed scripts, styles, and fonts — is content-addressed
//     and immutable, so it is served cache-first (stale-while-revalidate): instant on a return
//     visit, refreshed in the background.
//
// The note data itself lives in the browser's database, so with the shell cached the app works
// fully offline. Bumping CACHE drops every earlier cache on activate, so a poisoned shell from an
// older worker is cleared for good.
const CACHE = 'notes-shell-v2'

// Take over as soon as a fixed worker installs, rather than waiting behind the old one. A reader
// stuck on a blank shell served by a previous worker therefore recovers on their very next load
// instead of being unable to reach the button that would update it. Because navigations are
// network-first, taking over early can never serve a stale page.
self.addEventListener('install', () => {
  void self.skipWaiting()
})

// Kept so the page can still ask a waiting worker to take over immediately if it ever needs to.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') void self.skipWaiting()
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

// Whether a request is for an HTML page rather than an asset. Navigations, and any request that
// explicitly accepts HTML, are treated as the shell so they always come from the network first.
function isDocument(request) {
  return request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // The app shell: network-first. Always try to boot the latest HTML; fall back to the cached
  // shell only when the network is unavailable, so an update never renders a blank page.
  if (isDocument(request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        try {
          const fresh = await fetch(request)
          if (fresh && fresh.ok) cache.put(request, fresh.clone())
          return fresh
        } catch {
          const cached = (await cache.match(request)) || (await cache.match('/'))
          if (cached) return cached
          return new Response('Offline', { status: 503, statusText: 'Offline' })
        }
      })(),
    )
    return
  }

  // Assets: cache-first with a background refresh. These are content-hashed and immutable, so a
  // cached copy is always the right copy.
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
      if (cached) {
        void network
        return cached
      }
      const fresh = await network
      if (fresh) return fresh
      return new Response('', { status: 504, statusText: 'Offline' })
    })(),
  )
})
