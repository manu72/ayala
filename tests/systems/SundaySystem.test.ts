import { afterEach, describe, expect, it, vi } from "vitest";
import map from "../../public/assets/tilemaps/atg.json";

vi.mock("phaser", () => {
  class EventEmitter {
    private handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
    on(event: string, fn: (...args: unknown[]) => void): this {
      (this.handlers[event] ??= []).push(fn);
      return this;
    }
    emit(event: string, ...args: unknown[]): boolean {
      for (const fn of this.handlers[event] ?? []) fn(...args);
      return true;
    }
  }
  return {
    default: {
      Events: { EventEmitter },
      Math: {
        Clamp: (n: number, a: number, b: number) => Math.max(a, Math.min(b, n)),
        Distance: { Between: (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by) },
        Angle: { Between: (ax: number, ay: number, bx: number, by: number) => Math.atan2(by - ay, bx - ax) },
      },
      BlendModes: { ADD: 1 },
    },
  };
});

import type { GameScene } from "../../src/scenes/GameScene";
import { DayNightCycle, DAY_NIGHT_FULL_CYCLE_MS, type TimeOfDay } from "../../src/systems/DayNightCycle";
import { SundaySystem, SUNDAY_CLOSED_ROADS } from "../../src/systems/SundaySystem";
import { TrafficSystem } from "../../src/systems/TrafficSystem";
import { readPlaces, type TiledObjectLike } from "../../src/utils/mapPlaces";

interface Node {
  kind: string;
  texture: string;
  x: number;
  y: number;
  alpha: number;
  visible: boolean;
  active: boolean;
  depth: number;
  children: Node[];
  fillRect: ReturnType<typeof vi.fn>;
  anims: { stop: ReturnType<typeof vi.fn> };
  destroy: () => void;
  [key: string]: unknown;
}

// Use the shipped geography, so an incorrect market segment cannot silently pass.
const placesLayer = map.layers.find((l) => l.name === "places");
const places = readPlaces((placesLayer?.objects ?? []) as TiledObjectLike[]);
const sunday = () => new Date(2026, 9, 11, 12);

function fixture(date = sunday) {
  const nodes: Node[] = [];
  const callbacks: Array<() => void> = [];
  const tweenCalls: Array<{ targets: Node; onComplete?: () => void }> = [];
  function display(kind: string, x = 0, y = 0, texture = ""): Node {
    const data = new Map<string, unknown>();
    const n = { kind, texture, x, y, alpha: 1, visible: true, active: true, depth: 0, children: [], anims: { stop: vi.fn() } } as unknown as Node;
    const mutations: Record<string, (...args: never[]) => void> = {
      setPosition: (x: number, y: number) => { n.x = x; n.y = y; },
      setY: (y: number) => { n.y = y; },
      setAlpha: (a: number) => { n.alpha = a; },
      setVisible: (v: boolean) => { n.visible = v; },
      setDepth: (d: number) => { n.depth = d; },
      setTexture: (t: string) => { n.texture = t; },
      setData: (key: string, value: unknown) => { data.set(key, value); },
      add: (child: Node) => { n.children.push(child); },
      setFillStyle: (color: number, alpha: number) => { n.fillColor = color; n.fillAlpha = alpha; },
    };
    for (const name of [...Object.keys(mutations), "setScrollFactor", "setRotation", "setScale", "setFlipX", "setOrigin", "setFrame", "setTint", "setBlendMode", "play", "clear", "fillStyle", "fillRect", "fillCircle", "fillTriangle", "lineStyle", "strokeRect", "strokeCircle", "strokeTriangle", "fillPoints"]) {
      n[name] = vi.fn((...args: never[]) => { mutations[name]?.(...args); return n; });
    }
    n.getData = (key: string) => data.get(key);
    n.destroy = () => { n.active = false; n.visible = false; for (const c of n.children) c.destroy(); };
    nodes.push(n);
    return n;
  }
  let cars = 0;
  const registry = new Map<string, unknown>();
  const scene = {
    places,
    registry: { get: (key: string) => registry.get(key) },
    cameras: { main: { width: 800, height: 600, worldView: { x: 3300, y: 1200, width: 3100, height: 1400 } } },
    add: {
      rectangle: () => display("rectangle"),
      container: (x: number, y: number) => display("container", x, y),
      graphics: () => display("graphics"),
      sprite: (x: number, y: number, texture: string) => display("sprite", x, y, texture),
      image: (x: number, y: number, texture: string) => display("image", x, y, texture),
      text: (x: number, y: number, text: string) => display("text", x, y, text),
    },
    traffic: { setClosedRoads: vi.fn(), carsOnClosedRoads: () => cars },
    forage: { setMarketSpots: vi.fn() },
    player: { x: -10000, y: -10000, isResting: false, body: { velocity: { length: () => 1 } }, startle: vi.fn() },
    playerInputFrozen: false,
    dialogue: { isActive: false },
    emotes: { show: vi.fn() },
    tweens: { add: vi.fn((c) => tweenCalls.push(c)), killTweensOf: vi.fn() },
    time: { delayedCall: (_ms: number, callback: () => void) => callbacks.push(callback) },
    anims: { exists: () => true },
    audio: { setFestival: vi.fn() },
    scene: { get: () => ({ showNarration: vi.fn() }) },
    map: { tileWidth: 32, findObject: () => ({ x: 4800, y: 3800 }) },
    textures: { exists: () => true },
    overheadLayer: { forEachTile: () => {} },
    isInPark: () => true,
  };
  const dayNight = new DayNightCycle(scene as unknown as GameScene);
  const fullScene = { ...scene, dayNight };
  function setHour(h: number, day = 2) {
    const phase: TimeOfDay = h < 6 || h >= 21 ? "night" : h < 10 ? "dawn" : h < 17 ? "day" : "evening";
    const offset = phase === "dawn" ? (h - 6) * 45000
      : phase === "day" ? 180000 + (h - 10) * 180000 / 7
      : phase === "evening" ? 360000 + (h - 17) * 75000
      : 660000 + ((h - 21 + 24) % 24) * 20000;
    dayNight.restore(phase, (day - 1) * DAY_NIGHT_FULL_CYCLE_MS + offset);
  }
  setHour(6);
  const system = new SundaySystem(fullScene as unknown as GameScene, date);
  dayNight.on("newDay", () => system.startDay());
  return { scene: fullScene, system, dayNight, setHour, nodes, callbacks, tweenCalls, registry, setCars: (n: number) => { cars = n; } };
}

