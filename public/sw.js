/**
 * Service worker.
 *
 * Three jobs: make the app installable (Chrome requires a worker that handles
 * `fetch`), serve an offline fallback page, and show push notifications.
 * API and Supabase responses are NOT cached: a messaging app must always show
 * fresh data.
 */

const CACHE = 'mutechat-shell-v3'
const SHELL = ['/offline.html', '/icons/icon-192.png', '/mascot.png', '/logo-wordmark.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // Navigation: network first, offline page as a last resort.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')))
    return
  }

  // Static assets: cache first, network as a fallback.
  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)))
  }
})

/* ------------------------------------------------------------------------ */
/* Notifications push                                                        */
/* ------------------------------------------------------------------------ */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const title = payload.title || 'MuteChat'
  const url = payload.url || '/chat'

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || 'New GIF',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // One `tag` per conversation: notifications replace each other instead
      // of piling up when several GIFs arrive in a row.
      tag: payload.tag || 'mutechat',
      renotify: true,
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/chat'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        for (const client of windows) {
          if (client.url.includes(target) && 'focus' in client) return client.focus()
        }
        for (const client of windows) {
          if ('navigate' in client && 'focus' in client) {
            return client.navigate(target).then((c) => c && c.focus())
          }
        }
        return self.clients.openWindow(target)
      }),
  )
})
