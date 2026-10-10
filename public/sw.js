// Ayala Cats offline cache: instant repeat boots and offline play.
// Registered by src/utils/offlineCache.ts as sw.js?build=<id>. Each build gets its own cache and
// the old one is dropped. Asset URLs carry the same id (?v=<id>, see BootScene), so cache-first can
// never serve a file from another build. The page itself is network-first, so a deploy shows up on
// the next online launch; offline it falls back to the cached copy.
const CACHE = `ayala-${new URL(self.location.href).searchParams.get("build")}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("ayala-") && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

/** Same-origin game files only: never the AI proxy. */
const cacheable = (url) => url.origin === self.location.origin && !url.pathname.includes("/api/");

const store = (request, response) => {
  if (response.status === 200) void caches.open(CACHE).then((cache) => cache.put(request, response)).catch(() => {});
};

/** The cached page (any query), else the app's start page; undefined when there is none. */
const cachedPage = (url) =>
  caches
    .match(url, { ignoreSearch: true })
    .then((hit) => hit ?? caches.match(self.registration.scope))
    .catch(() => undefined);

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !cacheable(new URL(request.url))) return;

  if (request.mode === "navigate") {
    // no-cache: revalidate, or the HTTP cache (GitHub Pages: max-age=600) hands back the old page after a deploy
    const network = fetch(request.url, { cache: "no-cache", credentials: "same-origin" }).then((response) => {
      store(request, response.clone());
      return response;
    });
    event.waitUntil(network.catch(() => {}));
    event.respondWith(
      (async () => {
        // One bar of signal can hang the request for a minute: after 3 s use the cached page if there is one.
        const slow = new Promise((resolve) => setTimeout(() => resolve("slow"), 3000));
        try {
          const first = await Promise.race([network, slow]);
          if (first !== "slow") return first;
          return (await cachedPage(request.url)) ?? (await network);
        } catch {
          return (await cachedPage(request.url)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    caches.match(request).catch(() => undefined).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          store(request, response.clone());
          return response;
        }),
    ),
  );
});

// The page downloads most files before this worker takes over on a first visit; it posts their
// URLs here once loading is done (re-fetched from the HTTP cache, so no second download).
self.addEventListener("message", (event) => {
  const urls = event.data?.cache;
  if (!Array.isArray(urls)) return;
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        urls.map(async (href) => {
          const url = new URL(href, self.location.href);
          if (!cacheable(url) || (await cache.match(url))) return;
          try {
            const response = await fetch(url);
            if (response.status === 200) await cache.put(url, response);
          } catch {
            // offline or gone: it will be cached the next time it is fetched
          }
        }),
      ),
    ),
  );
});
