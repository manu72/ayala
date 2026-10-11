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

const addNpcMemory = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../src/services/ConversationStore", () => ({ addNpcMemory }));

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

/** Her press shows the cat's story and she reads it to the end. */
function hear(eggs: EasterEggSystem, cat: string): string[] | null {
  const story = eggs.catStory(cat);
  story?.heard();
  return story?.lines ?? null;
}

function makeScene(reg = new Map<string, unknown>()) {
  let hour = 12;
  const shown: string[][] = [];
  const camille = { x: 2000, y: 100, visible: true, active: true };
  const scene = {
    registry: { get: (k: string) => reg.get(k), set: (k: string, v: unknown) => reg.set(k, v) },
    dayNight: { dayCount: 4, currentPhase: "day", totalGameTimeMs: 3_000 },
    sunday: { hour: () => hour },
    places,
    map: { findObject: () => null, tileWidth: 32 },
    player: {
      x: 0,
      y: 0,
      active: true,
      flipX: false,
      isResting: false,
      body: { velocity: { length: () => 0 } },
      faceToward: vi.fn(),
      startGreeting: vi.fn(),
    },
    add: { text: stub, sprite: stub, graphics: stub, container: stub, rectangle: stub },
    anims: { exists: () => false },
    tweens: { add: vi.fn() },
    time: { now: 0, delayedCall: vi.fn() },
    cameras: { main: { width: 800, height: 600, zoom: 2.5, zoomTo: vi.fn() } },
    dialogue: { isActive: false, show: (lines: string[]) => shown.push(lines) },
    audio: { playKitten: vi.fn() },
    emotes: { show: vi.fn() },
    humans: { renderHumanBubble: vi.fn(), recordHumanLines: vi.fn() },
    camille: { activeCamilleNPC: camille, activeKishNPC: null, pendingEncounterNumber: 0 },
    trust: { global: 0, getCatTrust: () => 0 },
    npcs: [],
    scene: { get: () => ({ showNarration: vi.fn() }) },
    autoSave: vi.fn(),
  };
  return {
    scene: scene as unknown as GameScene & typeof scene,
    reg,
    shown,
    setHour: (h: number) => (hour = h),
    camille,
  };
}

describe("EasterEggSystem", () => {
  it("the Hidden Letter: picked up where it lies, carried to Camille, and read aloud", () => {
    const { scene, shown, reg } = makeScene();
    const eggs = new EasterEggSystem(scene);
    scene.player.x = 100;
    scene.player.y = 105;
    expect(eggs.tryInteract()).toBe(true); // picks it up
    expect((reg.get(EGGS_KEY) as { letter: string }).letter).toBe("carried");
    scene.player.x = 1990;
    expect(eggs.tryInteract()).toBe(true); // gives it to Camille
    const lines = shown[shown.length - 1] ?? [];
    expect(lines).toContain('"To my Corazon"');
    expect(lines).toContain('"You are the only one for me"');
    expect(lines).toContain('"With all my love"');
    expect(lines).toContain('"your nom noms"');
    expect((reg.get(EGGS_KEY) as { letter: string }).letter).toBe("given");
    // Camille says nothing, so she keeps it as a fact, not as a line she said
    expect(addNpcMemory).toHaveBeenCalledWith(
      "Camille",
      expect.objectContaining({ kind: "event", source: "scripted", gameDay: 4, timestamp: 3_000, value: expect.stringMatching(/^On day 4, Mamma Cat brought you a folded letter/) }),
    );
    expect(scene.humans.recordHumanLines).not.toHaveBeenCalled();
  });

  it("a save made mid-carry puts the item back where it lay", () => {
    const reg = new Map<string, unknown>([
      [EGGS_KEY, { letter: "carried", plush: "carried", plushAt: { x: 5, y: 6 }, kittens: [] }],
    ]);
    const { scene } = makeScene(reg);
    new EasterEggSystem(scene);
    const s = reg.get(EGGS_KEY) as { letter: string; plush: string };
    expect(s.letter).toBe("hidden");
    expect(s.plush).toBe("dropped");
  });

  it("Pedigree's collar takes three digs, and only then does she thank Mamma Cat (once)", () => {
    const { scene, shown } = makeScene(new Map([["PEDIGREE_TALKS", 1]]));
    const eggs = new EasterEggSystem(scene);
    expect(eggs.catStory("Pedigree")).toBeNull();
    scene.player.x = 700;
    scene.player.y = 110;
    eggs.tryInteract();
    eggs.tryInteract();
    expect(shown).toHaveLength(0);
    eggs.tryInteract();
    expect(shown[0]?.join(" ")).toMatch(/name on the tag is faded/);
    expect(hear(eggs, "Pedigree")?.join(" ")).toMatch(/never left her side/);
    expect(eggs.catStory("Pedigree")).toBeNull();
  });

  it("a thanks closed before its end isn't spent: it plays again and the save still owes it", () => {
    const { scene, reg } = makeScene(new Map<string, unknown>([["PEDIGREE_TALKS", 1]]));
    const eggs = new EasterEggSystem(scene);
    scene.player.x = 700;
    scene.player.y = 110;
    for (let i = 0; i < 3; i++) eggs.tryInteract();
    expect(eggs.catStory("Pedigree")).not.toBeNull(); // shown, closed early
    expect(eggs.catStory("Pedigree")?.lines.join(" ")).toMatch(/never left her side/);
    expect((reg.get(EGGS_KEY) as { pedigreeThanked?: boolean }).pedigreeThanked).toBeUndefined();
    eggs.catStory("Pedigree")?.heard();
    expect((reg.get(EGGS_KEY) as { pedigreeThanked?: boolean }).pedigreeThanked).toBe(true);
  });

  it("Blacky's Midnight Story is told only around 3am, once", () => {
    const { scene, setHour } = makeScene(new Map([["MET_BLACKY", true]]));
    const eggs = new EasterEggSystem(scene);
    setHour(1);
    expect(eggs.catStory("Blacky")).toBeNull();
    setHour(3);
    expect(hear(eggs, "Blacky")?.[1]).toMatch(/one before you/);
    expect(eggs.catStory("Blacky")).toBeNull();
  });

  it("never takes the place of a first meeting: Blacky's story and Pedigree's thanks wait until they've met her", () => {
    const { scene, reg, setHour } = makeScene();
    const eggs = new EasterEggSystem(scene);
    setHour(3);
    expect(eggs.catStory("Blacky")).toBeNull();
    scene.player.x = 700;
    scene.player.y = 110;
    eggs.tryInteract();
    eggs.tryInteract();
    eggs.tryInteract();
    expect(eggs.catStory("Pedigree")).toBeNull();
    reg.set("MET_BLACKY", true);
    reg.set("PEDIGREE_TALKS", 1);
    expect(eggs.catStory("Blacky")).not.toBeNull();
    expect(eggs.catStory("Pedigree")).not.toBeNull();
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
    // Kish remembers what she said when Mamma Cat brought it
    expect(scene.humans.recordHumanLines).toHaveBeenCalledWith(
      "Kish",
      "story",
      ["OMG it's a TINY cat! Can we keep it?"],
      "Mamma Cat brought Kish a tiny stuffed cat she had found.",
    );
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
