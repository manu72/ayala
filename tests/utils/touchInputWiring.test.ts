import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (...args: unknown[]) => void;
type AnyScene = Record<string, any>;

function createEventHub() {
  const handlers = new Map<string, Handler[]>();

  return {
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return undefined;
    }),
    once: vi.fn((event: string, handler: Handler) => {
      const onceHandler: Handler = (...args) => {
        handler(...args);
        const remaining = (handlers.get(event) ?? []).filter((h) => h !== onceHandler);
        handlers.set(event, remaining);
      };
      handlers.set(event, [...(handlers.get(event) ?? []), onceHandler]);
      return undefined;
    }),
    off: vi.fn((event: string, handler: Handler) => {
      const remaining = (handlers.get(event) ?? []).filter((h) => h !== handler);
      handlers.set(event, remaining);
      return undefined;
    }),
    emit(event: string, ...args: unknown[]) {
      for (const handler of [...(handlers.get(event) ?? [])]) {
        handler(...args);
      }
    },
  };
}

function createGameObject() {
  const hub = createEventHub();
  const obj = {
    visible: true,
    x: 0,
    y: 0,
    text: "",
    setAlpha: vi.fn(() => obj),
    setColor: vi.fn(() => obj),
    setData: vi.fn(() => obj),
    setDepth: vi.fn(() => obj),
    setInteractive: vi.fn(() => obj),
    setOrigin: vi.fn(() => obj),
    setPosition: vi.fn((x: number, y: number) => {
      obj.x = x;
      obj.y = y;
      return obj;
    }),
    setScrollFactor: vi.fn(() => obj),
    setStrokeStyle: vi.fn(() => obj),
    setText: vi.fn((text: string) => {
      obj.text = text;
      return obj;
    }),
    setVisible: vi.fn((visible: boolean) => {
      obj.visible = visible;
      return obj;
    }),
    setY: vi.fn((y: number) => {
      obj.y = y;
      return obj;
    }),
    add: vi.fn(() => obj),
    clear: vi.fn(() => obj),
    destroy: vi.fn(() => obj),
    fillCircle: vi.fn(() => obj),
    fillRect: vi.fn(() => obj),
    fillRoundedRect: vi.fn(() => obj),
    fillStyle: vi.fn(() => obj),
    generateTexture: vi.fn(() => obj),
    on: hub.on,
    once: hub.once,
    off: hub.off,
    emit: hub.emit,
  };
  return obj;
}

function createMockSceneSurface() {
  const rectangles: ReturnType<typeof createGameObject>[] = [];
  const texts: ReturnType<typeof createGameObject>[] = [];
  const circles: ReturnType<typeof createGameObject>[] = [];
  const containers: ReturnType<typeof createGameObject>[] = [];

  const surface = {
    rectangles,
    texts,
    circles,
    containers,
    add: {
      rectangle: vi.fn(() => {
        const obj = createGameObject();
        rectangles.push(obj);
        return obj;
      }),
      text: vi.fn((_x: number, _y: number, text = "") => {
        const obj = createGameObject();
        obj.text = String(text);
        texts.push(obj);
        return obj;
      }),
      circle: vi.fn(() => {
        const obj = createGameObject();
        circles.push(obj);
        return obj;
      }),
      container: vi.fn(() => {
        const obj = createGameObject();
        containers.push(obj);
        return obj;
      }),
      graphics: vi.fn(() => createGameObject()),
      image: vi.fn(() => createGameObject()),
    },
  };

  return surface;
}

const sceneSurfaces: ReturnType<typeof createMockSceneSurface>[] = [];

