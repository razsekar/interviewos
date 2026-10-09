/* InterviewOS service worker. Generated into dist/sw.js by tools/build/post-build.mjs, which fills in BUILD and PRECACHE.
 * - Precaches the app shell, styles, scripts and question lists (versioned cache; old versions are deleted on activate).
 * - Detailed answers and visited public pages are cached as they are used (or all at once from Settings).
 * - A new version waits until the user chooses "Reload to update" (SKIP_WAITING message): no surprise reloads mid-session.
 * - All URLs are resolved against the registration scope, so it works at any sub-path.
 */
const BUILD = '__BUILD__';
const PRECACHE = __PRECACHE__;
const CORE = `interviewos-core-${BUILD}`;
const RUNTIME = `interviewos-runtime-${BUILD}`;
const SCOPE = self.registration.scope;
const abs = (p) => new URL(p, SCOPE).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE).then((cache) => cache.addAll(PRECACHE.map((p) => new Request(abs(p), { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([CORE, RUNTIME]);
      for (const k of await caches.keys()) if (k.startsWith('interviewos-') && !keep.has(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const putRuntime = async (req, res) => {
  if (res && res.ok && res.type === 'basic') {
    const c = await caches.open(RUNTIME);
    await c.put(req, res.clone());
  }
  return res;
};

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  return putRuntime(req, await fetch(req));
}

async function staleWhileRevalidate(req) {
  const hit = await caches.match(req);
  const net = fetch(req).then((r) => putRuntime(req, r)).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(SCOPE)) return;
  const rel = url.href.slice(SCOPE.length);

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          if (rel.startsWith('app/')) return (await caches.match(abs('app/index.html'))) || (await fetch(req));
          return await staleWhileRevalidate(req).then((r) => (r.type === 'error' ? Promise.reject() : r));
        } catch {
          return (await caches.match(abs('offline.html'))) || Response.error();
        }
      })(),
    );
    return;
  }
  // content, scripts, styles, icons: cache first (versioned by BUILD; detailed answers fill in at runtime)
  if (/^(data|assets|app\/js|icons)\//.test(rel) || rel === 'manifest.webmanifest') {
    event.respondWith(cacheFirst(req).catch(() => Response.error()));
    return;
  }
});
