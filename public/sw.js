/* ==========================================================================
   TokoKu — Service worker (app shell + offline fallback)
   ========================================================================== */

const VERSION = 'tokoku-v1.0.6';
const CORE = [
  './',
  './index.html',
  './firebase-config.js',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/css/views.css',
  './assets/icons/favicon.svg',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/js/app.js',
  './assets/js/firebase.js',
  './assets/js/store.js',
  './assets/js/nav.js',
  './assets/js/ui.js',
  './assets/js/utils.js',
  './assets/js/views/common.js',
  './assets/js/views/dashboard.js',
  './assets/js/views/pos.js',
  './assets/js/views/products.js',
  './assets/js/views/transactions.js',
  './assets/js/views/reports.js',
  './assets/js/views/debts.js',
  './assets/js/views/expenses.js',
  './assets/js/views/settings.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[TokoKu SW] Gagal menyiapkan cache:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isAsset(url) {
  return /\/(assets|manifest\.webmanifest|firebase-config\.js)/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;
  if (url.pathname.startsWith('/__/')) return;

  // Navigasi: ambil versi terbaru, fallback ke shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('./index.html').then((cached) => cached || caches.match('./')))
    );
    return;
  }

  // Aset statis: tampilkan cache dulu, perbarui di belakang layar.
  if (isAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