afterEach(() => vi.unstubAllGlobals());

describe("Sunday market", () => {
  it.each([6, 9.99, 10, 13.5, 17, 20, 20.99])("opens at in-game %s when continuing a Sunday save", (hour) => {
    const f = fixture();
    f.setHour(hour);
    f.system.startDay();
    // The closure must happen before GameScene calls TrafficSystem.update/prewarm.
    expect(f.scene.traffic.setClosedRoads).toHaveBeenCalledWith(SUNDAY_CLOSED_ROADS);
    f.system.update(100, 16);
    expect(f.system.marketOpen).toBe(true);
    expect(f.scene.forage.setMarketSpots).toHaveBeenCalledTimes(1);
    expect(f.scene.forage.setMarketSpots.mock.calls[0]?.[0].length).toBeGreaterThan(100);
    expect(f.nodes.filter((n) => n.kind === "sprite" && ["fluffy", "tiger"].includes(n.texture) && n.visible)).toHaveLength(2);
  });

  it("retains its stalls and finds past 10:00, without the old morning fade or repeated rolls", () => {
    const f = fixture();
    f.system.startDay();
    f.system.update(0, 16);
    const stalls = f.nodes.find((n) => n.kind === "container");
    expect(stalls?.children).toHaveLength(71); // 70 stall drawings and the programme
    for (const hour of [9.5, 10, 16, 20]) {
      f.setHour(hour);
      f.system.update(hour * 1000, 16);
      expect(f.system.marketOpen).toBe(true);
      expect(stalls?.alpha).toBe(1);
    }
    expect(f.scene.forage.setMarketSpots).toHaveBeenCalledTimes(1);
  });

  it("clears people and finds at nightfall, then lifts the barriers before reopening traffic", () => {
    const f = fixture();
    f.setHour(13);
    f.system.startDay();
    f.system.update(0, 16);
    const marketPeople = f.nodes.filter((n) => n.kind === "sprite" && n.texture !== "guard");
    f.setHour(21);
    f.system.update(1000, 16);
    expect(f.system.marketOpen).toBe(false);
    expect(marketPeople.every((n) => !n.active)).toBe(true);
    expect(f.scene.forage.setMarketSpots).toHaveBeenLastCalledWith(null);
    expect(f.scene.traffic.setClosedRoads).not.toHaveBeenCalledWith([]);
    expect(f.system.marketStatus).toContain("reopening");
    f.setHour(21.5);
    f.system.update(2000, 16);
    expect(f.scene.traffic.setClosedRoads).toHaveBeenLastCalledWith([]);
    expect(f.nodes.filter((n) => n.texture === "guard").every((n) => !n.active)).toBe(true);
  });

  it("starts night duty at 03:00, waits for cars, then sets up incrementally and opens ready at dawn", () => {
    const f = fixture();
    f.setHour(2.99, 1);
    f.system.startDay();
    f.system.update(0, 16);
    expect(f.scene.traffic.setClosedRoads).not.toHaveBeenCalled();
    f.setCars(2);
    f.setHour(3, 1);
    f.system.update(1000, 16);
    expect(f.nodes.filter((n) => n.texture === "guard")).toHaveLength(2);
    const barrier = f.nodes.find((n) => n.kind === "graphics");
    f.setHour(4.75, 1);
    f.system.update(2000, 16);
    expect(barrier?.fillRect).not.toHaveBeenCalled();
    expect(f.nodes.filter((n) => n.kind === "container")).toHaveLength(0);
    f.setCars(0);
    f.setHour(5, 1);
    f.system.update(3000, 16);
    expect(barrier?.fillRect).toHaveBeenCalled();
    const stallArt = f.nodes.find((n) => n.kind === "container")?.children.slice(1) ?? [];
    expect(stallArt).toHaveLength(70);
    expect(stallArt.some((n) => n.alpha > 0 && n.alpha < 1)).toBe(true);
    expect(stallArt.some((n) => n.alpha === 0)).toBe(true);
    expect(f.system.marketOpen).toBe(false);
    expect(f.scene.forage.setMarketSpots).not.toHaveBeenCalled();
    f.dayNight.update(20000); // 05:00 → 06:00, emitting the real newDay event
    f.system.update(4000, 16);
    expect(f.dayNight.dayCount).toBe(2);
    expect(f.system.marketOpen).toBe(true);
    expect(stallArt.every((n) => n.alpha === 1)).toBe(true);
    expect(f.nodes.filter((n) => n.texture === "guard")).toHaveLength(2);
    expect(f.scene.forage.setMarketSpots).toHaveBeenCalledTimes(1);
  });

  it("never places stalls among cars still held up by Mamma Cat, even after dawn", () => {
    const f = fixture();
    f.setCars(1);
    f.system.startDay();
    f.system.update(0, 16);
    expect(f.system.marketOpen).toBe(false);
    expect(f.scene.forage.setMarketSpots).not.toHaveBeenCalled();
    f.setCars(0);
    f.system.update(1000, 16);
    expect(f.system.marketOpen).toBe(true);
  });

  it("drains actual traffic before creating a market on the shipped Paseo lanes", () => {
    const f = fixture();
    let seed = 7;
    const traffic = new TrafficSystem(f.scene as unknown as GameScene, places, { maxCars: 140, rng: () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646 });
    for (let i = 0; i < 3600; i++) traffic.update(1000 / 60, { currentPhase: "night", phaseProgress: 0.999 });
    f.scene.traffic.setClosedRoads.mockImplementation((roads) => traffic.setClosedRoads(roads));
    f.scene.traffic.carsOnClosedRoads = () => traffic.carsOnClosedRoads();
    f.system.startDay();
    expect(traffic.carsOnClosedRoads()).toBeGreaterThan(0);
    f.system.update(0, 16);
    expect(f.system.marketOpen).toBe(false);
    for (let i = 0; i < 3600 && !f.system.marketOpen; i++) {
      traffic.update(1000 / 60, { currentPhase: "dawn", phaseProgress: 0 });
      f.system.update(i * 1000 / 60, 1000 / 60);
    }
    expect(traffic.carsOnClosedRoads()).toBe(0);
    expect(f.system.marketOpen).toBe(true);
    expect(traffic.carCount).toBeGreaterThan(0); // Ayala and Makati traffic continues
  });

  it("honours the ticket's Day 2 start, weekdays, and the explicit URL override", () => {
    const first = fixture();
    first.setHour(6, 1);
    first.system.startDay();
    first.system.update(0, 16);
    expect(first.system.marketOpen).toBe(false);
    const monday = fixture(() => new Date(2026, 9, 12));
    monday.system.startDay();
    monday.system.update(0, 16);
    expect(monday.system.marketOpen).toBe(false);
    monday.setHour(5);
    monday.system.update(1, 16);
    expect(monday.scene.traffic.setClosedRoads).not.toHaveBeenCalled();
    vi.stubGlobal("window", { location: { search: "?sunday=1" } });
    monday.setHour(13);
    monday.system.startDay();
    monday.system.update(2, 16);
    expect(monday.system.marketOpen).toBe(true);
  });

  it.each([3, 4.25, 5.5])("recovers a night save loaded at %s without opening the market early", (hour) => {
    const f = fixture();
    f.setHour(hour, 1);
    f.system.startDay();
    f.system.update(0, 16);
    expect(f.system.marketOpen).toBe(false);
    f.setHour(6, 2);
    f.system.startDay();
    f.system.update(1, 16);
    expect(f.system.marketOpen).toBe(true);
  });

  it("uses the new local date to prepare across midnight and cancels preparation on Monday", () => {
    let now = new Date(2026, 9, 10, 23, 59);
    const f = fixture(() => now);
    f.setHour(5, 1);
    f.system.startDay();
    f.system.update(0, 16);
    expect(f.scene.traffic.setClosedRoads).not.toHaveBeenCalled();
    now = new Date(2026, 9, 11, 0, 1);
    f.system.update(1000, 16);
    expect(f.scene.traffic.setClosedRoads).toHaveBeenCalledWith(SUNDAY_CLOSED_ROADS);
    now = new Date(2026, 9, 12, 0, 1);
    f.setHour(6, 2);
    f.system.startDay();
    f.system.update(2000, 16);
    expect(f.system.marketOpen).toBe(false);
    expect(f.scene.traffic.setClosedRoads).toHaveBeenLastCalledWith([]);
  });

  it("lets visitors greet her once, and respects rest and story scenes", () => {
    const f = fixture();
    f.system.startDay();
    f.system.update(0, 16);
    const cat = f.nodes.find((n) => n.texture === "fluffy");
    expect(cat).toBeDefined();
    f.scene.player.x = cat!.x;
    f.scene.player.y = cat!.y;
    f.scene.player.isResting = true;
    f.system.update(100, 16);
    expect(f.scene.emotes.show).not.toHaveBeenCalled();
    f.scene.player.isResting = false;
    f.scene.dialogue.isActive = true;
    f.system.update(200, 16);
    expect(f.scene.emotes.show).not.toHaveBeenCalled();
    f.scene.dialogue.isActive = false;
    f.system.update(300, 16);
    expect(f.scene.emotes.show).toHaveBeenCalledWith(f.scene, cat, "heart");
    f.system.update(10000, 16);
    expect(f.scene.emotes.show).toHaveBeenCalledTimes(1);
  });

  it("removes the visiting child and prevents delayed dialogue after closing", () => {
    const f = fixture();
    f.setHour(13);
    f.system.startDay();
    f.system.update(0, 16);
    f.scene.player.x = (3466.21952 + 6264.21952) / 2;
    f.scene.player.y = (2246.1688 + 1357.2688) / 2;
    f.scene.player.body.velocity.length = () => 0;
    f.system.update(100, 3000);
    const visit = f.tweenCalls.find((c) => c.targets.texture === "crowd_student" && c.onComplete);
    expect(visit).toBeDefined();
    visit!.onComplete!();
    f.setHour(21);
    f.system.update(200, 16);
    expect(visit!.targets.active).toBe(false);
    expect(f.scene.tweens.killTweensOf).toHaveBeenCalledWith(visit!.targets);
    const count = f.nodes.length;
    for (const callback of f.callbacks) callback();
    expect(f.nodes).toHaveLength(count);
  });

  it("destroys a partially built market and reopens its roads on scene shutdown", () => {
    const f = fixture();
    f.setHour(5.5, 1);
    f.system.startDay();
    f.system.update(0, 16);
    f.system.destroy();
    expect(f.nodes.filter((n) => n.kind !== "rectangle").every((n) => !n.active)).toBe(true);
    expect(f.scene.traffic.setClosedRoads).toHaveBeenLastCalledWith([]);
    expect(f.system.marketOpen).toBe(false);
  });
});
