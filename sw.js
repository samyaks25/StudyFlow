/* =========================================
   STUDYFLOW - SERVICE WORKER (PWA & OFFLINE)
   Cache version: bump this string on every deploy to force
   old caches to be cleared and new assets to be fetched.
   ========================================= */

const CACHE_NAME = 'studyflow-cache-v1.0.1';

// Core app shell — these are precached on install
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './favicon.svg',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

// ── INSTALL: precache all static assets, skip waiting immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: delete every old cache version, claim all clients so the
//    new service worker takes effect without requiring a page reload.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH: Network-first for the core app shell (JS/CSS/HTML) so that
//    deployments propagate immediately. Falls back to cache when offline.
//    Everything else uses stale-while-revalidate for speed.
self.addEventListener('fetch', (event) => {
  // Only handle GET requests from the same origin
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Determine if this is a core app-shell asset
  const pathname = url.pathname;
  const isCoreAsset = (
    event.request.mode === 'navigate' ||  // HTML navigation
    pathname.endsWith('/script.js') ||
    pathname.endsWith('/style.css') ||
    pathname.endsWith('/index.html')
  );

  if (isCoreAsset) {
    // Network-first: always try the network; fall back to cache offline
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback
        return caches.match(event.request).then((cached) => {
          return cached || caches.match('./index.html');
        });
      })
    );
  } else {
    // Stale-while-revalidate for icons, fonts, etc.
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const networkFetch = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch(() => { /* Offline, cachedResponse used below */ });

        return cachedResponse || networkFetch;
      })
    );
  }
});