vi.mock("phaser", () => {
  class MockScene {
    add: ReturnType<typeof createMockSceneSurface>["add"];
    cameras = { main: { width: 816, height: 624, fade: vi.fn(), zoomTo: vi.fn() } };
    events = createEventHub();
    game = { events: createEventHub(), device: { input: { touch: true } } };
    input = { ...createEventHub(), keyboard: { addKey: vi.fn(), createCursorKeys: vi.fn() } };
    make = { graphics: vi.fn(() => createGameObject()) };
    physics = { pause: vi.fn(), resume: vi.fn(), add: { existing: vi.fn(), collider: vi.fn(), overlap: vi.fn() } };
    registry = { get: vi.fn(), set: vi.fn(), remove: vi.fn() };
    scene = { get: vi.fn(), isActive: vi.fn(() => false), launch: vi.fn(), start: vi.fn(), stop: vi.fn() };
    sound = { add: vi.fn(), remove: vi.fn() };
    sys = { game: { device: { input: { touch: true } } } };
    textures = { exists: vi.fn(() => false) };
    time = { delayedCall: vi.fn(() => ({ remove: vi.fn() })) };
    tweens = { add: vi.fn(() => ({ remove: vi.fn(), stop: vi.fn() })), killTweensOf: vi.fn() };

    constructor(_config?: unknown) {
      const surface = createMockSceneSurface();
      sceneSurfaces.push(surface);
      this.add = surface.add;
    }
  }

  class MockSprite {
    active = true;
    anims = { play: vi.fn(), stop: vi.fn() };
    body = { setEnable: vi.fn(), velocity: { length: vi.fn(() => 0) } };
    x = 0;
    y = 0;
    constructor(_scene?: unknown, x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
    setVelocity = vi.fn();
    setPosition = vi.fn((x: number, y: number) => {
      this.x = x;
      this.y = y;
      return this;
    });
    setVisible = vi.fn(() => this);
    setAlpha = vi.fn(() => this);
    once = vi.fn();
    off = vi.fn();
  }

  class MockVector2 {
    x: number;
    y: number;
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
    set(x: number, y: number) {
      this.x = x;
      this.y = y;
      return this;
    }
    normalize() {
      return this;
    }
    scale() {
      return this;
    }
  }

  class MockEventEmitter {}

  return {
    default: {
      Animations: { Events: { ANIMATION_COMPLETE_KEY: "animationcomplete-" } },
      Events: { EventEmitter: MockEventEmitter },
      GameObjects: { Sprite: MockSprite },
      Input: {
        Keyboard: {
          JustDown: (key?: { justDown?: boolean }) => key?.justDown === true,
          JustUp: (key?: { justUp?: boolean }) => key?.justUp === true,
          KeyCodes: { A: 65, C: 67, D: 68, ESC: 27, J: 74, SHIFT: 16, SPACE: 32, S: 83, TAB: 9, W: 87, Z: 90 },
        },
      },
      Math: {
        Angle: { Between: vi.fn(() => 0) },
        Between: vi.fn((min: number) => min),
        Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
        Distance: { Between: vi.fn((x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1)) },
        Vector2: MockVector2,
      },
      Physics: { Arcade: { Sprite: MockSprite } },
      Scene: MockScene,
      Scenes: { Events: { SHUTDOWN: "shutdown" } },
      Utils: { Array: { Shuffle: <T>(items: T[]) => items } },
    },
  };
});

import Phaser from "phaser";
import { EMPTY_MOVEMENT_INTENT } from "../../src/input/playerIntent";
import { GameScene } from "../../src/scenes/GameScene";
import { HUDScene } from "../../src/scenes/HUDScene";
import { JournalScene } from "../../src/scenes/JournalScene";

function latestSurface() {
  const surface = sceneSurfaces[sceneSurfaces.length - 1];
  if (!surface) throw new Error("No mock scene surface was created");
  return surface;
}

function makeJournalGameScene() {
  return {
    autoSave: vi.fn(),
    dayNight: { dayCount: 1 },
    getNPCDisposition: vi.fn(() => "neutral"),
    registry: { get: vi.fn((key: string) => (key === "KNOWN_CATS" ? [] : undefined)), set: vi.fn() },
    resumeGame: vi.fn(),
    scoring: { total: 0, getBreakdown: vi.fn(() => ({})) },
    territory: { isClaimed: false },
    trust: { getCatTrust: vi.fn(() => 0) },
  };
}

function makeFrozenUpdateScene() {
  const scene = new GameScene() as unknown as AnyScene;
  scene.scene.get.mockImplementation((key: unknown) =>
    key === "HUDScene" ? { dialogue: { dismiss: vi.fn(), isActive: false, show: vi.fn() } } : undefined,
  );

  Object.assign(scene, {
    cinematicActive: false,
    dayNight: { currentPhase: "day", isHeatActive: false, update: vi.fn() },
    engagedDialogueNPC: null,
    escapeKey: { justDown: false },
    foodSources: { update: vi.fn() },
    guard: { update: vi.fn() },
    guardIndicator: { update: vi.fn() },
    isNearShelter: vi.fn(() => false),
    isPeeking: false,
    isUnderCanopy: vi.fn(() => false),
    journalKey: { isDown: true },
    journalToggleLocked: false,
    player: {
      body: { velocity: { length: vi.fn(() => 0) } },
      isCatloaf: false,
      isConsuming: false,
      isGreeting: false,
      isMoving: false,
      isResting: false,
      playerState: "normal",
      setVelocity: vi.fn(),
      update: vi.fn(),
      x: 0,
      y: 0,
    },
    playerInputFrozen: true,
    restKey: { isDown: false, justUp: false },
    spaceKey: { justDown: false },
    stats: { canRun: true, collapsed: false, speedMultiplier: 1, update: vi.fn() },
    tabKey: { justDown: false },
    updateHumans: vi.fn(),
    updateNPCs: vi.fn(),
    updatePlayerStationaryAnchor: vi.fn(),
  });

  return scene;
}

describe("touch input scene wiring", () => {
  beforeEach(() => {
    sceneSurfaces.length = 0;
  });

  it("routes JournalScene drag and wheel scrolling through setScrollY", () => {
    const scene = new JournalScene() as unknown as AnyScene;
    const gameScene = makeJournalGameScene();
    scene.scene.get.mockImplementation((key: unknown) => (key === "GameScene" ? gameScene : undefined));

    scene.create();
    const setScrollY = vi.spyOn(scene as never, "setScrollY");
    const surface = latestSurface();
    const background = surface.rectangles[0]!;

    background.emit("pointerdown", { id: 1, y: 100 });
    scene.input.emit("pointermove", { id: 1, y: 40 });
    expect(setScrollY).toHaveBeenCalledWith(60);

    scene.input.emit("wheel", {}, [], 0, 20);
    expect(setScrollY).toHaveBeenLastCalledWith(10);
  });

  it("removes JournalScene drag and wheel listeners on shutdown", () => {
    const scene = new JournalScene() as unknown as AnyScene;
    scene.scene.get.mockImplementation((key: unknown) =>
      key === "GameScene" ? makeJournalGameScene() : undefined,
    );

    scene.create();
    const surface = latestSurface();
    const background = surface.rectangles[0]!;

    scene.events.emit(Phaser.Scenes.Events.SHUTDOWN);

    expect(background.off).toHaveBeenCalledWith("pointerdown", scene["onJournalPointerDown"]);
    expect(scene.input.off).toHaveBeenCalledWith("pointermove", scene["onJournalPointerMove"]);
    expect(scene.input.off).toHaveBeenCalledWith("pointerup", scene["onJournalPointerUp"]);
    expect(scene.input.off).toHaveBeenCalledWith("wheel", scene["onJournalWheel"]);
  });

  it("clears all touch queues when HUD touch controls become hidden", () => {
    const scene = new HUDScene() as unknown as AnyScene;
    const container = createGameObject();
    const gameScene = { cinematicActive: false, clearTouchInputState: vi.fn(), isPaused: true };

    Object.assign(scene, {
      dialogue: { isActive: false },
      touchControlsContainer: container,
      touchMovementIntent: { ...EMPTY_MOVEMENT_INTENT, left: true, run: true },
      touchRunActive: true,
      touchStickPointerId: 7,
    });

    scene["updateTouchControlsVisibility"](gameScene);

    expect(scene["touchStickPointerId"]).toBeNull();
    expect(scene["touchRunActive"]).toBe(false);
    expect(scene["touchMovementIntent"]).toEqual(EMPTY_MOVEMENT_INTENT);
    expect(gameScene.clearTouchInputState).toHaveBeenCalledWith(true);
    expect(container.setVisible).toHaveBeenCalledWith(false);
  });

  it("clears active touch controls on game blur", () => {
    const scene = new HUDScene() as unknown as AnyScene;
    const gameScene = {
      beginTouchCrouch: vi.fn(),
      clearTouchInputState: vi.fn(),
      endTouchCrouch: vi.fn(),
      queueTouchInteract: vi.fn(),
      queueTouchJournal: vi.fn(),
      queueTouchPause: vi.fn(),
      queueTouchPeek: vi.fn(),
      setTouchRun: vi.fn(),
    };
    scene.scene.get.mockImplementation((key: unknown) => (key === "GameScene" ? gameScene : undefined));

    scene["buildTouchControls"](816, 624);
    Object.assign(scene, {
      touchMovementIntent: { ...EMPTY_MOVEMENT_INTENT, up: true, run: true },
      touchRunActive: true,
      touchStickPointerId: 3,
    });

    scene.game.events.emit("blur");

    expect(scene["touchStickPointerId"]).toBeNull();
    expect(scene["touchRunActive"]).toBe(false);
    expect(scene["touchMovementIntent"]).toEqual(EMPTY_MOVEMENT_INTENT);
    expect(gameScene.clearTouchInputState).toHaveBeenCalledOnce();
  });

  it("clears HUD-local touch state on scene shutdown", () => {
    const scene = new HUDScene() as unknown as AnyScene;
    const gameScene = {
      beginTouchCrouch: vi.fn(),
      clearTouchInputState: vi.fn(),
      endTouchCrouch: vi.fn(),
      queueTouchInteract: vi.fn(),
      queueTouchJournal: vi.fn(),
      queueTouchPause: vi.fn(),
      queueTouchPeek: vi.fn(),
      setTouchRun: vi.fn(),
    };
    scene.scene.get.mockImplementation((key: unknown) => (key === "GameScene" ? gameScene : undefined));

    scene["buildTouchControls"](816, 624);
    Object.assign(scene, {
      touchMovementIntent: { ...EMPTY_MOVEMENT_INTENT, down: true, run: true },
      touchRunActive: true,
      touchStickPointerId: 9,
    });

    scene.events.emit(Phaser.Scenes.Events.SHUTDOWN);

    expect(scene["touchStickPointerId"]).toBeNull();
    expect(scene["touchRunActive"]).toBe(false);
    expect(scene["touchMovementIntent"]).toEqual(EMPTY_MOVEMENT_INTENT);
    expect(gameScene.clearTouchInputState).toHaveBeenCalledOnce();
  });

  it("routes the HUD Run button through GameScene.setTouchRun", () => {
    const scene = new HUDScene() as unknown as AnyScene;
    const gameScene = {
      beginTouchCrouch: vi.fn(),
      clearTouchInputState: vi.fn(),
      endTouchCrouch: vi.fn(),
      queueTouchInteract: vi.fn(),
      queueTouchJournal: vi.fn(),
      queueTouchPause: vi.fn(),
      queueTouchPeek: vi.fn(),
      setTouchRun: vi.fn(),
    };
    scene.scene.get.mockImplementation((key: unknown) => (key === "GameScene" ? gameScene : undefined));

    scene["buildTouchControls"](816, 624);
    const surface = latestSurface();
    const runButtonBackground = surface.rectangles[1]!;
    const event = { stopPropagation: vi.fn() };

    runButtonBackground.emit("pointerdown", {}, 0, 0, event);
    runButtonBackground.emit("pointerup", {}, 0, 0, event);

    expect(gameScene.setTouchRun).toHaveBeenNthCalledWith(1, true);
    expect(gameScene.setTouchRun).toHaveBeenNthCalledWith(2, false);
  });

  it("ignores pause and peek inputs while preserving a frozen update frame", () => {
    const scene = makeFrozenUpdateScene();
    scene["escapeKey"] = { justDown: true };
    scene["touchPeekQueued"] = true;
    scene["handlePauseInput"] = vi.fn();
    scene["togglePeekInput"] = vi.fn();

    scene.update(0, 16);

    expect(scene["handlePauseInput"]).not.toHaveBeenCalled();
    expect(scene["togglePeekInput"]).not.toHaveBeenCalled();
    expect(scene["touchPeekQueued"]).toBe(false);
    expect(scene["dayNight"].update).toHaveBeenCalledWith(16);
    expect(scene["foodSources"].update).toHaveBeenCalledWith("day", 0);
    expect(scene["player"].setVelocity).toHaveBeenCalledWith(0);
  });

  it("consumes frozen journal input without opening later when J is still held", () => {
    const scene = makeFrozenUpdateScene();
    scene["touchJournalQueued"] = true;
    scene["handleJournalToggleInput"] = vi.fn();

    scene.update(0, 16);

    expect(scene["touchJournalQueued"]).toBe(false);
    expect(scene["journalToggleLocked"]).toBe(true);
    expect(scene["handleJournalToggleInput"]).not.toHaveBeenCalled();

    scene["playerInputFrozen"] = false;
    scene.update(16, 16);

    expect(scene["handleJournalToggleInput"]).not.toHaveBeenCalled();
  });

  it("clears GameScene touch queues and preserves touch run across stick updates", () => {
    const scene = new GameScene() as unknown as AnyScene;
    const setExternalMovementIntent = vi.fn();
    scene["player"] = { cancelExternalCrouchPress: vi.fn(), clearExternalMovementIntent: vi.fn(), setExternalMovementIntent };

    scene.queueTouchInteract();
    scene.queueTouchPeek();
    scene.queueTouchJournal();
    scene.queueTouchPause();
    scene.clearTouchInputState(true);

    expect(scene["touchInteractQueued"]).toBe(false);
    expect(scene["touchPeekQueued"]).toBe(false);
    expect(scene["touchJournalQueued"]).toBe(false);
    expect(scene["touchPauseQueued"]).toBe(false);

    scene.setTouchRun(true);
    scene.setTouchMovementIntent({ ...EMPTY_MOVEMENT_INTENT, right: true });

    expect(setExternalMovementIntent).toHaveBeenLastCalledWith({
      ...EMPTY_MOVEMENT_INTENT,
      right: true,
      run: true,
    });
  });
});
