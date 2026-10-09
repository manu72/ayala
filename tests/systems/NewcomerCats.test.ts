import { describe, expect, it, vi } from "vitest";
import { NewcomerCats } from "../../src/systems/NewcomerCats";
import type { GameScene } from "../../src/scenes/GameScene";
import type { NPCCat } from "../../src/sprites/NPCCat";
import { StoryKeys } from "../../src/registry/storyKeys";

type Point = { x: number; y: number };
type Errand = { route: Point[]; done: () => void; run: boolean };

function fakeCat(x: number, y: number) {
  return {
    x,
    y,
    active: true,
    state: "idle",
    onErrand: false,
    inDialogue: false,
    alpha: 1,
    speed: 35,
    habits: undefined as unknown,
    home: null as null | { x: number; y: number; r: number },
    errand: null as null | Errand,
    setAlpha(a: number) {
      this.alpha = a;
      return this;
    },
    setManner(speed = 35, habits?: unknown) {
      this.speed = speed;
      this.habits = habits;
    },
    setHome(hx: number, hy: number, r: number) {
      this.home = { x: hx, y: hy, r };
    },
    followRoute(route: Point[], done: () => void, run = false) {
      this.errand = { route, done, run };
      this.onErrand = true;
    },
    /** As NPCCat: an alert stops a walk, but not a cat already running. */
    triggerAlert() {
      if (this.state === "fleeing" || this.errand?.run) return;
      Object.assign(this, { state: "alert", errand: null, onErrand: false });
    },
    triggerFlee() {
      Object.assign(this, { state: "fleeing", alpha: 1, errand: null, onErrand: false });
    },
    /** Walk (or run) the errand to its end. */
    arrive() {
      const e = this.errand!;
      Object.assign(this, e.route[e.route.length - 1]!, { errand: null, onErrand: false });
      e.done();
    },
  };
}
type Cat = ReturnType<typeof fakeCat>;

/** Shrubs at these cell corners; a flower bed and a bench are no cover. */
const BUSHES = { east: { x: 1088, y: 992 }, west: { x: 896, y: 992 }, south: { x: 992, y: 1280 } };
const centre = (b: Point) => ({ x: b.x + 16, y: b.y + 16 });

function world() {
  const registry = new Map<string, unknown>();
  const people: Point[] = [];
  const player = { x: 0, y: 0, isMoving: false, isCrouching: false, isRunning: false, isResting: false, isCatloaf: false };
  const tile = (index: number, cx: number, cy: number) => ({ index, x: cx, y: cy, pixelX: cx * 32, pixelY: cy * 32, width: 32, height: 32, collides: false });
  const tiles = [...Object.values(BUSHES).map((b) => tile(1224, b.x / 32, b.y / 32)), tile(1100, 33, 32), tile(31, 32, 30)];
  // a tree's canopy, 3 x 3 cells with its trunk under the middle of the top row: cover only in its middle
  const canopy = new Map<string, ReturnType<typeof tile>>();
  for (let cx = 10; cx <= 12; cx++) for (let cy = 10; cy <= 12; cy++) canopy.set(`${cx},${cy}`, tile(500, cx, cy));
  const scene = {
    registry: { get: (k: string) => registry.get(k), set: (k: string, v: unknown) => registry.set(k, v) },
    time: { now: 0 },
    dialogue: { isActive: false },
    player,
    dayNight: { dayCount: 1 },
    narrateIfPerceivable: vi.fn(),
    emotes: { show: vi.fn() },
    personNear: (x: number, y: number, r: number) => people.find((p) => Math.hypot(p.x - x, p.y - y) <= r) ?? null,
    npcs: [] as Array<{ cat: Cat }>,
    catRoute: (_from: Point, to: Point): Point[] | null => [to],
    objectsLayer: { filterTiles: (fn: (t: (typeof tiles)[number]) => boolean) => tiles.filter(fn), getTileAt: () => null },
    overheadLayer: { filterTiles: (fn: (t: (typeof tiles)[number]) => boolean) => [...canopy.values()].filter(fn), getTileAt: (x: number, y: number) => canopy.get(`${x},${y}`) ?? null },
    groundLayer: { getTileAt: (x: number, y: number) => (x === 11 && y === 10 ? { collides: true } : null) },
    map: { getTileset: (name: string) => (name === "plants" ? { firstgid: 1065, total: 512 } : null) },
  };
  const newcomers = new NewcomerCats(scene as unknown as GameScene);
  const tick = (ms = 100) => {
    scene.time.now += ms;
    newcomers.update(ms);
  };
  const add = (index: number, saved = true, comfort = 0, at: Point = { x: 1000, y: 1000 }) => {
    const cat = fakeCat(at.x, at.y);
    scene.npcs.push({ cat });
    newcomers.track(cat as unknown as NPCCat, index, { comfort, since: 1, ...at }, saved);
    return cat;
  };
  const saved = () => registry.get(StoryKeys.COLONY_NEWCOMERS) as Record<string, { comfort: number; x: number; y: number }> | undefined;
  return { scene, player, people, newcomers, tick, add, saved };
}

