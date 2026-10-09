import { describe, expect, it, vi } from "vitest";
import { ZombieSystem, ZOMBIE_WEST_LIMIT_PX } from "../../src/systems/ZombieSystem";
import type { GameScene } from "../../src/scenes/GameScene";

/** Makati Ave runs north up x = 1000 (asphalt 920-1080); the city is east, the park west. */
const KERB_EAST = 1080;
const MEDIAN = 1000 + ZOMBIE_WEST_LIMIT_PX;
const HOME = { x: 1400, y: 1000 };
const OTHER_HOME = { x: 1400, y: 2600 };
type Moved = { x: number; y: number; mode: string };

/** `wall`: a strip of x (a building) the test map blocks. */
function world({ wall }: { wall?: [number, number] } = {}) {
  const sprite = (x: number, y: number) => {
    const s = { x, y, anims: { play: vi.fn(), stop: vi.fn(), isPlaying: false }, destroy: vi.fn() };
    for (const m of ["setOrigin", "setScale", "setTint", "setDepth", "setFrame", "setRotation", "setPosition"])
      Object.assign(s, { [m]: () => s });
    return s;
  };
  type Tween = Record<string, unknown> & { targets: Record<string, unknown>; onUpdate?: () => void; onComplete?: () => void };
  /** Tweens play out after the frame that starts them (here: in four linear samples, at the end of the next tick). */
  const pending: Tween[] = [];
  const tweens = { add: (cfg: Tween) => pending.push(cfg) };
  const flush = () => {
    for (const cfg of pending.splice(0)) {
      const props = Object.entries(cfg).filter(([k]) => !["targets", "duration", "ease", "onUpdate", "onComplete"].includes(k));
      const from = props.map(([k]) => Number(cfg.targets[k]));
      for (let step = 1; step <= 4; step++) {
        props.forEach(([k, to], i) => (cfg.targets[k] = from[i]! + (Number(to) - from[i]!) * (step / 4)));
        cfg.onUpdate?.();
      }
      cfg.onComplete?.();
    }
  };
  const tile = (x: number) =>
    x < 0 || x > 3000
      ? null
      : x >= 920 && x <= 1080
        ? { collides: true, properties: { road: true } }
        : wall && x >= wall[0] && x <= wall[1]
          ? { collides: true, properties: {} }
          : { collides: false, properties: {} };
  const car = { near: null as null | { x: number; y: number; angle: number; speed: number; gap: number } };
  const player = { x: 0, y: 1000, isResting: false, isRunning: false, isCrouching: false, visible: true, body: null, startle: vi.fn() };
  const scene = {
    places: [
      { name: "traffic_makati_northbound", type: "traffic", x: 1000, y: 2000, props: {}, polyline: [{ x: 1000, y: 2000 }, { x: 1000, y: 0 }] },
      { name: "zombie_1", type: "zombie_home", ...HOME, props: {} },
      { name: "zombie_2", type: "zombie_home", ...OTHER_HOME, props: {} },
    ],
    add: { sprite, text: (x: number, y: number) => sprite(x, y) },
    anims: { exists: () => true },
    tweens,
    time: { now: 0 },
    player,
    groundLayer: { getTileAtWorldXY: (x: number) => tile(x) },
    objectsLayer: null,
    traffic: { carNear: () => car.near },
    emotes: { show: vi.fn() },
    audio: { playCatGrowl: vi.fn(), playTyreScreech: vi.fn() },
    earVolume: () => 1,
    narrateIfPerceivable: vi.fn(),
  };
  const zombies = new ZombieSystem(scene as unknown as GameScene);
  const tick = (ms = 100) => {
    scene.time.now += ms;
    zombies.update(ms);
    flush();
  };
  const all = zombies.all as Moved[];
  const swarm = all.slice(0, 5);
  /** Only the first zombie of the swarm can see her; its mates stand well off, facing away. */
  const loneLookout = () => swarm.slice(1).forEach((m, k) => Object.assign(m, { x: all[0]!.x + 200, y: all[0]!.y - 60 + k * 30 }));
  return { scene, player, car, zombies, all, swarm, loneLookout, z: () => all[0]!, tick };
}

