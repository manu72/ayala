import { afterEach, describe, expect, it, vi } from "vitest";

type WorkerState = "installing" | "installed" | "activating" | "activated" | "redundant";

class FakeWorker {
  readonly messages: unknown[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly scriptURL: string,
    public state: WorkerState,
  ) {}

  addEventListener(_type: string, fn: () => void): void {
    this.listeners.add(fn);
  }

  removeEventListener(_type: string, fn: () => void): void {
    this.listeners.delete(fn);
  }

  postMessage(data: unknown): void {
    this.messages.push(data);
  }

  setState(state: WorkerState): void {
    this.state = state;
    for (const fn of [...this.listeners]) fn();
  }
}

interface Registration {
  installing: FakeWorker | null;
  waiting: FakeWorker | null;
  active: FakeWorker | null;
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function loadCache(): Promise<typeof import("../../src/utils/offlineCache")> {
  vi.resetModules();
  return import("../../src/utils/offlineCache");
}

function installNavigator(register: () => Promise<Registration>): void {
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register,
      get ready(): never {
        throw new Error("serviceWorker.ready");
      },
    },
  });
}

describe("cacheLoadedFiles", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("holds the url list until this build's worker activates, and does not message the previous one", async () => {
    vi.stubEnv("PROD", true);
    const previous = new FakeWorker("https://game.example/sw.js?build=old", "activated");
    const current = new FakeWorker("https://game.example/sw.js?build=test", "installing");
    const resources = ["https://game.example/a.png"];
    vi.stubGlobal("location", { href: "https://game.example/play" });
    vi.stubGlobal("performance", {
      getEntriesByType: () => resources.map((name) => ({ name })),
    });
    installNavigator(() => Promise.resolve({ installing: current, waiting: null, active: previous }));

    const { registerOfflineCache, cacheLoadedFiles } = await loadCache();
    registerOfflineCache();
    cacheLoadedFiles();
    resources.push("https://game.example/later.mp3");
    await flush();

    expect(previous.messages).toEqual([]);
    expect(current.messages).toEqual([]);

    current.setState("activated");
    await flush();

    expect(previous.messages).toEqual([]);
    expect(current.messages).toEqual([{ cache: ["https://game.example/play", "https://game.example/a.png"] }]);
  });

  it("messages this build immediately when its worker is already active", async () => {
    vi.stubEnv("PROD", true);
    const current = new FakeWorker("https://game.example/sw.js?build=test", "activated");
    vi.stubGlobal("location", { href: "https://game.example/" });
    vi.stubGlobal("performance", { getEntriesByType: () => [] });
    installNavigator(() => Promise.resolve({ installing: null, waiting: null, active: current }));

    const { registerOfflineCache, cacheLoadedFiles } = await loadCache();
    registerOfflineCache();
    cacheLoadedFiles();
    await flush();

    expect(current.messages).toEqual([{ cache: ["https://game.example/"] }]);
  });

  it("drops the list when this build's worker is discarded", async () => {
    vi.stubEnv("PROD", true);
    const current = new FakeWorker("https://game.example/sw.js?build=test", "installing");
    vi.stubGlobal("location", { href: "https://game.example/" });
    vi.stubGlobal("performance", { getEntriesByType: () => [] });
    installNavigator(() => Promise.resolve({ installing: current, waiting: null, active: null }));

    const { registerOfflineCache, cacheLoadedFiles } = await loadCache();
    registerOfflineCache();
    cacheLoadedFiles();
    await flush();
    current.setState("redundant");
    await flush();

    expect(current.messages).toEqual([]);
  });

  it("does not message anyone when registration fails or has not started", async () => {
    vi.stubEnv("PROD", true);
    vi.stubGlobal("location", { href: "https://game.example/" });
    vi.stubGlobal("performance", { getEntriesByType: () => [{ name: "https://game.example/a.png" }] });
    installNavigator(() => Promise.reject(new Error("blocked")));

    const { registerOfflineCache, cacheLoadedFiles } = await loadCache();
    cacheLoadedFiles();
    registerOfflineCache();
    cacheLoadedFiles();
    await flush();
  });
});
