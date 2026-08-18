const CACHE = "kids-arcade-v2";

const NAV_ROUTES = [
  "/",
  "/games/math-pop",
  "/games/robot-run",
  "/games/critter-match",
  "/games/word-drop",
  "/games/echo",
  "/games/coin-count",
  "/games/shape-sort",
  "/games/clock-quest",
  "/games/typing-rocket",
  "/games/color-mix",
  "/games/arabic-letters",
  "/games/color-book",
  "/games/tap-tunes",
  "/games/count-it",
  "/games/flag-dash",
  "/games/times-tiles",
  "/games/pattern-party",
  "/games/habitat-hop",
  "/games/rhyme-time",
  "/games/maze-dash",
  "/games/big-number",
  "/games/odd-one-out",
  "/games/opposites",
  "/games/quick-tap",
  "/games/shadow-match",
  "/games/weather-watch",
  "/games/body-bop",
  "/games/abc-order",
  "/games/fraction-feast",
  "/games/feelings",
  "/games/number-line-hop",
  "/games/first-sound",
  "/games/letter-hunt",
  "/games/baby-animals",
  "/games/sticker-scene",
  "/games/number-bonds",
  "/games/skip-count",
  "/games/add-ladder",
  "/games/plant-parts",
  "/games/jobs-tools",
  "/games/symmetry-paint",
  "/games/beat-builder",
  "/games/spell-it",
  "/games/sentence-build",
  "/games/synonyms",
  "/games/code-loops",
  "/games/mini-sudoku",
  "/games/logic-grid",
  "/games/map-quest",
  "/games/pixel-copy",
  "/games/melody-match",
  "/games/color-theory",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(NAV_ROUTES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // _next/static — immutable hashed assets, cache-first forever
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation — cache-first for instant launch, revalidate in background.
  // The installed PWA opens from cache immediately (no network round-trip on
  // launch); a fresh copy is fetched in the background for the next launch.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached || caches.match("/"));
        return cached || network;
      })
    );
    return;
  }

  // Everything else (images, fonts, audio) — stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      });
      return cached || network;
    })
  );
});
