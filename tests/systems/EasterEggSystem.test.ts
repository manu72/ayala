import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Math: {
      Distance: { Between: (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by) },
      Clamp: (v: number, a: number, b: number) => Math.min(b, Math.max(a, v)),
      RandomDataGenerator: class {
        between = () => 20;
        frac = () => 0.5;
      },
    },
    Cameras: { Scene2D: { Events: { FADE_OUT_COMPLETE: "fade" } } },
  },
}));

import { EasterEggSystem, EGGS_KEY } from "../../src/systems/EasterEggSystem";
import type { GameScene } from "../../src/scenes/GameScene";

/** Anything Phaser draws: every method returns the object itself. */
function stub(): unknown {
  const target: Record<string, unknown> = { x: 0, y: 0, active: true, alpha: 1 };
  const p: unknown = new Proxy(target, {
    get: (t, k: string) => (k in t ? t[k] : () => p),
  });
  return p;
}

const places = [
  { name: "egg_letter", type: "egg_letter", x: 100, y: 100, props: {} },
  { name: "egg_plush", type: "egg_plush", x: 400, y: 100, props: {} },
  { name: "egg_collar", type: "egg_collar", x: 700, y: 100, props: {} },
  { name: "egg_kitten_1", type: "egg_kitten", x: 1000, y: 100, props: {} },
  { name: "egg_kitten_2", type: "egg_kitten", x: 1300, y: 100, props: {} },
];

function makeScene(reg = new Map<string, unknown>()) {
  let hour = 12;
  const shown: string[][] = [];
  const camille = { x: 2000, y: 100, visible: true, active: true };
  const scene = {
    registry: { get: (k: string) => reg.get(k), set: (k: string, v: unknown) => reg.set(k, v) },
    dayNight: { dayCount: 4, currentPhase: "day" },
    sunday: { hour: () => hour },
    places,
    map: { findObject: () => null, tileWidth: 32 },
    player: { x: 0, y: 0, active: true, flipX: false, isResting: false, body: { velocity: { length: () => 0 } }, faceToward: vi.fn(), startGreeting: vi.fn() },
    add: { text: stub, sprite: stub, graphics: stub, container: stub, rectangle: stub },
    anims: { exists: () => false },
    tweens: { add: vi.fn() },
    time: { now: 0, delayedCall: vi.fn() },
    cameras: { main: { width: 800, height: 600, zoom: 2.5, zoomTo: vi.fn() } },
    dialogue: { isActive: false, show: (lines: string[]) => shown.push(lines) },
    audio: { playKitten: vi.fn() },
    emotes: { show: vi.fn() },
    humans: { renderHumanBubble: vi.fn() },
    camille: { activeCamilleNPC: camille, activeKishNPC: null, pendingEncounterNumber: 0 },
    trust: { global: 0, getCatTrust: () => 0 },
    npcs: [],
    scene: { get: () => ({ showNarration: vi.fn() }) },
    autoSave: vi.fn(),
  };
  return { scene: scene as unknown as GameScene & typeof scene, reg, shown, setHour: (h: number) => (hour = h), camille };
}

