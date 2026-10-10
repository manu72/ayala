import { BUILD_ID } from "../config/buildId";

// The service worker (public/sw.js) keeps the game on the device: instant repeat boots and offline
// play. Production only, so the dev server never serves stale modules.
const enabled = (): boolean => import.meta.env.PROD && typeof navigator !== "undefined" && "serviceWorker" in navigator;

export function registerOfflineCache(): void {
  if (!enabled()) return;
  navigator.serviceWorker.register(`./sw.js?build=${BUILD_ID}`).catch(() => {
    // no worker: the game loads from the network as before
  });
}

/** Hand the worker everything this page has downloaded: on a first visit most of it came before the worker took over. */
export function cacheLoadedFiles(): void {
  if (!enabled()) return;
  void navigator.serviceWorker.ready.then((registration) =>
    registration.active?.postMessage({
      cache: [location.href, ...performance.getEntriesByType("resource").map((entry) => entry.name)],
    }),
  );
}
