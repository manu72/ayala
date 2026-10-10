import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Math: {
      Angle: { Between: (x1: number, y1: number, x2: number, y2: number) => Math.atan2(y2 - y1, x2 - x1) },
      Distance: { Between: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1) },
    },
  },
}));
vi.mock("../../src/sprites/HumanNPC", () => ({ HumanNPC: class {} }));
vi.mock("../../src/sprites/NPCCat", () => ({ NPCCat: class {} }));
vi.mock("../../src/systems/SaveSystem", () => ({ SaveSystem: { clear: vi.fn(), load: vi.fn(() => ({})) } }));

import { SnatcherSystem } from "../../src/systems/SnatcherSystem";

describe("SnatcherSystem capture", () => {
  it("captures once per catch, not once per frame while the snatcher stays in range", () => {
    const scene = {
      npcs: [],
      player: { x: 100, y: 100, isCrouching: false, isRunning: false, isResting: false },
      registry: { get: vi.fn(), set: vi.fn() },
      scoring: { recordSnatch: vi.fn() },
      cameras: { main: { fade: vi.fn() } },
      loseLife: vi.fn(() => false),
      autoSave: vi.fn(),
      isNearShelter: vi.fn(() => false),
      isUnderCanopy: vi.fn(() => false),
    };
    const system = new SnatcherSystem(scene as never);
    (system as unknown as { snatchersList: unknown[] }).snatchersList.push({ visible: true, x: 104, y: 100, setVelocity: vi.fn() });

    system.checkDetection();
    system.checkDetection();
    system.checkDetection();

    expect(scene.loseLife).toHaveBeenCalledOnce();
    expect(scene.cameras.main.fade).toHaveBeenCalledOnce();
  });
});
