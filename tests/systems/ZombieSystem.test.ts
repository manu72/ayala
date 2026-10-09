import { describe, expect, it, vi } from "vitest";
import { ZombieSystem, ZOMBIE_WEST_LIMIT_PX } from "../../src/systems/ZombieSystem";
import type { GameScene } from "../../src/scenes/GameScene";

/** Makati Ave runs north up x = 1000 (asphalt 920-1080); the city is east, the park west. */
const KERB_EAST = 1080;
const MEDIAN = 1000 + ZOMBIE_WEST_LIMIT_PX;
const HOME = { x: 1400, y: 1000 };

function world() {
  const sprite = (x: number, y: number) => {
    const s = { x, y, anims: { play: vi.fn(), stop: vi.fn(), isPlaying: false }, destroy: vi.fn() };
    for (const m of ["setOrigin", "setScale", "setTint", "setDepth", "setFrame", "setRotation", "setPosition"])
      Object.assign(s, { [m]: () => s });
    return s;
  };
  const tweens = {
    add: (cfg: Record<string, unknown> & { targets: Record<string, unknown>; onUpdate?: () => void; onComplete?: () => void }) => {
      for (const [k, v] of Object.entries(cfg))
        if (!["targets", "duration", "ease", "onUpdate", "onComplete"].includes(k)) cfg.targets[k] = v;
      cfg.onUpdate?.();
      cfg.onComplete?.();
    },
  };
  const tile = (x: number) => (x < 0 || x > 3000 ? null : x >= 920 && x <= 1080 ? { collides: true, properties: { road: true } } : { collides: false, properties: {} });
  const car = { near: null as null | { x: number; y: number; angle: number; speed: number; gap: number } };
  const player = { x: 0, y: 1000, isResting: false, isRunning: false, isCrouching: false, visible: true, body: null, startle: vi.fn() };
  const scene = {
    places: [
      { name: "traffic_makati_northbound", type: "traffic", x: 1000, y: 2000, props: {}, polyline: [{ x: 1000, y: 2000 }, { x: 1000, y: 0 }] },
      { name: "zombie_1", type: "zombie_home", ...HOME, props: {} },
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
  };
  return { scene, player, car, z: () => zombies.all[0]!, tick };
}

describe("ZombieSystem", () => {
  it("follows her out over the northbound lanes but never past the median, then shuffles home the way it came", () => {
    const w = world();
    w.player.x = HOME.x - 100; // she wanders into view
    let westmost = Infinity;
    for (let i = 0; i < 400 && w.z().mode !== "home"; i++) {
      w.player.x = Math.max(MEDIAN - 60, w.z().x - 100); // staying just ahead, back toward the park
      w.tick();
      westmost = Math.min(westmost, w.z().x);
    }
    expect(w.z().mode).toBe("home");
    expect(westmost).toBeLessThan(KERB_EAST); // it did step onto the road...
    expect(westmost).toBeGreaterThanOrEqual(MEDIAN); // ...but no further than the median

    w.player.x = 200; // safely back in the park
    for (let i = 0; i < 600 && w.z().mode === "home"; i++) w.tick();
    expect(w.z().mode).not.toBe("home");
    expect(Math.hypot(w.z().x - HOME.x, w.z().y - HOME.y)).toBeLessThan(120);
  });

  it("turns back when a car comes close, and a moving car that touches it knocks it flat; it gets up and goes home", () => {
    const w = world();
    w.player.x = HOME.x - 60;
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
    asleep.player.x = HOME.x - 15;
    asleep.player.isResting = true;
    asleep.tick();
    expect(asleep.z().mode).not.toBe("chase");
    expect(asleep.player.startle).not.toHaveBeenCalled();

    const w = world();
    w.player.x = HOME.x - 15;
    w.tick();
    expect(w.scene.emotes.show).toHaveBeenCalledWith(w.scene, w.player, "danger");
    expect(w.scene.audio.playCatGrowl).toHaveBeenCalled();
    expect(w.player.startle).toHaveBeenCalled();
    expect(w.player.x).toBeCloseTo(HOME.x - 15 - 72); // leapt away from it, west
  });
});
