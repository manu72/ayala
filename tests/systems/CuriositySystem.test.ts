import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: { Math: { Distance: { Between: (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by) } } },
}));

import { CuriositySystem, CURIOSITY_KEY } from "../../src/systems/CuriositySystem";
import type { GameScene } from "../../src/scenes/GameScene";

function makeScene(day = 1) {
  // she has already had a first conversation with each of them
  const reg = new Map<string, unknown>([["MET_BLACKY", true], ["TIGER_TALKS", 1], ["JAYCO_TALKS", 1]]);
  const shown: string[][] = [];
  const scene = {
    registry: { get: (k: string) => reg.get(k), set: (k: string, v: unknown) => reg.set(k, v) },
    dayNight: { dayCount: day },
    places: [{ name: "vacant_shop_window", type: "shop_window", x: 100, y: 100, props: {} }],
    player: { x: 100, y: 110, faceToward: vi.fn(), body: { velocity: { length: () => 0 } } },
    dialogue: { isActive: false, show: (lines: string[]) => shown.push(lines) },
    scoring: { recordFind: vi.fn() },
    audio: { playKitten: vi.fn() },
    emotes: { show: vi.fn() },
    ambientGuards: [],
  };
  return { scene: scene as unknown as GameScene & typeof scene, reg, shown };
}

describe("CuriositySystem", () => {
  it("D1: Blacky warns from day 2, Jayco's zombie gossip only after, and the follow-ups once she has seen them", () => {
    const { scene } = makeScene(1);
    const c = new CuriositySystem(scene);
    expect(c.takeRumour("Blacky")).toBeNull(); // day 1: not yet
    expect(c.takeRumour("Jayco")).toBeNull();
    scene.dayNight.dayCount = 2;
    expect(c.takeRumour("Blacky")?.[0]).toMatch(/Makati/);
    expect(c.takeRumour("Blacky")).toBeNull(); // heard once
    expect(c.takeRumour("Jayco")?.[0]).toMatch(/ZOMBIES/);
    c.markZombiesSeen();
    expect(c.zombiesSeen).toBe(true);
    expect(c.takeRumour("Blacky")?.join(" ")).toMatch(/don't always stop for us/);
    expect(c.takeRumour("Jayco")?.[0]).toMatch(/You WENT/);
  });

  it("D4: the shop's glass shows a little more each day, and the rescue pays off once", () => {
    const { scene, shown } = makeScene(3);
    const c = new CuriositySystem(scene);
    expect(c.takeRumour("Tiger")?.[0]).toMatch(/empty shop/);
    expect(c.wonders()).toEqual([{ open: true, text: expect.stringMatching(/empty shop/) }]);
    for (const day of [3, 4, 5, 6, 9]) {
      scene.dayNight.dayCount = day;
      expect(c.tryWindow()).toBe(true);
    }
    expect(shown.map((l) => l.join(" "))).toEqual([
      expect.stringMatching(/breathing/),
      expect.stringMatching(/Kittens!/),
      expect.stringMatching(/tumble/),
      expect.stringMatching(/safe with us/),
      expect.stringMatching(/safe with us/),
    ]);
    expect(scene.audio.playKitten).toHaveBeenCalledTimes(1);
    expect(scene.scoring.recordFind).toHaveBeenCalledTimes(1);
    expect(c.wonders()[0]?.open).toBe(false);
    expect(c.takeRumour("Tiger")?.[0]).toMatch(/Kittens\? In a SHOP/);
  });

  it("never replaces a first meeting", () => {
    const { scene, reg } = makeScene(3);
    reg.delete("MET_BLACKY");
    expect(new CuriositySystem(scene).takeRumour("Blacky")).toBeNull();
  });

  it("does nothing away from the glass, and survives a reload through the registry", () => {
    const { scene, reg } = makeScene(2);
    const c = new CuriositySystem(scene);
    scene.player.x = 400;
    expect(c.tryWindow()).toBe(false);
    c.takeRumour("Blacky");
    const again = new CuriositySystem(scene);
    expect(again.takeRumour("Blacky")).toBeNull();
    expect((reg.get(CURIOSITY_KEY) as { heard: Record<string, number> }).heard.d1_warn).toBe(2);
  });
});
