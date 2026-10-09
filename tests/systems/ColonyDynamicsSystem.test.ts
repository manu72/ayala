import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/sprites/NPCCat", () => ({
  NPCCat: class {
    npcName: string;
    spriteKey: string;
    x: number;
    y: number;
    disposition: string;
    behaviour: unknown;
    tint: number | undefined;
    state = "idle";
    active = true;
    onErrand = false;
    inDialogue = false;
    routes: unknown[] = [];
    constructor(_scene: unknown, cfg: { name: string; spriteKey: string; x: number; y: number; disposition: string; behaviour?: unknown }) {
      this.npcName = cfg.name;
      this.spriteKey = cfg.spriteKey;
      this.x = cfg.x;
      this.y = cfg.y;
      this.disposition = cfg.disposition;
      this.behaviour = cfg.behaviour;
    }
    setTint(t: number) {
      this.tint = t;
      return this;
    }
    followRoute(route: unknown) {
      this.routes.push(route);
    }
    setManner() {}
    setHome() {}
    setAlpha() {
      return this;
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
import { NAMED_AND_MAMMA_COUNT } from "../../src/config/gameplayConstants";

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

const ROCK = { x: 4688, y: 6704 };

/** A scene with colony zones (enough to spawn the background roster) and the street colony. */
function rosterScene(registry: Map<string, unknown>) {
  const npcs: Entry[] = [];
  const scene = {
    registry: { get: (k: string) => registry.get(k), set: (k: string, v: unknown) => registry.set(k, v) },
    places: [
      { name: "colony_central", type: "colony_zone", x: 500, y: 500, props: { radius: 200 } },
      { name: "colony_west", type: "colony_zone", x: 2400, y: 3000, props: { radius: 400 } },
      { name: "street_colony", type: "street_colony", x: 4816, y: 6832, props: { radius: 72 } },
      { name: "cat_rock", type: "cat_rock", ...ROCK, props: {} },
      { name: "cat_house_1", type: "cat_house", x: 4848, y: 6864, props: {} },
      { name: "cat_house_2", type: "cat_house", x: 4880, y: 6864, props: {} },
      { name: "street_food_bowl", type: "colony_bowl", x: 4720, y: 6800, props: { source: "feeding_station" } },
    ],
    add: { image: () => ({ setOrigin: () => ({ setDepth: () => undefined }), setDepth: () => undefined }) },
    player: { x: 0, y: 0 },
    narrateIfPerceivable: () => undefined,
    territory: { visitCell: () => 0 },
    map: { tileWidth: 32, width: 290, getTileset: () => null },
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

describe("ColonyDynamicsSystem — the street colony across Ayala Ave", () => {
  it("puts Simba on his rock and two friends by the cat houses, all friendly, named on greeting, numbered clear of the park roster", () => {
    const registry = new Map<string, unknown>();
    const first = rosterScene(registry);
    const colony = new ColonyDynamicsSystem(first.scene);
    colony.spawnInitialBackgroundCats();
    colony.spawnStreetColony();
    const street = first.npcs.slice(24);
    expect(street.map((e) => e.cat.npcName)).toEqual(["Colony Cat 1001", "Colony Cat 1002", "Colony Cat 1003"]);
    const [simba, , pandan] = street.map((e) => e.cat as unknown as NPCCat & { tint: number; routes: unknown[]; behaviour: unknown });
    expect({ x: simba!.x, y: simba!.y }).toEqual(ROCK);
    expect(simba!.tint).toBe(0xf0a848);
    expect(simba!.behaviour).toMatchObject({ day: { walking: 0 } }); // he doesn't leave his rock in the sun
    expect(street.every((e) => (e.cat as unknown as { disposition: string }).disposition === "friendly")).toBe(true);
    expect(street.every((e) => colony.isStreetCat(e.cat))).toBe(true);
    expect(street.some((e) => colony.goesForWater(e.cat))).toBe(false); // their own bowl, and roads between
    expect(colony.isStreetCat(first.npcs[2]!.cat)).toBe(false);
    expect(colony.learnName(simba!)).toEqual({ name: "Simba", isNew: true });

    // after a stroll he climbs back up
    simba!.x += 30;
    (colony as unknown as { tickStreetColony: () => void }).tickStreetColony();
    expect(simba!.routes).toEqual([[ROCK]]);

    // one snatched: never back, and park newcomers still number on from the park roster
    colony.onCatRemoved(pandan);
    const second = rosterScene(registry);
    const again = new ColonyDynamicsSystem(second.scene);
    again.reconcileFromSave({ [StoryKeys.COLONY_COUNT]: registry.get(StoryKeys.COLONY_COUNT) });
    again.spawnInitialBackgroundCats();
    again.spawnStreetColony();
    expect(second.npcs.map((e) => e.cat.npcName)).not.toContain("Colony Cat 1003");
    expect(second.npcs.find((e) => e.cat.npcName === "Colony Cat 1001")!.indicator).toEqual({ name: "Simba", known: true });
    const dumped = (again as unknown as { addBackgroundCat: (x: number, y: number) => NPCCat }).addBackgroundCat(1, 1);
    expect(dumped.npcName).toBe("Colony Cat 25");
  });
});

describe("ColonyDynamicsSystem — dumped pets Mamma Cat saw arrive", () => {
  it("come back next session where they live, over the usual roster, still frightened until settled; newcomers number on past them", () => {
    const registry = new Map<string, unknown>([
      [StoryKeys.COLONY_NEWCOMERS, { 24: { comfort: 40, since: 2, x: 3000, y: 3100 }, 25: { comfort: 100, since: 1, x: 2000, y: 2100 } }],
    ]);
    const { scene, npcs } = rosterScene(registry);
    const colony = new ColonyDynamicsSystem(scene);
    colony.spawnInitialBackgroundCats();
    expect(npcs.slice(0, 24).map((e) => e.cat.npcName)).toEqual(Array.from({ length: 24 }, (_, i) => `Colony Cat ${i + 1}`));
    const [scared, settled] = npcs.slice(24).map((e) => e.cat);
    expect(scared!.npcName).toBe("Colony Cat 25");
    expect({ x: scared!.x, y: scared!.y }).toEqual({ x: 3000, y: 3100 }); // right where it lives
    expect(colony.newcomers.has(scared!)).toBe(true);
    expect(settled!.npcName).toBe("Colony Cat 26");
    expect(colony.newcomers.has(settled!)).toBe(false);
    // the frightened one stays put; settled, it goes for water like the rest
    expect([colony.goesForWater(scared!), colony.goesForWater(settled!), colony.goesForWater(npcs[5]!.cat)]).toEqual([false, true, true]);
    const dumped = (colony as unknown as { addBackgroundCat: (x: number, y: number) => NPCCat }).addBackgroundCat(1, 1);
    expect(dumped.npcName).toBe("Colony Cat 27");

    colony.onCatRemoved(scared); // snatched: gone for good
    expect(colony.newcomers.has(scared!)).toBe(false);
    expect(Object.keys(registry.get(StoryKeys.COLONY_NEWCOMERS) as object)).toEqual(["25"]);
  });
});

describe("ColonyDynamicsSystem — comforting a dumped pet", () => {
  it("counts a greeting right after it arrives, or later while it is still frightened (it ran and hid), once; never for one she didn't see arrive", () => {
    const { scene } = rosterScene(new Map());
    const record = vi.fn();
    Object.assign(scene, { scoring: { recordDumpedPetComforted: record }, time: { now: 10_000 } });
    const colony = new ColonyDynamicsSystem(scene);
    const internals = colony as unknown as { dumpedCatEventIds: WeakMap<object, number>; dumpedComfortWindowUntil: Record<number, number> };
    const [scared, calm, unseen] = [{}, {}, {}] as NPCCat[];
    [scared, calm, unseen].forEach((c, i) => internals.dumpedCatEventIds.set(c!, i + 1));
    internals.dumpedComfortWindowUntil = { 1: 5_000, 2: 5_000 }; // both windows closed; event 3 was never witnessed
    vi.spyOn(colony.newcomers, "has").mockImplementation((c) => c === scared || c === unseen);
    for (const c of [scared, calm, unseen, scared]) colony.tryCreditDumpedPetComfort(c!);
    expect(record.mock.calls).toEqual([[1]]);
  });
});

describe("ColonyDynamicsSystem — dumped pets in the colony's numbers", () => {
  const newcomers = { 24: { comfort: 40, since: 2, x: 3000, y: 3100 }, 25: { comfort: 100, since: 1, x: 2000, y: 2100 } };

  it("never spawns a newcomer twice when a lost cat lets the roster reach its number, and counts it in the colony when snatchers have thinned it", () => {
    const registry = new Map<string, unknown>([
      [StoryKeys.COLONY_LOST, [3]],
      [StoryKeys.COLONY_NEWCOMERS, newcomers],
    ]);
    // a full colony (its 42, and the two she saw arrive), one cat snatched: the roster of 24 and the two newcomers over it
    const full = rosterScene(registry);
    const colony = new ColonyDynamicsSystem(full.scene);
    colony.reconcileFromSave({ [StoryKeys.COLONY_COUNT]: 44 });
    colony.spawnInitialBackgroundCats();
    const names = full.npcs.map((e) => e.cat.npcName);
    expect(names).toHaveLength(26);
    expect(new Set(names).size).toBe(26);
    expect(names).not.toContain("Colony Cat 4");

    // thinned: 20 cats beyond the named ones, two of them the newcomers
    const thin = rosterScene(registry);
    const again = new ColonyDynamicsSystem(thin.scene);
    again.reconcileFromSave({ [StoryKeys.COLONY_COUNT]: NAMED_AND_MAMMA_COUNT + 20 });
    again.spawnInitialBackgroundCats();
    expect(thin.npcs).toHaveLength(20);
    expect(thin.npcs.filter((e) => again.newcomers.has(e.cat))).toHaveLength(1); // one still frightened, one settled
  });

  it("saves a dumped pet only if Mamma Cat saw it arrive", () => {
    for (const seen of [false, true]) {
      const registry = new Map<string, unknown>();
      const { scene } = rosterScene(registry);
      Object.assign(scene, { isNearMakatiAve: () => seen, hasLineOfSight: () => true, dialogue: { show: vi.fn() }, scene: { get: () => undefined } });
      const colony = new ColonyDynamicsSystem(scene);
      colony.spawnInitialBackgroundCats();
      const internals = colony as unknown as {
        addBackgroundCat: (x: number, y: number) => NPCCat;
        showDumpingNarration: (eventNum: number, source: NPCCat) => void;
      };
      const dumped = internals.addBackgroundCat(500, 600);
      colony.newcomers.track(dumped, 24, { comfort: 0, since: 2, x: 500, y: 600 }, false);
      internals.showDumpingNarration(1, dumped);
      expect(registry.get(StoryKeys.COLONY_NEWCOMERS)).toEqual(seen ? { 24: { comfort: 0, since: 2, x: 500, y: 600 } } : undefined);
    }
  });
});
