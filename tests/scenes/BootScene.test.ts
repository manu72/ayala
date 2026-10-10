import { describe, expect, it, vi } from "vitest";

type Handler = (...args: unknown[]) => void;

function hub() {
  const handlers = new Map<string, Handler[]>();
  return {
    on: (e: string, fn: Handler) => void handlers.set(e, [...(handlers.get(e) ?? []), fn]),
    once(e: string, fn: Handler) {
      const wrapped: Handler = (...a) => {
        handlers.set(
          e,
          (handlers.get(e) ?? []).filter((h) => h !== wrapped),
        );
        fn(...a);
      };
      this.on(e, wrapped);
    },
    removeAllListeners: (e: string) => void handlers.delete(e),
    emit: (e: string, ...a: unknown[]) => [...(handlers.get(e) ?? [])].forEach((h) => h(...a)),
  };
}

vi.mock("phaser", () => {
  class Scene {
    registry = new Map<string, unknown>();
    scene = { launch: vi.fn(), stop: vi.fn() };
    textures = { exists: () => true }; // skip the procedural canvas textures
    queued: string[] = [];
    load = Object.assign(hub(), {
      start: vi.fn(),
      xhr: { timeout: 0 },
      ...Object.fromEntries(
        ["image", "tilemapTiledJSON", "atlas", "spritesheet", "audio", "svg"].map((m) => [
          m,
          (key: string) => this.queued.push(key),
        ]),
      ),
    });
  }
  return { default: { Scene } };
});

import { ASSET_XHR_TIMEOUT_MS, ASSETS_READY, BootScene } from "../../src/scenes/BootScene";

function boot() {
  const scene = new BootScene() as unknown as {
    create(): void;
    registry: Map<string, unknown>;
    scene: { launch: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
    queued: string[];
    load: ReturnType<typeof hub> & { start: ReturnType<typeof vi.fn>; xhr: { timeout: number } };
  };
  scene.create();
  return scene;
}

describe("BootScene title-first loading", () => {
  it("shows the title at once, loads the game, then the music, then stops", () => {
    const scene = boot();
    expect(scene.scene.launch).toHaveBeenCalledWith("StartScene");
    expect(scene.registry.get(ASSETS_READY)).toBe(false);
    expect(scene.queued).toContain("atg");
    expect(scene.queued).not.toContain("bgm_ayala");

    scene.load.emit("complete", scene.load, 120, 0);
    expect(scene.registry.get(ASSETS_READY)).toBe(true);
    expect(scene.queued).toEqual(expect.arrayContaining(["bgm_ayala", "bgm_snatcher", "sfx_sunday_lights"]));
    expect(scene.load.start).toHaveBeenCalledTimes(2);
    expect(scene.scene.stop).not.toHaveBeenCalled();

    scene.load.emit("complete", scene.load, 3, 0);
    expect(scene.scene.stop).toHaveBeenCalledOnce();
  });

  it("reports a failed download instead of starting a game without its assets", () => {
    const scene = boot();
    scene.load.emit("complete", scene.load, 118, 2);
    expect(scene.registry.get(ASSETS_READY)).toBe("failed");
    expect(scene.queued).not.toContain("bgm_ayala");
    expect(scene.scene.stop).toHaveBeenCalledOnce();
  });

  it("puts the build id on asset URLs, except audio, and bounds each request", () => {
    const scene = boot();
    expect(scene.load.xhr.timeout).toBe(ASSET_XHR_TIMEOUT_MS);
    const image = { url: "assets/sprites/a.png", xhrSettings: { timeout: 0 } };
    const audio = { url: "assets/sounds/b.mp3", xhrSettings: { timeout: 0 } };
    scene.load.emit("addfile", "a", "image", scene.load, image);
    scene.load.emit("addfile", "b", "audio", scene.load, audio);
    expect(image.url).toBe("assets/sprites/a.png?v=test");
    expect(audio.url).toBe("assets/sounds/b.mp3");
    expect(image.xhrSettings.timeout).toBe(ASSET_XHR_TIMEOUT_MS);
    expect(audio.xhrSettings.timeout).toBe(ASSET_XHR_TIMEOUT_MS);
  });
});
