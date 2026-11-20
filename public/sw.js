/* Tuvaletim Nerede? — basit service worker
 * Uygulama kabuğu: network-first (çevrimdışıyken önbellekten)
 * Harita karoları: cache-first (gezilen bölgeler çevrimdışı da görünür) */
const APP_CACHE = 'tn-app-v7';
const TILE_CACHE = 'tn-tiles-v4';
const MAX_TILES = 400;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(['/', '/manifest.json', '/logo.png', '/favicon.png', '/icon-192.png', '/icon-512.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![APP_CACHE, TILE_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trimTiles() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (/tile\.openstreetmap\.org/.test(url.hostname)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok || res.type === 'opaque') {
          cache.put(request, res.clone());
          trimTiles();
        }
        return res;
      }),
    );
    return;
  }

  // API yanıtları (puanlar, oturum) asla önbelleğe alınmaz
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // Derlenmiş statik varlıklar (adları içerik özetli, değişmez): önce önbellek
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(APP_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(APP_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('/'))),
    );
  }
});
