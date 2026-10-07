import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AudioSystem only uses Phaser for types.
vi.mock("phaser", () => ({ default: {} }));

import type Phaser from "phaser";
import { AudioSystem } from "../../src/systems/AudioSystem";
import bootSceneSource from "../../src/scenes/BootScene.ts?raw";
import tyreScreechWav from "../../public/assets/sounds/tyre_screech.wav?inline";
import carHornWav from "../../public/assets/sounds/car_horn.wav?inline";

function createSceneMock(cachedAudio: string[] = ["sfx_tyre_screech", "sfx_car_horn"]) {
  const music = () => ({ play: vi.fn(), stop: vi.fn(), setVolume: vi.fn() });
  return {
    time: { now: 0 },
    sound: { add: vi.fn(music), play: vi.fn(), remove: vi.fn() },
    cache: { audio: { exists: vi.fn((key: string) => cachedAudio.includes(key)) } },
    tweens: { add: vi.fn() },
    events: { emit: vi.fn() },
  };
}

type SceneMock = ReturnType<typeof createSceneMock>;

function startedAudio(scene: SceneMock = createSceneMock()): AudioSystem {
  const audio = new AudioSystem();
  audio.start(scene as unknown as Phaser.Scene);
  return audio;
}

/** Volumes of every one-shot `sound.play(key, …)` call for `key`. */
function playedVolumes(scene: SceneMock, key: string): number[] {
  return scene.sound.play.mock.calls
    .filter((call: unknown[]) => call[0] === key)
    .map((call: unknown[]) => (call[1] as { volume: number }).volume);
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each([
  { name: "playTyreScreech", key: "sfx_tyre_screech", base: 0.55, cooldownMs: 700 },
  { name: "playCarHorn", key: "sfx_car_horn", base: 0.45, cooldownMs: 1200 },
] as const)("AudioSystem.$name", ({ name, key, base, cooldownMs }) => {
  const play = (audio: AudioSystem, volume?: number) => audio[name](volume);

  it("is a no-op before start()", () => {
    const audio = new AudioSystem();
    expect(() => play(audio)).not.toThrow();
  });

  it("plays at the base volume by default and scales by the distance multiplier", () => {
    const scene = createSceneMock();
    const audio = startedAudio(scene);
    play(audio);
    scene.time.now += cooldownMs;
    play(audio, 0.5);
    const volumes = playedVolumes(scene, key);
    expect(volumes).toHaveLength(2);
    expect(volumes[0]).toBeCloseTo(base);
    expect(volumes[1]).toBeCloseTo(base * 0.5);
  });

  it("clamps multipliers above 1 to the base volume", () => {
    const scene = createSceneMock();
    play(startedAudio(scene), 3);
    expect(playedVolumes(scene, key)).toEqual([base]);
  });

  it("is a no-op while muted", () => {
    const scene = createSceneMock();
    const audio = startedAudio(scene);
    audio.setMuted(true);
    play(audio);
    expect(playedVolumes(scene, key)).toEqual([]);
  });

  it("is a no-op after stop()", () => {
    const scene = createSceneMock();
    const audio = startedAudio(scene);
    audio.stop();
    play(audio);
    expect(playedVolumes(scene, key)).toEqual([]);
  });

  it("is rate-limited globally so several cars can't stack", () => {
    const scene = createSceneMock();
    const audio = startedAudio(scene);
    play(audio);
    play(audio);
    scene.time.now += cooldownMs - 1;
    play(audio);
    expect(playedVolumes(scene, key)).toHaveLength(1);
    scene.time.now += 1;
    play(audio);
    expect(playedVolumes(scene, key)).toHaveLength(2);
  });

  it("skips near-silent plays without spending the cooldown", () => {
    const scene = createSceneMock();
    const audio = startedAudio(scene);
    play(audio, 0.02);
    play(audio, 0);
    play(audio, Number.NaN);
    expect(playedVolumes(scene, key)).toEqual([]);
    play(audio, 0.8);
    expect(playedVolumes(scene, key)).toHaveLength(1);
  });

  it("is a no-op (not a throw) when the asset failed to load", () => {
    const scene = createSceneMock([]);
    const audio = startedAudio(scene);
    expect(() => play(audio)).not.toThrow();
    expect(scene.sound.play).not.toHaveBeenCalled();
  });
});

describe("AudioSystem traffic SFX", () => {
  it("rate-limits the screech and the horn independently", () => {
    const scene = createSceneMock();
    const audio = startedAudio(scene);
    audio.playTyreScreech();
    audio.playCarHorn();
    expect(playedVolumes(scene, "sfx_tyre_screech")).toHaveLength(1);
    expect(playedVolumes(scene, "sfx_car_horn")).toHaveLength(1);
  });

  it.each([
    ["sfx_tyre_screech", "assets/sounds/tyre_screech.wav", tyreScreechWav],
    ["sfx_car_horn", "assets/sounds/car_horn.wav", carHornWav],
  ])("BootScene preloads %s from a small 16-bit PCM mono WAV", (key, path, dataUrl) => {
    expect(bootSceneSource).toContain(`this.load.audio("${key}", "${path}")`);

    const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (c) => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const ascii = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
    expect(ascii(0)).toBe("RIFF");
    expect(ascii(8)).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(bytes.length).toBeLessThan(100 * 1024);
  });
});