describe("NewcomerCats — dumped pets finding their feet", () => {
  it("hides in shrubs and deep under trees' canopies, not in flower beds", () => {
    const w = world();
    const cover = (w.newcomers as unknown as { cover: () => Point[] }).cover();
    expect(cover).toEqual([...Object.values(BUSHES).map(centre), { x: 11 * 32 + 16, y: 11 * 32 + 16 }]);
  });

  it("a hider bolts for the nearest bush away from her, hides there, bears her sitting by it, and is flushed only by her walking right up", () => {
    const w = world();
    const cat = w.add(24, false);
    expect(cat.speed).toBeLessThan(35); // it skulks
    // Mamma Cat walks up from the west
    Object.assign(w.player, { x: 880, y: 1000, isMoving: true });
    w.tick();
    expect(w.scene.emotes.show).toHaveBeenCalledWith(w.scene, cat, "alert");
    expect(cat.errand).toMatchObject({ run: true, route: [centre(BUSHES.east)] }); // not the west bush, by her
    cat.arrive();
    expect(cat.alpha).toBeLessThan(0.5);
    expect(cat.habits).toMatchObject({ day: { walking: 0 } }); // in its bush it doesn't stir
    expect(cat.home).toEqual({ ...centre(BUSHES.east), r: 8 });

    // she sits down beside it: it stays put
    Object.assign(w.player, { x: cat.x - 50, y: cat.y, isMoving: false, isResting: true });
    w.tick(1000);
    expect(cat.errand).toBeNull();
    // she creeps up crouched: still put
    Object.assign(w.player, { x: cat.x + 20, isResting: false, isMoving: true, isCrouching: true });
    w.tick();
    expect(cat.errand).toBeNull();
    // she walks right up: off to another bush
    w.player.isCrouching = false;
    w.tick();
    expect(cat.errand?.run).toBe(true);
    expect(cat.errand?.route).not.toContainEqual(centre(BUSHES.east));
    cat.arrive();

    // after a long quiet it dares out, but stays by its bush
    Object.assign(w.player, { x: 0, y: 0, isMoving: false });
    for (let t = 0; t < 89; t++) w.tick(1000);
    expect(cat.alpha).toBeLessThan(0.5);
    w.tick(1000);
    expect(cat.alpha).toBe(1);
    expect(cat.habits).toMatchObject({ day: { walking: 0.25, sleeping: 0 } });
  });

  it("doesn't hide when it reaches cover if it settled on the way there", () => {
    const w = world();
    const cat = w.add(24, false); // just dumped, out in the open
    Object.assign(w.player, { x: 880, y: 1000, isMoving: true });
    w.tick();
    expect(cat.errand?.run).toBe(true);
    w.scene.dayNight.dayCount = 8; // a week here: settled, mid-run
    w.tick();
    expect(w.newcomers.has(cat as unknown as NPCCat)).toBe(false);
    cat.arrive();
    w.tick();
    expect(cat.alpha).toBe(1);
    expect(cat.habits).toBeUndefined();
    expect(cat.home).toMatchObject({ r: 100 });
  });

  it("chased out of its cover (a snatcher's rush), it runs in plain sight, waits for quiet, then creeps back in and hides again", () => {
    const w = world();
    const cover = centre(BUSHES.east);
    const cat = w.add(24, true, 0, cover); // a saved hider is back in its cover
    expect(cat.alpha).toBeLessThan(0.5);
    cat.triggerFlee();
    w.tick();
    expect(cat.alpha).toBe(1);
    Object.assign(cat, { x: 1250, y: 1060, state: "alert" }); // where the flight took it
    w.tick(7000);
    expect(cat.alpha).toBe(1);
    expect(cat.errand).toBeNull(); // not straight back toward whatever ran it out
    w.tick(1000);
    expect(cat.errand).toMatchObject({ run: false, route: [cover] });
    // run off again on the way: the wait starts over
    cat.triggerFlee();
    w.tick();
    cat.state = "alert";
    w.tick(7000);
    expect(cat.errand).toBeNull();
    w.tick(1000);
    expect(cat.errand).toMatchObject({ run: false, route: [cover] });
    w.tick();
    expect(cat.alpha).toBe(1); // in plain sight on the way
    cat.arrive();
    w.tick(1000);
    expect(cat.alpha).toBeLessThan(0.5);
    expect(cat.habits).toMatchObject({ day: { walking: 0 } });
    expect(cat.home).toEqual({ ...cover, r: 8 });
    expect(w.saved()?.["24"]).toMatchObject(cover);
  });

  it("creeping back, it still watches out, and runs for cover when something frightens it", () => {
    const w = world();
    const cat = w.add(24, true, 0, centre(BUSHES.east));
    cat.triggerFlee();
    w.tick();
    Object.assign(cat, { x: 1250, y: 1060, state: "alert" });
    w.tick(8000);
    expect(cat.errand?.run).toBe(false);
    w.people.push({ x: 1300, y: 1060 });
    w.tick();
    expect(cat.errand?.run).toBe(true);
  });

  it("running for cover, it doesn't stop for a passing jogger; stopped short (Mamma Cat stops it to talk), it's in plain sight and goes on in once it's quiet", () => {
    const w = world();
    const cat = w.add(24, false);
    Object.assign(w.player, { x: 880, y: 1000, isMoving: true });
    w.tick();
    expect(cat.errand?.run).toBe(true);
    Object.assign(cat, { x: 1050 }); // halfway there, still running
    w.tick();
    expect(cat.alpha).toBe(1);
    cat.triggerAlert(); // a jogger glances at it
    expect(cat.errand?.run).toBe(true);
    Object.assign(cat, { errand: null, onErrand: false, state: "idle" }); // dialogue cuts the run short
    Object.assign(w.player, { x: 0, y: 0, isMoving: false });
    w.tick();
    expect(cat.alpha).toBe(1);
    w.tick(8000);
    expect(cat.errand).toMatchObject({ run: false, route: [centre(BUSHES.east)] });
    cat.arrive();
    w.tick();
    expect(cat.alpha).toBeLessThan(0.5);
    expect(cat.habits).toMatchObject({ day: { walking: 0 } });
  });

  it("with no way back into its cover, it gives it up once, out in the open (no path search every frame)", () => {
    const w = world();
    const cat = w.add(24, true, 0, centre(BUSHES.east));
    cat.triggerFlee();
    w.tick();
    Object.assign(cat, { x: 1250, y: 1060, state: "alert" });
    const route = vi.fn(() => null);
    w.scene.catRoute = route;
    for (let t = 0; t < 20; t++) w.tick(1000);
    expect(route).toHaveBeenCalledTimes(1);
    expect(cat.alpha).toBe(1);
    expect(cat.habits).toMatchObject({ day: { walking: 0.25 } });
    expect(cat.home).toEqual({ x: 1250, y: 1060, r: 60 });
  });

  it("when it can't get right into its cover, it gives it up rather than sit see-through in the open", () => {
    const w = world();
    const cat = w.add(24, false);
    Object.assign(w.player, { x: 880, y: 1000, isMoving: true });
    w.tick();
    const errand = cat.errand!;
    Object.assign(cat, { x: 1060, errand: null, onErrand: false }); // the way ran out 40 px short
    errand.done();
    Object.assign(w.player, { x: 0, y: 0, isMoving: false });
    w.tick();
    expect(cat.alpha).toBe(1);
    expect(cat.errand).toBeNull();
    expect(cat.habits).toMatchObject({ day: { walking: 0.25 } });
    expect(cat.home).toEqual({ x: 1060, y: 1000, r: 60 });
  });

  it("back next session, a hider is hidden only if it had got into cover", () => {
    const w = world();
    const inCover = w.add(24, true, 0, centre(BUSHES.south));
    const onTheKerb = w.add(26, true, 0, { x: 1500, y: 1500 });
    w.tick(1000);
    expect(inCover.alpha).toBeLessThan(0.5);
    expect(onTheKerb.alpha).toBe(1);
    expect(w.saved()?.["26"]).toMatchObject({ x: 1500, y: 1500 });
  });

  it("a freezer keeps still when people come near and creeps off when they come close; a crouched Mamma Cat it lets come nearer", () => {
    const w = world();
    const cat = w.add(25);
    expect(cat.speed).toBeLessThan(18); // it creeps
    w.people.push({ x: 1100, y: 1000 });
    w.tick();
    expect(cat.state).toBe("alert");
    expect(cat.errand).toBeNull(); // no running: it stays low and still
    w.people[0]!.x = 1040;
    cat.state = "idle";
    w.tick();
    expect(cat.errand).toMatchObject({ run: false, route: [{ x: 952, y: 1000 }] }); // creeping away from them
    cat.arrive();
    w.people.length = 0;
    cat.state = "idle";

    Object.assign(w.player, { x: cat.x - 50, y: cat.y, isMoving: true, isCrouching: true });
    w.tick();
    expect(cat.state).toBe("idle");
    w.player.isCrouching = false;
    w.tick();
    expect(cat.state).toBe("alert");
  });

  it("settles as she sits with it, but no faster than the days allow; settled, it's an ordinary colony cat that lives where it settled", () => {
    const w = world();
    const cat = w.add(25, false);
    w.newcomers.keep(cat as unknown as NPCCat);
    Object.assign(w.player, { x: cat.x + 60, y: cat.y, isResting: true });
    for (let t = 0; t < 120; t++) w.tick(1000);
    w.tick(1000);
    expect(w.saved()?.["25"]?.comfort).toBe(35); // a whole first day sitting with it only goes so far
    expect(w.scene.narrateIfPerceivable).toHaveBeenCalledTimes(1); // it stopped trembling
    w.scene.dayNight.dayCount = 3;
    w.tick();
    expect(w.newcomers.has(cat as unknown as NPCCat)).toBe(true);
    for (let t = 0; t < 140 && w.newcomers.has(cat as unknown as NPCCat); t++) w.tick(1000);
    expect(w.newcomers.has(cat as unknown as NPCCat)).toBe(false);
    expect(cat.speed).toBe(35);
    expect(cat.habits).toBeUndefined();
    expect(w.saved()?.["25"]).toMatchObject({ comfort: 100, x: cat.x, y: cat.y });
    expect(w.scene.narrateIfPerceivable).toHaveBeenLastCalledWith(expect.stringContaining("found its feet"), cat, 200);
  });

  it("left alone it still settles a little every day; a fright sets it back, but never below that", () => {
    const w = world();
    const cat = w.add(25);
    w.scene.dayNight.dayCount = 3;
    w.tick();
    expect(w.newcomers.greet(cat as unknown as NPCCat)).toBe(34); // two days alone (30), then a greeting
    expect(w.newcomers.greet(cat as unknown as NPCCat)).toBe(34); // once a minute
    w.people.push({ x: 1050, y: 1000 });
    w.tick();
    expect(w.newcomers.greet(cat as unknown as NPCCat)).toBe(32);
    w.scene.time.now += 60_000;
    cat.onErrand = true; // creeping off from them: it won't be greeted
    expect(w.newcomers.greet(cat as unknown as NPCCat)).toBe(32);
    expect(w.newcomers.greet({} as NPCCat)).toBeNull(); // not a newcomer
  });

  it("is saved only once Mamma Cat has seen it arrive, and forgotten when snatched", () => {
    const w = world();
    const cat = w.add(26, false);
    w.tick(1000);
    expect(w.saved()).toEqual({});
    w.newcomers.keep(cat as unknown as NPCCat);
    expect(w.saved()).toEqual({ 26: { comfort: 0, since: 1, x: 1000, y: 1000 } });
    w.newcomers.forget(cat as unknown as NPCCat);
    expect(w.saved()).toEqual({});
    expect(w.newcomers.has(cat as unknown as NPCCat)).toBe(false);
  });
});
