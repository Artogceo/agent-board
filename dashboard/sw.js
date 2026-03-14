// Service Worker отключён — кеширование не нужно для лёгкого сайта
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// Все запросы — напрямую в сеть, без кеша
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));
