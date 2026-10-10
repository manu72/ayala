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

import { SaveSystem } from "../../src/systems/SaveSystem";
import { SnatcherSystem } from "../../src/systems/SnatcherSystem";

function makeCaptureScene() {
  const state = { beat5Pickup: false };
  const dialogue = { dismiss: vi.fn(), show: vi.fn() };
  const scene = {
    npcs: [],
    player: { x: 100, y: 100, isCrouching: false, isRunning: false, isResting: false },
    registry: { get: vi.fn(), set: vi.fn() },
    scoring: { recordSnatch: vi.fn() },
    cameras: { main: { fade: vi.fn(), resetFX: vi.fn() } },
    loseLife: vi.fn(() => false),
    autoSave: vi.fn(),
    isNearShelter: vi.fn(() => false),
    isUnderCanopy: vi.fn(() => false),
    triggerGameOver: vi.fn(),
    scene: { restart: vi.fn() },
    dialogue,
    camille: {
      get isBeat5PickupDialogueActive() {
        return state.beat5Pickup;
      },
    },
  };
  const system = new SnatcherSystem(scene as never);
  (system as unknown as { snatchersList: unknown[] }).snatchersList.push({
    visible: true,
    x: 104,
    y: 100,
    setVelocity: vi.fn(),
  });
  return { scene, dialogue, state, system };
}

describe("SnatcherSystem capture", () => {
  it("captures once per catch, not once per frame while the snatcher stays in range", () => {
    const { scene, system } = makeCaptureScene();
    let finishFade: ((cam: unknown, progress: number) => void) | undefined;
    scene.cameras.main.fade.mockImplementation(
      (
        _ms: number,
        _r: number,
        _g: number,
        _b: number,
        _force: boolean,
        cb: (cam: unknown, progress: number) => void,
      ) => {
        finishFade = cb;
      },
    );

    system.checkDetection();
    system.checkDetection();
    system.checkDetection();

    expect(scene.loseLife).not.toHaveBeenCalled();
    expect(scene.cameras.main.fade).toHaveBeenCalledOnce();

    finishFade?.({}, 1);
    system.checkDetection();

    expect(scene.loseLife).toHaveBeenCalledOnce();
    expect(scene.cameras.main.fade).toHaveBeenCalledOnce();
  });

  it("does not capture the player during Camille's Beat-5 pickup dialogue", () => {
    const { scene, dialogue, state, system } = makeCaptureScene();
    state.beat5Pickup = true;

    system.checkDetection();

    expect(scene.loseLife).not.toHaveBeenCalled();
    expect(scene.cameras.main.fade).not.toHaveBeenCalled();
    expect(dialogue.dismiss).not.toHaveBeenCalled();
  });

  it("still dismisses other dialogue when a capture fade finishes", () => {
    const { scene, dialogue, system } = makeCaptureScene();
    scene.cameras.main.fade.mockImplementation(
      (
        _ms: number,
        _r: number,
        _g: number,
        _b: number,
        _force: boolean,
        cb: (cam: unknown, progress: number) => void,
      ) => {
        cb({}, 1);
      },
    );

    system.checkDetection();

    expect(scene.loseLife).toHaveBeenCalledOnce();
    expect(dialogue.dismiss).toHaveBeenCalledOnce();
    expect(dialogue.show).toHaveBeenCalledOnce();
  });

  it("does not dismiss Beat-5 pickup dialogue if it opens during the capture fade", () => {
    const { scene, dialogue, state, system } = makeCaptureScene();
    scene.loseLife.mockReturnValue(true);
    vi.mocked(SaveSystem.clear).mockClear();
    scene.cameras.main.fade.mockImplementation(
      (
        _ms: number,
        _r: number,
        _g: number,
        _b: number,
        _force: boolean,
        cb: (cam: unknown, progress: number) => void,
      ) => {
        state.beat5Pickup = true;
        cb({}, 1);
      },
    );

    system.checkDetection();

    expect(scene.loseLife).not.toHaveBeenCalled();
    expect(scene.autoSave).not.toHaveBeenCalled();
    expect(scene.scoring.recordSnatch).not.toHaveBeenCalled();
    expect(SaveSystem.clear).not.toHaveBeenCalled();
    expect(scene.registry.set).not.toHaveBeenCalled();
    expect(scene.triggerGameOver).not.toHaveBeenCalled();
    expect(scene.cameras.main.resetFX).toHaveBeenCalledOnce();
    expect(dialogue.dismiss).not.toHaveBeenCalled();
    expect(dialogue.show).not.toHaveBeenCalled();
  });

  it("does not recapture while the player remains in range when no save can be loaded", () => {
    const { scene, dialogue, system } = makeCaptureScene();
    vi.mocked(SaveSystem.load).mockReturnValueOnce(null);
    scene.cameras.main.fade.mockImplementation(
      (
        _ms: number,
        _r: number,
        _g: number,
        _b: number,
        _force: boolean,
        cb: (cam: unknown, progress: number) => void,
      ) => {
        cb({}, 1);
      },
    );
    dialogue.show.mockImplementation((_lines: string[], onComplete: () => void) => {
      onComplete();
    });

    system.checkDetection();
    expect(scene.loseLife).toHaveBeenCalledOnce();
    expect(scene.scene.restart).not.toHaveBeenCalled();

    scene.player.x = 124;
    system.checkDetection();
    system.checkDetection();
    expect(scene.loseLife).toHaveBeenCalledOnce();
    expect(scene.cameras.main.fade).toHaveBeenCalledOnce();

    scene.player.x = 400;
    system.checkDetection();
    expect(scene.loseLife).toHaveBeenCalledOnce();

    scene.player.x = 100;
    system.checkDetection();
    expect(scene.loseLife).toHaveBeenCalledTimes(2);
  });
});