describe("EasterEggSystem", () => {
  it("the Hidden Letter: picked up where it lies, carried to Camille, and read: nom noms", () => {
    const { scene, shown, reg } = makeScene();
    const eggs = new EasterEggSystem(scene);
    scene.player.x = 100;
    scene.player.y = 105;
    expect(eggs.tryInteract()).toBe(true); // picks it up
    expect((reg.get(EGGS_KEY) as { letter: string }).letter).toBe("carried");
    scene.player.x = 1990;
    expect(eggs.tryInteract()).toBe(true); // gives it to Camille
    expect(shown[shown.length - 1]).toContain("\"nom noms\"");
    expect((reg.get(EGGS_KEY) as { letter: string }).letter).toBe("given");
  });

  it("a save made mid-carry puts the item back where it lay", () => {
    const reg = new Map<string, unknown>([[EGGS_KEY, { letter: "carried", plush: "carried", plushAt: { x: 5, y: 6 }, kittens: [] }]]);
    const { scene } = makeScene(reg);
    new EasterEggSystem(scene);
    const s = reg.get(EGGS_KEY) as { letter: string; plush: string };
    expect(s.letter).toBe("hidden");
    expect(s.plush).toBe("dropped");
  });

  it("Pedigree's collar takes three digs, and only then does she thank Mamma Cat (once)", () => {
    const { scene, shown } = makeScene(new Map([["PEDIGREE_TALKS", 1]]));
    const eggs = new EasterEggSystem(scene);
    expect(eggs.takeCatLines("Pedigree")).toBeNull();
    scene.player.x = 700;
    scene.player.y = 110;
    eggs.tryInteract();
    eggs.tryInteract();
    expect(shown).toHaveLength(0);
    eggs.tryInteract();
    expect(shown[0]?.join(" ")).toMatch(/name on the tag is faded/);
    expect(eggs.takeCatLines("Pedigree")?.join(" ")).toMatch(/never left her side/);
    expect(eggs.takeCatLines("Pedigree")).toBeNull();
  });

  it("Blacky's Midnight Story is told only around 3am, once", () => {
    const { scene, setHour } = makeScene(new Map([["MET_BLACKY", true]]));
    const eggs = new EasterEggSystem(scene);
    setHour(1);
    expect(eggs.takeCatLines("Blacky")).toBeNull();
    setHour(3);
    expect(eggs.takeCatLines("Blacky")?.[1]).toMatch(/one before you/);
    expect(eggs.takeCatLines("Blacky")).toBeNull();
  });

  it("never takes the place of a first meeting: Blacky's story and Pedigree's thanks wait until they've met her", () => {
    const { scene, reg, setHour } = makeScene();
    const eggs = new EasterEggSystem(scene);
    setHour(3);
    expect(eggs.takeCatLines("Blacky")).toBeNull();
    scene.player.x = 700;
    scene.player.y = 110;
    eggs.tryInteract();
    eggs.tryInteract();
    eggs.tryInteract();
    expect(eggs.takeCatLines("Pedigree")).toBeNull();
    reg.set("MET_BLACKY", true);
    reg.set("PEDIGREE_TALKS", 1);
    expect(eggs.takeCatLines("Blacky")).not.toBeNull();
    expect(eggs.takeCatLines("Pedigree")).not.toBeNull();
  });

  it("once the plush is given to Kish it can't be picked up (and handed over) again", () => {
    const { scene, reg } = makeScene();
    const kish = { x: 2000, y: 400, visible: true, active: true };
    (scene.camille as { activeKishNPC: unknown }).activeKishNPC = kish;
    const eggs = new EasterEggSystem(scene);
    scene.player.x = 400;
    scene.player.y = 105;
    expect(eggs.tryInteract()).toBe(true); // picks it up
    scene.player.x = 1990;
    scene.player.y = 400;
    expect(eggs.tryInteract()).toBe(true); // gives it to Kish
    expect((reg.get(EGGS_KEY) as { plush: string }).plush).toBe("given");
    scene.player.x = 400;
    scene.player.y = 105;
    expect(eggs.tryInteract()).toBe(false);
    expect((reg.get(EGGS_KEY) as { plush: string }).plush).toBe("given");
  });

  it("the gathering stays available when none of the named cats is about", () => {
    const { scene, reg } = makeScene();
    scene.dayNight.currentPhase = "evening";
    (scene.camille as { pendingEncounterNumber: number }).pendingEncounterNumber = 5;
    scene.trust.getCatTrust = () => 100;
    const eggs = new EasterEggSystem(scene);
    eggs.update(0, 16);
    expect((reg.get(EGGS_KEY) as { gathered?: boolean }).gathered).toBeUndefined();
  });

  it("finds each hidden kitten once, when she comes close", () => {
    const { scene, reg } = makeScene();
    const eggs = new EasterEggSystem(scene);
    scene.player.x = 1000;
    scene.player.y = 140;
    eggs.update(0, 16);
    eggs.update(16, 16);
    expect(eggs.kittenCount()).toEqual({ found: 1, total: 2 });
    expect(scene.audio.playKitten).toHaveBeenCalledTimes(1);
    expect((reg.get(EGGS_KEY) as { kittens: number[] }).kittens).toEqual([0]);
  });
});
