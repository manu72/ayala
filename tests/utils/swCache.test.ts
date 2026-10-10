import { describe, expect, it, vi } from "vitest";
import swSource from "../../public/sw.js?raw";

interface PutCall {
  cache: string;
  requestUrl: string;
  body: string;
}

interface FetchEvent {
  request: { method: string; url: string; mode: string };
  waitUntil: (promise: Promise<unknown>) => void;
  respondWith: (response: Promise<Response> | Response) => void;
}

function requestUrl(request: Request | URL | string | { url?: string }): string {
  if (typeof request === "string") return request;
  if (request instanceof URL) return request.href;
  if (request instanceof Request) return request.url;
  return request.url ?? String(request);
}

function installWorker(cacheControl: string) {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const puts: PutCall[] = [];
  let releasePuts = (): void => {};
  const putGate = new Promise<void>((resolve) => {
    releasePuts = resolve;
  });
  const self = {
    location: new URL("https://game.example/ayala/sw.js?build=abc"),
    registration: { scope: "https://game.example/ayala/" },
    skipWaiting(): void {},
    clients: { claim: (): Promise<void> => Promise.resolve() },
    addEventListener(type: string, fn: (event: unknown) => void): void {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
  };
  const caches = {
    open: async (name: string) => ({
      async put(request: Request | URL | string | { url?: string }, response: Response): Promise<void> {
        const body = await response.text();
        puts.push({ cache: name, requestUrl: requestUrl(request), body });
        await putGate;
      },
      async match(): Promise<undefined> {
        return undefined;
      },
    }),
    keys: async (): Promise<string[]> => [],
    match: async (): Promise<undefined> => undefined,
    delete: async (): Promise<boolean> => true,
  };
  const fetchImpl = async (): Promise<Response> =>
    new Response("bytes", { status: 200, headers: { "Cache-Control": cacheControl } });
  const run = new Function("self", "caches", "fetch", swSource) as (
    selfArg: typeof self,
    cachesArg: typeof caches,
    fetchArg: typeof fetchImpl,
  ) => void;
  run(self, caches, fetchImpl);

  const fire = (type: string, event: unknown): void => {
    for (const fn of listeners.get(type) ?? []) fn(event);
  };
  return { fire, puts, releasePuts };
}

function track(promise: Promise<unknown>): { settled: () => boolean } {
  let done = false;
  void promise.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  return { settled: () => done };
}

function assetFetch(cacheControl: string) {
  const worker = installWorker(cacheControl);
  const waits: Promise<unknown>[] = [];
  let response: Promise<Response> | Response | undefined;
  const event: FetchEvent = {
    request: { method: "GET", url: "https://game.example/assets/a.png?v=abc", mode: "cors" },
    waitUntil(promise) {
      waits.push(promise);
    },
    respondWith(next) {
      response = next;
    },
  };
  worker.fire("fetch", event);
  if (!response) throw new Error("fetch did not respond");
  return { ...worker, waits, response: Promise.resolve(response) };
}

describe("service worker cache writes", () => {
  it("skips cache.put when Cache-Control contains no-store", async () => {
    const fetched = assetFetch("public, no-store");
    const page = await fetched.response;
    await Promise.all(fetched.waits);
    expect(fetched.puts).toEqual([]);
    expect(await page.text()).toBe("bytes");
  });

  it("stores a revalidated response and keeps the worker alive until the write finishes", async () => {
    const fetched = assetFetch("max-age=600");
    expect(fetched.waits).toHaveLength(1);
    const lifetime = track(Promise.all(fetched.waits));
    const page = await fetched.response;
    await vi.waitFor(() => expect(fetched.puts).toHaveLength(1));
    expect(lifetime.settled()).toBe(false);
    expect(await page.text()).toBe("bytes");
    expect(fetched.puts[0]).toMatchObject({ cache: "ayala-abc", body: "bytes" });

    fetched.releasePuts();
    await vi.waitFor(() => expect(lifetime.settled()).toBe(true));
  });

  it("covers the navigation write with the existing waitUntil", async () => {
    const worker = installWorker("no-cache");
    const waits: Promise<unknown>[] = [];
    let response: Promise<Response> | Response | undefined;
    const event: FetchEvent = {
      request: { method: "GET", url: "https://game.example/ayala/", mode: "navigate" },
      waitUntil(promise) {
        waits.push(promise);
      },
      respondWith(next) {
        response = next;
      },
    };
    worker.fire("fetch", event);
    expect(waits).toHaveLength(1);
    const lifetime = track(Promise.all(waits));
    if (!response) throw new Error("navigation did not respond");
    const page = await response;
    await vi.waitFor(() => expect(worker.puts).toHaveLength(1));
    expect(lifetime.settled()).toBe(false);
    expect(await page.text()).toBe("bytes");

    worker.releasePuts();
    await vi.waitFor(() => expect(lifetime.settled()).toBe(true));
  });

  it("does not cache a no-store response posted by the page", async () => {
    const worker = installWorker("no-store");
    const waits: Promise<unknown>[] = [];
    worker.fire("message", {
      data: { cache: ["https://game.example/assets/a.png"] },
      waitUntil(promise: Promise<unknown>) {
        waits.push(promise);
      },
    });
    await Promise.all(waits);
    expect(worker.puts).toEqual([]);
  });

  it("caches a posted url whose response may be stored", async () => {
    const worker = installWorker("max-age=600");
    const waits: Promise<unknown>[] = [];
    worker.fire("message", {
      data: { cache: ["https://game.example/assets/a.png"] },
      waitUntil(promise: Promise<unknown>) {
        waits.push(promise);
      },
    });
    await vi.waitFor(() => expect(worker.puts).toHaveLength(1));
    expect(worker.puts[0]?.requestUrl).toBe("https://game.example/assets/a.png");
    worker.releasePuts();
    await Promise.all(waits);
  });
});
