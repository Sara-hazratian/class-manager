/* ============================================================
   SERVICE WORKER — offline support for ClassPilot.
   ------------------------------------------------------------
   Bump CACHE_NAME whenever any precached file changes so
   returning users get the update instead of a stale cache.
   ============================================================ */
const CACHE_NAME = "classpilot-v7";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/tokens.css",
  "./css/base.css",
  "./css/layout.css",
  "./css/components.css",
  "./js/app.js",
  "./js/store.js",
  "./js/supabase-client.js",
  "./js/auth.js",
  "./js/parent.js",
  "./js/admin.js",
  "./js/jalali.js",
  "./js/theme.js",
  "./js/ui.js",
  "./js/router.js",
  "./js/setup.js",
  "./js/header.js",
  "./js/dashboard.js",
  "./js/students.js",
  "./js/attendance.js",
  "./js/lessons.js",
  "./js/evaluations.js",
  "./js/homework.js",
  "./js/lab.js",
  "./js/discipline.js",
  "./js/notes.js",
  "./js/progress.js",
  "./js/planning.js",
  "./js/reports.js",
  "./js/settings.js",
  "./js/reset.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return; // never intercept writes

  // Navigations (opening/refreshing the app): try the network first so
  // updates are picked up when online, fall back to the cached shell offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Everything else (css/js/icons/fonts): cache-first, refresh in the
  // background, fall back to network if it's not cached yet.
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
