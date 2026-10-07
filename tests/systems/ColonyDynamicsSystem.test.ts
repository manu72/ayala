import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/sprites/NPCCat", () => ({ NPCCat: class {} }));
vi.mock("../../src/systems/ThreatIndicator", () => ({ ThreatIndicator: class {} }));

import { ColonyDynamicsSystem } from "../../src/systems/ColonyDynamicsSystem";
import type { GameScene } from "../../src/scenes/GameScene";

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
