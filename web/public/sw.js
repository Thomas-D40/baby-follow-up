// Minimal service worker: present to make the PWA installable.
// No offline cache in v1 (network by default) — see Conception D5.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
