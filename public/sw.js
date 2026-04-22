/**
 * Service worker for Terror in the Jungle.
 * Cache Storage is reserved for content-versioned resources. Non-versioned
 * public assets, GLBs, and HTML must revalidate so deploys reach repeat users
 * without requiring a hard refresh.
 */

const CACHE_NAME = 'titj-v2-2026-04-21';

const HASHED_BUILD_ASSET_RE = /^\/build-assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css|mjs|wasm|woff2?|ttf|otf|png|jpe?g|webp|avif|svg|glsl|bin|map)$/i;

self.addEventListener('install', (event) => {
  // Activate immediately without waiting for open tabs to close
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));

      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable();
      }

      // Claim all open clients immediately
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // HTML navigations must prefer the network so users get the newest build on
  // the first post-deploy visit.
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(event.request, event.preloadResponse, { cacheFallback: true }));
    return;
  }

  // Content-hashed Vite build output and seed-keyed baked data are immutable.
  if (isImmutableResource(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Non-versioned assets are intentionally left to the browser/Cloudflare HTTP
  // cache so Cache-Control and ETag revalidation can keep them fresh.
  event.respondWith(fetch(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, preloadResponsePromise, options = {}) {
  const cacheFallback = options.cacheFallback === true;
  const cache = cacheFallback ? await caches.open(CACHE_NAME) : null;

  try {
    const preloadResponse = preloadResponsePromise ? await preloadResponsePromise : undefined;
    const response = preloadResponse || await fetch(request);
    if (cache && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    if (cacheFallback && cache) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    throw error;
  }
}

function isImmutableResource(pathname) {
  return HASHED_BUILD_ASSET_RE.test(pathname)
    || (pathname.startsWith('/data/navmesh/') && pathname.endsWith('.bin'))
    || (pathname.startsWith('/data/heightmaps/') && pathname.endsWith('.f32'));
}