describe("ZombieSystem", () => {
  it("stands swarms of 5 and 6 round their homes; one seeing her wakes its whole swarm (and the danger music), not the others", () => {
    const w = world();
    expect(w.all).toHaveLength(11);
    for (const [members, home] of [[w.all.slice(0, 5), HOME], [w.all.slice(5), OTHER_HOME]] as const) {
      for (const m of members) {
        expect(Math.hypot(m.x - home.x, m.y - home.y)).toBeLessThanOrEqual(64);
        for (const o of members) if (o !== m) expect(Math.hypot(m.x - o.x, m.y - o.y)).toBeGreaterThanOrEqual(20);
      }
    }
    w.loneLookout();
    w.player.x = w.z().x - 100;
    w.player.y = w.z().y;
    w.tick();
    expect(w.swarm.map((m) => m.mode)).toEqual(Array(5).fill("chase"));
    expect(w.all.slice(5).every((m) => m.mode !== "chase")).toBe(true);
    expect(w.zombies.chasing).toBe(true);
  });

  it("follows her out over the northbound lanes but never past the median, then shuffles home the way it came", () => {
    const w = world();
    const start = w.swarm.map((m) => ({ x: m.x, y: m.y }));
    w.player.x = w.z().x - 100; // she wanders into view
    w.player.y = w.z().y;
    w.tick();
    expect(w.zombies.chasing).toBe(true);
    let westmost = Infinity;
    for (let i = 0; i < 600 && w.swarm.some((m) => m.mode === "chase"); i++) {
      w.player.x = Math.max(MEDIAN - 60, Math.min(...w.swarm.map((m) => m.x)) - 100); // staying just ahead, back toward the park
      w.tick();
      westmost = Math.min(westmost, ...w.swarm.map((m) => m.x));
    }
    expect(w.swarm.every((m) => m.mode === "home")).toBe(true);
    expect(w.zombies.chasing).toBe(false);
    expect(westmost).toBeLessThan(KERB_EAST); // they did step onto the road...
    expect(westmost).toBeGreaterThanOrEqual(MEDIAN); // ...but no further than the median

    w.player.x = 200; // safely back in the park
    for (let i = 0; i < 900 && w.swarm.some((m) => m.mode === "home"); i++) w.tick();
    w.swarm.forEach((m, k) => {
      expect(m.mode).not.toBe("home");
      expect(Math.hypot(m.x - start[k]!.x, m.y - start[k]!.y)).toBeLessThan(48);
    });
  });

  it("turns back when a car comes close, and a moving car that touches it knocks it flat; it gets up and goes home", () => {
    const w = world();
    w.player.x = w.z().x - 60;
    w.player.y = w.z().y;
    w.tick();
    expect(w.z().mode).toBe("chase");
    w.car.near = { x: 1040, y: 1000, angle: -Math.PI / 2, speed: 160, gap: 30 };
    w.tick();
    expect(w.z().mode).toBe("home");
    expect(w.scene.emotes.show).toHaveBeenCalledWith(w.scene, expect.anything(), "alert");

    w.car.near = { x: 1040, y: 1000, angle: -Math.PI / 2, speed: 160, gap: 0 };
    w.tick();
    expect(w.z().mode).toBe("down");
    expect(w.scene.audio.playTyreScreech).toHaveBeenCalled();
    w.car.near = null;
    w.tick(5000);
    expect(w.z().mode).toBe("down");
    w.tick(1500);
    expect(w.z().mode).toBe("home");
  });

  it("lunges once in reach: she hisses and leaps clear; a sleeping cat it ignores", () => {
    const asleep = world();
    asleep.player.x = asleep.z().x - 15;
    asleep.player.y = asleep.z().y;
    asleep.player.isResting = true;
    asleep.tick();
    expect(asleep.z().mode).not.toBe("chase");
    expect(asleep.player.startle).not.toHaveBeenCalled();

    const w = world();
    w.loneLookout();
    w.player.x = w.z().x - 15;
    w.player.y = w.z().y;
    Object.assign(w.swarm[1]!, { x: w.player.x, y: w.player.y + 15 }); // a mate in reach too: both lunge at once
    const from = w.player.x;
    w.tick();
    expect(w.scene.emotes.show).toHaveBeenCalledWith(w.scene, w.player, "danger");
    expect(w.scene.audio.playCatGrowl).toHaveBeenCalled();
    expect(w.player.startle).toHaveBeenCalled();
    expect(w.player.x).toBeCloseTo(from - 72); // leapt away from the first, west; one leap, not one per mate
    expect(w.player.y).toBeCloseTo(w.z().y);
  });

  it("is never knocked over the median (where it would be stranded), and walks off the road and home after", () => {
    const w = world();
    const z = w.z() as Moved & { trail: Array<{ x: number; y: number }> };
    const start = { x: z.x, y: z.y };
    // turned back right at the median, crumbs leading back over the lanes to where it set off
    Object.assign(z, { x: MEDIAN + 1, mode: "home", trail: [{ ...start }, { x: KERB_EAST + 40, y: start.y }, { x: 1000, y: start.y }] });
    w.car.near = { x: MEDIAN + 20, y: z.y, angle: -Math.PI / 2, speed: 160, gap: 0 }; // a northbound car in the median lane, east of it
    w.tick();
    expect(z.mode).toBe("down");
    expect(z.x).toBeGreaterThanOrEqual(MEDIAN);
    w.car.near = null;
    for (let i = 0; i < 900 && z.mode !== "idle"; i++) w.tick();
    expect(z.mode).toBe("idle");
    expect(Math.hypot(z.x - start.x, z.y - start.y)).toBeLessThan(12);
  });

  it("is thrown no further than a wall in its way, even with clear ground beyond it", () => {
    const w = world({ wall: [1115, 1125] });
    const z = w.z() as Moved & { trail: Array<{ x: number; y: number }> };
    Object.assign(z, { x: 1100, y: 1000, mode: "home", trail: [{ x: 1100, y: 1000 }] });
    w.car.near = { x: 1080, y: 1005, angle: 0, speed: 160, gap: 0 }; // flings it 40 px east, 12 px up: over the wall
    w.tick();
    expect(z.mode).toBe("down");
    expect(z.x).toBeLessThan(1115);
    expect(z.x).toBeGreaterThan(1100); // it did fly, up to the wall
  });
});
