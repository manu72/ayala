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

/** cache.put rejects a 200 whose Cache-Control directive contains no-store. */
const storable = (response) => {
  if (response.status !== 200) return false;
  const control = response.headers.get("Cache-Control") ?? "";
  return !control.split(",").some((directive) => directive.trim().toLowerCase().startsWith("no-store"));
};

/** Resolves when the write finishes or is skipped. Callers hand it to waitUntil. */
const store = (request, response) => {
  if (!storable(response)) return Promise.resolve();
  return caches
    .open(CACHE)
    .then((cache) => cache.put(request, response.clone()))
    .catch(() => {});
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
    // no-cache: revalidate, or the HTTP cache (GitHub Pages: max-age=600) hands back the old page after a deploy.
    // `write` is assigned inside `network`'s first reaction, before this waitUntil continuation reads it.
    let write = Promise.resolve();
    const network = fetch(request.url, { cache: "no-cache", credentials: "same-origin" }).then((response) => {
      write = store(request, response);
      return response;
    });
    event.waitUntil(network.then(() => write).catch(() => {}));
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

  // Same ordering as navigation: the write promise is stored before `opened` fulfills, so waitUntil covers it.
  let write = Promise.resolve();
  const opened = caches
    .match(request)
    .catch(() => undefined)
    .then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        write = store(request, response);
        return response;
      });
    });
  event.waitUntil(opened.then(() => write).catch(() => {}));
  event.respondWith(opened);
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
            if (storable(response)) await cache.put(url, response);
          } catch {
            // offline or gone: it will be cached the next time it is fetched
          }
        }),
      ),
    ),
  );
});
