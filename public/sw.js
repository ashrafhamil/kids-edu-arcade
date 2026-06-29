const CACHE = "kids-arcade-v1";

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

  // Navigation — network-first, fall back to cached page then home
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/"))
        )
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
