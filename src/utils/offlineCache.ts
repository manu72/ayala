import { BUILD_ID } from "../config/buildId";

// The service worker (public/sw.js) keeps the game on the device: instant repeat boots and offline
// play. Production only, so the dev server never serves stale modules.
const enabled = (): boolean => import.meta.env.PROD && typeof navigator !== "undefined" && "serviceWorker" in navigator;

/** The registration started by registerOfflineCache, or null when that register failed. */
let registrationInFlight: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerOfflineCache(): void {
  if (!enabled()) return;
  registrationInFlight = navigator.serviceWorker.register(`./sw.js?build=${BUILD_ID}`).then(
    (registration) => registration,
    () => null, // no worker: the game loads from the network as before
  );
}

const buildOf = (worker: ServiceWorker | null): string | null => {
  if (!worker) return null;
  try {
    return new URL(worker.scriptURL).searchParams.get("build");
  } catch {
    return null;
  }
};

/** This build's worker, whether it is still installing or already active. */
const workerForBuild = (registration: ServiceWorkerRegistration): ServiceWorker | null => {
  for (const worker of [registration.installing, registration.waiting, registration.active]) {
    if (buildOf(worker) === BUILD_ID) return worker;
  }
  return null;
};

/** Resolves once activate's waitUntil has finished (old caches deleted, clients claimed). */
const whenActivated = (worker: ServiceWorker): Promise<ServiceWorker | null> => {
  if (worker.state === "activated") return Promise.resolve(worker);
  if (worker.state === "redundant") return Promise.resolve(null);
  return new Promise((resolve) => {
    const finish = (): void => {
      if (worker.state !== "activated" && worker.state !== "redundant") return;
      worker.removeEventListener("statechange", finish);
      resolve(worker.state === "activated" ? worker : null);
    };
    worker.addEventListener("statechange", finish);
    finish();
  });
};

/** Hand the worker everything this page has downloaded: on a first visit most of it came before the worker took over. */
export function cacheLoadedFiles(): void {
  if (!enabled() || !registrationInFlight) return;
  // Snapshot now. serviceWorker.ready resolves with whichever worker is already active, and during an
  // update that is the previous build — it would store these URLs in the cache the new worker deletes.
  const urls = [location.href, ...performance.getEntriesByType("resource").map((entry) => entry.name)];
  const pending = registrationInFlight;
  void pending.then(async (registration) => {
    if (!registration) return;
    const worker = workerForBuild(registration);
    if (!worker) return;
    const active = await whenActivated(worker);
    active?.postMessage({ cache: urls });
  });
}
