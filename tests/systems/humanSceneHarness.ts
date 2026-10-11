import { vi } from "vitest";
import { CamilleEncounterSystem } from "../../src/systems/CamilleEncounterSystem";
import { HumanPresenceSystem } from "../../src/systems/HumanPresenceSystem";
import { DialogueSystem } from "../../src/systems/DialogueSystem";
import { FallbackDialogueService } from "../../src/services/FallbackDialogueService";
import { ScriptedDialogueService, type DialogueRequest, type DialogueResponse } from "../../src/services/DialogueService";
import type { AIDialogueCallOptions } from "../../src/services/AIDialogueService";

/**
 * A minimal GameScene for driving the real CamilleEncounterSystem,
 * HumanPresenceSystem and DialogueSystem: timers are captured (fire them by
 * hand) and the AI is a promise per request that the test settles.
 *
 * Test files must mock `phaser`, `src/sprites/HumanNPC`, `src/sprites/DogNPC`,
 * `src/sprites/SpriteProfiles` and `src/services/ConversationStore` themselves
 * (vi.mock is per test file).
 */

export interface FakeHuman {
  x: number;
  y: number;
  active: boolean;
  visible: boolean;
  paused: boolean;
  isExitingPark: boolean;
  humanType: string;
  identityName: string | null;
  readonly isEncounterPaused: boolean;
  readonly isCatPerson: boolean;
  readonly isGreeting: boolean;
  stationaryGreetCount: number;
  hushed: boolean;
  config: { path: Array<{ x: number; y: number }>; avoidanceRadius?: number };
  greeting: boolean;
  pauseForEncounter(): void;
  resumeFromEncounter(): void;
  playCrouchToward(): void;
  setPhase(): void;
  update(): void;
  startGreeting(): void;
  incrementStationaryGreet(): void;
  hasGreeted(): boolean;
  markGreeted(): void;
}

export function human(humanType: string, identityName: string | null, x: number, y: number): FakeHuman {
  return {
    x,
    y,
    active: true,
    visible: true,
    paused: false,
    isExitingPark: false,
    humanType,
    identityName,
    stationaryGreetCount: 0,
    hushed: false,
    greeting: false,
    config: { path: [{ x: 0, y: 0 }] },
    get isEncounterPaused() {
      return this.paused;
    },
    get isCatPerson() {
      return true;
    },
    get isGreeting() {
      return this.greeting;
    },
    pauseForEncounter() {
      this.paused = true;
    },
    resumeFromEncounter() {
      this.paused = false;
    },
    playCrouchToward() {},
    setPhase() {},
    update() {},
    startGreeting() {
      this.greeting = true;
    },
    incrementStationaryGreet() {
      this.stationaryGreetCount += 1;
    },
    hasGreeted: () => false,
    markGreeted() {},
  };
}

export interface Timer {
  ms: number;
  cb: () => void;
  removed: boolean;
  remove(): void;
}

export interface PendingAI {
  request: DialogueRequest;
  signal: AbortSignal | undefined;
  resolve(response: DialogueResponse): void;
  reject(err: unknown): void;
}

function drawable(): unknown {
  const o: Record<string, unknown> = { input: { enabled: false } };
  for (const m of ["setInteractive", "setDepth", "setVisible", "setOrigin", "setStrokeStyle", "on", "setText", "setColor"]) {
    o[m] = () => o;
  }
  return o;
}

export interface BubbleText {
  x: number;
  y: number;
  line: string;
  style: Record<string, unknown>;
  origin: [number, number] | null;
  destroyed: boolean;
}

