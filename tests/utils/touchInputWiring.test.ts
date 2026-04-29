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
    height: 0,
    style: {} as Record<string, unknown>,
    visible: true,
    width: 0,
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
      rectangle: vi.fn((_x = 0, _y = 0, width = 0, height = 0) => {
        const obj = createGameObject();
        obj.width = Number(width);
        obj.height = Number(height);
        rectangles.push(obj);
        return obj;
      }),
      text: vi.fn((x: number, y: number, text = "", style: Record<string, unknown> = {}) => {
        const obj = createGameObject();
        obj.x = Number(x);
        obj.y = Number(y);
        obj.text = String(text);
        obj.style = style;
        texts.push(obj);
        return obj;
      }),
      circle: vi.fn(() => {
        const obj = createGameObject();
        circles.push(obj);
        return obj;
      }),
      container: vi.fn((x = 0, y = 0) => {
        const obj = createGameObject();
        obj.x = Number(x);
        obj.y = Number(y);
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
    const knob = createGameObject();
    const gameScene = { cinematicActive: false, clearTouchInputState: vi.fn(), isPaused: true };

    Object.assign(scene, {
      dialogue: { isActive: false },
      touchControlsContainer: container,
      touchMovementIntent: { ...EMPTY_MOVEMENT_INTENT, left: true, run: true },
      touchStickKnob: knob,
      touchStickOriginX: 72,
      touchStickOriginY: 552,
      touchRunActive: true,
      touchStickPointerId: 7,
    });

    scene["updateTouchControlsVisibility"](gameScene);

    expect(scene["touchStickPointerId"]).toBeNull();
    expect(scene["touchRunActive"]).toBe(false);
    expect(scene["touchMovementIntent"]).toEqual(EMPTY_MOVEMENT_INTENT);
    expect(gameScene.clearTouchInputState).toHaveBeenCalledWith(true);
    expect(knob.setPosition).toHaveBeenCalledWith(72, 552);
    expect(container.setVisible).toHaveBeenCalledWith(false);
  });

  it("renders lower-right touch buttons large enough for touch targets and readable labels", () => {
    const scene = new HUDScene() as unknown as AnyScene;
    scene.scene.get.mockImplementation((key: unknown) =>
      key === "GameScene"
        ? {
            beginTouchCrouch: vi.fn(),
            beginTouchRest: vi.fn(),
            clearTouchInputState: vi.fn(),
            endTouchCrouch: vi.fn(),
            endTouchRest: vi.fn(),
            queueTouchInteract: vi.fn(),
            queueTouchJournal: vi.fn(),
            queueTouchPause: vi.fn(),
            queueTouchPeek: vi.fn(),
            setTouchRun: vi.fn(),
          }
        : undefined,
    );

    scene["buildTouchControls"](816, 624);
    const surface = latestSurface();
    const buttonBackgrounds = surface.rectangles.slice(0, 7);
    const labels = surface.texts.slice(0, 7);

    expect(buttonBackgrounds).toHaveLength(7);
    for (const button of buttonBackgrounds) {
      expect(button.width).toBeGreaterThanOrEqual(64);
      expect(button.height).toBeGreaterThanOrEqual(64);
    }
    for (const label of labels) {
      expect(Number.parseInt(String(label.style.fontSize), 10)).toBeGreaterThanOrEqual(12);
    }
  });

  it("lays lower-right touch buttons out as a two-column reserved safe-zone stack", () => {
    const scene = new HUDScene() as unknown as AnyScene;
    scene.scene.get.mockImplementation((key: unknown) =>
      key === "GameScene"
        ? {
            beginTouchCrouch: vi.fn(),
            beginTouchRest: vi.fn(),
            clearTouchInputState: vi.fn(),
            endTouchCrouch: vi.fn(),
            endTouchRest: vi.fn(),
            queueTouchInteract: vi.fn(),
            queueTouchJournal: vi.fn(),
            queueTouchPause: vi.fn(),
            queueTouchPeek: vi.fn(),
            setTouchRun: vi.fn(),
          }
        : undefined,
    );

    scene["buildTouchControls"](816, 624);
    const surface = latestSurface();
    const labelToButton = new Map(
      surface.texts.slice(0, 7).map((label, index) => [label.text, surface.containers[index + 1]!]),
    );

    expect(labelToButton.get("Run")).toMatchObject({ x: 688, y: 568 });
    expect(labelToButton.get("Act")).toMatchObject({ x: 760, y: 568 });
    expect(labelToButton.get("Rest")).toMatchObject({ x: 688, y: 496 });
    expect(labelToButton.get("Crouch")).toMatchObject({ x: 688, y: 424 });
    expect(labelToButton.get("Look")).toMatchObject({ x: 760, y: 496 });
    expect(labelToButton.get("Journal")).toMatchObject({ x: 760, y: 424 });
    expect(labelToButton.get("Pause")).toMatchObject({ x: 760, y: 352 });
  });

  it("keeps touch controls anchored when dialogue opens", () => {
    const scene = new HUDScene() as unknown as AnyScene;
    const container = createGameObject();
    const gameScene = { cinematicActive: false, clearTouchInputState: vi.fn(), isPaused: false };

    Object.assign(scene, {
      dialogue: { isActive: true },
      touchControlsContainer: container,
    });

    scene["updateTouchControlsVisibility"](gameScene);

    expect(container.setY).toHaveBeenCalledWith(0);
    expect(container.setVisible).toHaveBeenCalledWith(true);
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

  it("accepts new touch button presses after game blur resets active controls", () => {
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

    runButtonBackground.emit("pointerdown", { id: 22 }, 0, 0, event);
    scene.game.events.emit("blur");
    runButtonBackground.emit("pointerdown", { id: 23 }, 0, 0, event);

    expect(gameScene.setTouchRun).toHaveBeenNthCalledWith(1, true);
    expect(gameScene.setTouchRun).toHaveBeenNthCalledWith(2, true);
  });

  it("accepts new touch button presses after controls hide and reappear", () => {
    const scene = new HUDScene() as unknown as AnyScene;
    const gameScene = {
      beginTouchCrouch: vi.fn(),
      clearTouchInputState: vi.fn(),
      endTouchCrouch: vi.fn(),
      isPaused: false,
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

    runButtonBackground.emit("pointerdown", { id: 22 }, 0, 0, event);
    gameScene.isPaused = true;
    scene["updateTouchControlsVisibility"](gameScene);
    gameScene.isPaused = false;
    scene["updateTouchControlsVisibility"](gameScene);
    runButtonBackground.emit("pointerdown", { id: 23 }, 0, 0, event);

    expect(gameScene.setTouchRun).toHaveBeenNthCalledWith(1, true);
    expect(gameScene.setTouchRun).toHaveBeenNthCalledWith(2, true);
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

  it("keeps touch Run active until the owning touch ends", () => {
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
    const runPointer = { id: 22 };

    runButtonBackground.emit("pointerdown", runPointer, 0, 0, event);
    runButtonBackground.emit("pointerout", runPointer);
    expect(gameScene.setTouchRun).toHaveBeenCalledOnce();
    expect(gameScene.setTouchRun).toHaveBeenLastCalledWith(true);

    runButtonBackground.emit("pointerupoutside", runPointer);

    expect(gameScene.setTouchRun).toHaveBeenNthCalledWith(1, true);
    expect(gameScene.setTouchRun).toHaveBeenNthCalledWith(2, false);
  });

  it("keeps touch Run held while a separate joystick touch moves and releases", () => {
    const scene = new HUDScene() as unknown as AnyScene;
    const gameScene = {
      beginTouchCrouch: vi.fn(),
      clearTouchInputState: vi.fn(),
      endTouchCrouch: vi.fn(),
      queueTouchInteract: vi.fn(),
      queueTouchJournal: vi.fn(),
      queueTouchPause: vi.fn(),
      queueTouchPeek: vi.fn(),
      setTouchMovementIntent: vi.fn(),
      setTouchRun: vi.fn(),
    };
    scene.scene.get.mockImplementation((key: unknown) => (key === "GameScene" ? gameScene : undefined));

    scene["buildTouchControls"](816, 624);
    const surface = latestSurface();
    const stickBase = surface.circles[0]!;
    const runButtonBackground = surface.rectangles[1]!;
    const event = { stopPropagation: vi.fn() };

    runButtonBackground.emit("pointerdown", { id: 21 }, 0, 0, event);
    stickBase.emit("pointerdown", { id: 11, x: 102, y: 552 }, 0, 0, event);
    scene.input.emit("pointermove", { id: 11, x: 110, y: 556 });
    scene.input.emit("pointerup", { id: 11 });

    expect(gameScene.setTouchRun).toHaveBeenCalledOnce();
    expect(gameScene.setTouchRun).toHaveBeenLastCalledWith(true);

    runButtonBackground.emit("pointerupoutside", { id: 21 });
    expect(gameScene.setTouchRun).toHaveBeenNthCalledWith(2, false);
  });

  it("uses queued touch Act to advance active dialogue like Space", () => {
    const scene = makeFrozenUpdateScene();
    const dialogue = {
      dismiss: vi.fn(),
      isActive: true,
      show: vi.fn(),
      advance: vi.fn(),
    };
    scene.scene.get.mockImplementation((key: unknown) =>
      key === "HUDScene" ? { dialogue } : undefined,
    );
    Object.assign(scene, {
      dialogueRequestInFlight: false,
      isPaused: false,
      journalKey: { isDown: false },
      playerInputFrozen: false,
      tryPrimaryInteract: vi.fn(),
    });

    scene.queueTouchInteract();
    scene.update(0, 16);

    expect(dialogue.advance).toHaveBeenCalledOnce();
    expect(scene["tryPrimaryInteract"]).not.toHaveBeenCalled();
  });

  it("does not interact in the same frame that touch Act closes dialogue", () => {
    const scene = makeFrozenUpdateScene();
    const dialogue = {
      dismiss: vi.fn(),
      isActive: true,
      show: vi.fn(),
      advance: vi.fn(() => {
        dialogue.isActive = false;
      }),
    };
    scene.scene.get.mockImplementation((key: unknown) =>
      key === "HUDScene" ? { dialogue } : undefined,
    );
    Object.assign(scene, {
      dialogueRequestInFlight: false,
      isPaused: false,
      journalKey: { isDown: false },
      playerInputFrozen: false,
      spaceKey: { justDown: true },
      tryPrimaryInteract: vi.fn(),
    });

    scene.queueTouchInteract();
    scene.update(0, 16);

    expect(dialogue.advance).toHaveBeenCalledOnce();
    expect(scene["tryPrimaryInteract"]).not.toHaveBeenCalled();
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
