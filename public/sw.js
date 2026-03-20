/**
 * Service worker for Terror in the Jungle.
 * Cache-first for immutable hashed assets, stale-while-revalidate for HTML,
 * cache-first for pre-baked navmesh binaries.
 */

const CACHE_NAME = 'titj-v1';

// Critical assets to pre-cache during install
const PRECACHE_URLS = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Activate immediately without waiting for open tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  // Claim all open clients immediately
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Hashed assets under /assets/ - cache-first (immutable)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Pre-baked navmesh binaries - cache-first
  if (url.pathname.startsWith('/data/navmesh/') && url.pathname.endsWith('.bin')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Other data files - cache-first with 24h TTL (matches _headers)
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // HTML navigation requests - stale-while-revalidate
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Everything else (fonts, etc.) - cache-first
  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  // Fetch in background regardless
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached); // If offline, fall back to cache

  // Return cached immediately if available, otherwise wait for fetch
  return cached || fetchPromise;
}
