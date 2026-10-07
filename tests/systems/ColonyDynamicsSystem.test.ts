import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/sprites/NPCCat", () => ({
  NPCCat: class {
    npcName: string;
    spriteKey: string;
    x: number;
    y: number;
    disposition: string;
    constructor(_scene: unknown, cfg: { name: string; spriteKey: string; x: number; y: number; disposition: string }) {
      this.npcName = cfg.name;
      this.spriteKey = cfg.spriteKey;
      this.x = cfg.x;
      this.y = cfg.y;
      this.disposition = cfg.disposition;
    }
  },
}));
vi.mock("../../src/systems/ThreatIndicator", () => ({
  ThreatIndicator: class {
    constructor(_scene: unknown, _cat: unknown, public name: string, _disposition: string, public known = false) {}
    reveal() {
      this.known = true;
    }
  },
}));

import { ColonyDynamicsSystem } from "../../src/systems/ColonyDynamicsSystem";
import type { GameScene } from "../../src/scenes/GameScene";
import type { NPCCat } from "../../src/sprites/NPCCat";
import { StoryKeys } from "../../src/registry/storyKeys";
import { colonyCatName } from "../../src/utils/colonySpawn";

type Check = () => void;

/** Just the slice of GameScene the dumping car's yield check touches. */
function fakeScene() {
  const updates = new Set<Check>();
  const scene = {
    events: {
      on: (_e: string, fn: Check) => updates.add(fn),
      off: (_e: string, fn: Check) => updates.delete(fn),
    },
    player: { x: 0, y: 0 },
    time: { now: 0 },
    isOnRoad: () => false,
  };
  return { scene: scene as unknown as GameScene, updates };
}

const car = () => ({ active: true, x: 0, y: 0, displayWidth: 60, displayHeight: 30 });
const tween = () => ({ isFinished: () => false, isDestroyed: () => false, pause: vi.fn(), resume: vi.fn() });

describe("ColonyDynamicsSystem — the dumping car yielding to Mamma Cat", () => {
  it("drops its per-frame check when the car leaves, and every remaining one on shutdown", () => {
    const { scene, updates } = fakeScene();
    const colony = new ColonyDynamicsSystem(scene);
    const yieldToMamma = (c: object, t: object) =>
      (colony as unknown as { yieldToMamma: (c: object, t: object, to: object) => void }).yieldToMamma(c, t, { x: 100, y: 0 });

    const gone = car();
    yieldToMamma(gone, tween());
    yieldToMamma(car(), tween());
    expect(updates.size).toBe(2);

    gone.active = false;
    for (const check of [...updates]) check();
    expect(updates.size).toBe(1);

    colony.shutdown();
    expect(updates.size).toBe(0);
  });
});

type Tag = { name: string; known: boolean };
type Entry = { cat: NPCCat & { spriteKey: string; disposition: string }; indicator: Tag };

/** A scene with one colony zone, enough to spawn the background roster. */
function rosterScene(registry: Map<string, unknown>) {
  const npcs: Entry[] = [];
  const scene = {
    registry: { get: (k: string) => registry.get(k), set: (k: string, v: unknown) => registry.set(k, v) },
    places: [
      { name: "colony_central", type: "colony_zone", x: 500, y: 500, props: { radius: 200 } },
      { name: "colony_west", type: "colony_zone", x: 2400, y: 3000, props: { radius: 400 } },
    ],
    territory: { visitCell: () => 0 },
    map: { tileWidth: 32, width: 290 },
    physics: { add: { collider: () => undefined } },
    groundLayer: null,
    objectsLayer: null,
    npcs,
  };
  return { scene: scene as unknown as GameScene, npcs };
}

describe("ColonyDynamicsSystem — colony cats' names", () => {
  it("learns a cat's name on greeting and keeps names, looks and losses across sessions", () => {
    const registry = new Map<string, unknown>();
    const first = rosterScene(registry);
    const colony = new ColonyDynamicsSystem(first.scene);
    colony.spawnInitialBackgroundCats();
    expect(first.npcs.length).toBe(24);
    expect(first.npcs.every((e) => !e.indicator.known)).toBe(true);

    const muning = first.npcs[2]!;
    expect(colony.learnName(muning.cat)).toEqual({ name: colonyCatName(2), isNew: true });
    expect(muning.indicator).toEqual({ name: colonyCatName(2), known: true });
    expect(colony.learnName(muning.cat)).toEqual({ name: colonyCatName(2), isNew: false });
    expect(colony.learnName({} as NPCCat)).toBeNull(); // a story cat: not ours to name

    colony.onCatRemoved(first.npcs[5]!.cat); // snatched
    const dumped = (colony as unknown as { addBackgroundCat: (x: number, y: number) => NPCCat }).addBackgroundCat(1, 1);
    expect(dumped.npcName).toBe("Colony Cat 25");

    // next session, from the save
    const second = rosterScene(registry);
    const again = new ColonyDynamicsSystem(second.scene);
    again.reconcileFromSave({ [StoryKeys.COLONY_COUNT]: registry.get(StoryKeys.COLONY_COUNT) });
    again.spawnInitialBackgroundCats();
    const names = second.npcs.map((e) => e.cat.npcName);
    expect(names).not.toContain("Colony Cat 6"); // the snatched cat doesn't come back
    const muningAgain = second.npcs.find((e) => e.cat.npcName === "Colony Cat 3")!;
    expect(muningAgain.indicator).toEqual({ name: colonyCatName(2), known: true });
    expect(muningAgain.cat.spriteKey).toBe(muning.cat.spriteKey);
    expect(second.npcs.filter((e) => e.indicator.known)).toHaveLength(1);
  });

  it("houses Cat cat and Mittens together in the west colony, on Ella's walk, friendly from the start", () => {
    for (let run = 0; run < 20; run++) {
      const { scene, npcs } = rosterScene(new Map());
      new ColonyDynamicsSystem(scene).spawnInitialBackgroundCats();
      const [catcat, mittens] = npcs.map((e) => e.cat);
      expect([catcat!.disposition, mittens!.disposition]).toEqual(["friendly", "friendly"]);
      expect(Math.hypot(catcat!.x - 2400, catcat!.y - 3000)).toBeLessThanOrEqual(72);
      expect(Math.hypot(mittens!.x - catcat!.x, mittens!.y - catcat!.y)).toBeLessThanOrEqual(36);
    }
  });
});
