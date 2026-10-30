/* Service worker for English Teacher.
 *
 * What it does: lets the app be installed, keeps the app itself (page + built JS/CSS) on the device so it opens
 * without a connection, and shows a friendly page if even that is not available.
 * What it never does: cache or touch API traffic. Only same-origin GET requests are handled, so Supabase, Gemini,
 * sign-in tokens and lesson data always go straight to the network and are never stored here. (Saved lessons and
 * progress for offline viewing are kept by the app itself, per user, and erased on sign-out.)
 *
 * __BUILD_ID__ and the file list below are filled in at build time, so every deploy gets a fresh cache and the
 * old one is deleted.
 */
const BUILD_ID = '__BUILD_ID__';
const SHELL_CACHE = `shell-${BUILD_ID}`;
const ASSET_CACHE = `assets-${BUILD_ID}`;
const SHELL_FILES = ['/offline.html', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
const APP_SHELL = '/index.html';
const PRECACHE = []; /*PRECACHE*/

self.addEventListener('install', (event) => {
  // No skipWaiting() here: a new version waits until the student taps "Update", so a lesson is never interrupted.
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(SHELL_FILES);
      // The app page itself, so a cold start with no connection still opens the app.
      try {
        const page = await fetch('/', { cache: 'reload' });
        if (page.ok) await shell.put(APP_SHELL, page);
      } catch {
        /* offline.html is the fallback */
      }
      // Built JS/CSS (every route), best effort: one failure must not block the install.
      const assets = await caches.open(ASSET_CACHE);
      await Promise.all(PRECACHE.map((file) => assets.add(file).catch(() => undefined)));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, Gemini, fonts: never intercepted
  if (url.pathname === '/sw.js') return;

  // Page loads: network first so users always get the newest version. Offline, open the saved app (every route is
  // the same single-page app), or the offline page if the app was never saved.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && res.status === 200 && (res.headers.get('content-type') || '').includes('text/html')) {
            const shell = await caches.open(SHELL_CACHE);
            await shell.put(APP_SHELL, res.clone());
          }
          return res;
        } catch {
          const shell = await caches.open(SHELL_CACHE);
          return (await shell.match(APP_SHELL)) || (await shell.match('/offline.html')) || Response.error();
        }
      })(),
    );
    return;
  }

  // Built files have a content hash in the name, so a cached copy is always correct.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(req, { ignoreVary: true });
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Icons, manifest, favicon: serve from cache, refresh in the background.
  if (SHELL_FILES.includes(url.pathname) || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const hit = await cache.match(req, { ignoreVary: true });
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || refresh;
      }),
    );
  }
});