/** `ai: false` is the scripted-only build (no AI service, no AI calls). */
export function makeScene(opts: { ai?: boolean } = {}) {
  const timers: Timer[] = [];
  const reg = new Map<string, unknown>();
  const dialogue = new DialogueSystem({
    cameras: { main: { width: 800, height: 600 } },
    add: { rectangle: drawable, text: drawable, container: drawable },
    input: { keyboard: null },
  } as never);
  const pendingAI: PendingAI[] = [];
  const ai = {
    getDialogue: (request: DialogueRequest, callOpts?: AIDialogueCallOptions) =>
      new Promise<DialogueResponse>((resolve, reject) => {
        callOpts?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        pendingAI.push({ request, signal: callOpts?.signal, resolve, reject });
      }),
  };
  const texts: BubbleText[] = [];
  const scene = {
    map: {},
    player: {
      x: 100,
      y: 100,
      startGreeting: vi.fn(),
      setVelocity: vi.fn(),
      body: { setEnable() {} },
      setAlpha() {},
      setVisible() {},
    },
    dayNight: { currentPhase: "evening", dayCount: 7, totalGameTimeMs: 1000 },
    registry: { get: (k: string) => reg.get(k), set: (k: string, v: unknown) => reg.set(k, v) },
    dialogue,
    time: {
      now: 100_000,
      delayedCall: (ms: number, cb: () => void) => {
        const t: Timer = { ms, cb, removed: false, remove: () => (t.removed = true) };
        timers.push(t);
        return t;
      },
    },
    hasLineOfSight: () => true,
    add: {
      text: (x: number, y: number, line: string, style: Record<string, unknown>) => {
        const t: BubbleText & { setOrigin(ox: number, oy?: number): unknown; setDepth(): unknown; destroy(): void } = {
          x,
          y,
          line,
          style,
          origin: null,
          destroyed: false,
          setOrigin: (ox: number, oy?: number) => ((t.origin = [ox, oy ?? ox]), t),
          setDepth: () => t,
          destroy: () => (t.destroyed = true),
        };
        texts.push(t);
        return t;
      },
    },
    tweens: { add() {}, killTweensOf() {} },
    scene: { get: () => ({ showNarration() {}, pulseEdge() {} }) },
    dialogueService: opts.ai === false ? new ScriptedDialogueService({}) : new FallbackDialogueService(ai, new ScriptedDialogueService({})),
    stats: { restore: vi.fn(), hunger: 80, thirst: 80, energy: 80 },
    trust: { global: 40 },
    chapters: { chapter: 5 },
    knownCats: new Set<string>(),
    emotes: { show: vi.fn() },
    anims: { exists: () => false },
    scoring: { recordHumanEngagement() {} },
    npcs: [] as unknown[],
    isPaused: false,
    playerInputFrozen: false,
    autoSave: vi.fn(),
    startChapter6Sequence: vi.fn(),
    humans: null as unknown as HumanPresenceSystem,
    camille: null as unknown as CamilleEncounterSystem,
  };
  scene.humans = new HumanPresenceSystem(scene as never);
  scene.camille = new CamilleEncounterSystem(scene as never);
  /** Lines drawn in human bubbles, in order. */
  const bubbleLines = (): string[] => texts.map((t) => t.line);
  return { scene, timers, reg, dialogue, pendingAI, texts, bubbleLines };
}

export type Scene = ReturnType<typeof makeScene>["scene"];

/** Camille's group, as the encounter system holds it after a spawn. */
export function stageCamille(scene: Scene, opts: { pending?: number; withManu?: boolean } = {}) {
  const internals = scene.camille as unknown as {
    camilleNPC: FakeHuman | null;
    manuNPC: FakeHuman | null;
    kishNPC: FakeHuman | null;
    pendingEncounter: number;
    encounterActive: boolean;
  };
  const camille = human("camille", "Camille", 120, 100);
  const manu = opts.withManu ? human("manu", "Manu", 300, 300) : null;
  internals.camilleNPC = camille;
  internals.manuNPC = manu;
  scene.humans.register(camille as never);
  if (manu) scene.humans.register(manu as never);
  internals.pendingEncounter = opts.pending ?? 0;
  internals.encounterActive = true;
  return { camille, manu, internals };
}

export const flush = async (): Promise<void> => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};
