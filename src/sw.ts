/// <reference lib="webworker" />
// Custom service worker (vite-plugin-pwa injectManifest strategy). Provides the
// offline precache plus Web Push handling (Phase 7). Keep it small — it runs on
// every navigation.
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[]
}

// Precache the built app shell (list injected at build time).
precacheAndRoute(self.__WB_MANIFEST)

// SPA navigation fallback: serve the cached index.html for app routes so deep
// links work offline. Supabase/API requests are excluded — they must hit the
// network.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api/, /supabase/, /\/[^/?]+\.[^/]+$/],
  }),
)

// Let the update prompt activate a new version on demand.
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { body: event.data?.text() }
  }
  const title = data.title ?? 'Hussain Catering Ops'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body ?? '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: data.tag,
      data: { url: data.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | null)?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          void client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
