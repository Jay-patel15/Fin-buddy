/* ============================================================
   FinBuddy Service Worker — caches the app shell so the app loads
   offline. No network calls are required at runtime: data lives
   in IndexedDB.
   ============================================================ */

const CACHE = 'finbuddy-v3';
const SHELL = [
  './',
  './index.html',
  './widget.html',
  './manifest.json',
  './css/styles.css',
  './js/utils.js',
  './js/crypto.js',
  './js/db.js',
  './js/state.js',
  './js/auth.js',
  './js/notifications.js',
  './js/share.js',
  './js/charts.js',
  './js/export.js',
  './js/router.js',
  './js/app.js',
  './js/views/dashboard.js',
  './js/views/transactions.js',
  './js/views/add.js',
  './js/views/split.js',
  './js/views/analytics.js',
  './js/views/accounts.js',
  './js/views/budgets.js',
  './js/views/categories.js',
  './js/views/monthly.js',
  './js/views/settings.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for shell; network-fallback otherwise; never crash if offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // ignore cross-origin

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
