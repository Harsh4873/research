const CACHE_PREFIX = 'recall-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v2`;
// The previous app at this scope used these cache names; clear them on takeover.
const LEGACY_PREFIXES = ['sift-shell-'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(self.registration.scope))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) =>
          LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
          (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function hashedAsset(pathname) {
  if (!pathname.includes('/assets/')) return null;
  const file = pathname.split('/').pop();
  if (!file) return null;
  // Hash is the last segment, so reference-file-abc12345.js does not share a stem with another chunk.
  const match = file.match(/^(.*)-([A-Za-z0-9_-]{8,})(\.[A-Za-z0-9]+)$/);
  if (!match || !match[1]) return null;
  return { stem: match[1], ext: match[3].toLowerCase() };
}

function remember(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return Promise.resolve();
  let copy;
  try {
    copy = response.clone();
  } catch {
    return Promise.resolve();
  }
  const url = new URL(request.url);
  return caches.open(CACHE_NAME).then(async (cache) => {
    await cache.put(request, copy);
    const hashed = hashedAsset(url.pathname);
    if (!hashed) return;
    const keys = await cache.keys();
    await Promise.all(keys.map((key) => {
      const path = new URL(key.url).pathname;
      if (path === url.pathname) return undefined;
      const other = hashedAsset(path);
      if (!other || other.stem !== hashed.stem || other.ext !== hashed.ext) return undefined;
      return cache.delete(key);
    }));
  }).catch(() => undefined);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scopePath = new URL(self.registration.scope).pathname;
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scopePath)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          event.waitUntil(remember(request, response));
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? caches.match(self.registration.scope)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      event.waitUntil(remember(request, response));
      return response;
    })),
  );
});
