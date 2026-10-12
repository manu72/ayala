import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Input: { Keyboard: { KeyCodes: { SPACE: 32 } } },
    Math: { Distance: { Between: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1) } },
    Utils: { Array: { Shuffle: <T>(a: T[]) => a } },
  },
}));
vi.mock("../../src/sprites/HumanNPC", () => ({ HumanNPC: class {} }));
vi.mock("../../src/sprites/DogNPC", () => ({ DogNPC: class {} }));
vi.mock("../../src/sprites/SpriteProfiles", () => ({ kishProfileForDay: () => "kish" }));

const store = vi.hoisted(() => ({
  history: [] as unknown[],
  records: [] as Array<Record<string, unknown>>,
  memories: [] as unknown[],
}));
vi.mock("../../src/services/ConversationStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/services/ConversationStore")>()),
  getRecentConversations: async () => store.history,
  getNpcMemories: async () => [],
  storeConversation: async (record: Record<string, unknown>) => {
    store.records.push(record);
  },
  addNpcMemory: async (npc: string, memory: unknown) => {
    store.memories.push({ npc, memory });
  },
}));

import { StoryKeys } from "../../src/registry/storyKeys";
import {
  CAMILLE_BEAT5_ACCEPT_LINE,
  CAMILLE_ENCOUNTER_5_JOURNEY_STEPS,
  CAMILLE_ENCOUNTER_MEMORY,
} from "../../src/data/camille-encounter-beats";
import { flush, makeScene, stageCamille, type Scene } from "./humanSceneHarness";

/** The proximity poll fires the beat and its 8–12 s delay elapses. */
async function reachCamille(env: ReturnType<typeof makeScene>): Promise<void> {
  env.scene.camille.checkProximity();
  env.timers[env.timers.length - 1]!.cb();
  await flush();
}

function readAll(dialogue: Scene["dialogue"]): void {
  while (dialogue.isActive) dialogue.advance();
}

/** The beat-5 journey ("The garden shrinks behind you...") is the modal on screen. */
function journeyOpen(dialogue: Scene["dialogue"]): boolean {
  const lines = (dialogue as unknown as { lines: string[] }).lines;
  return dialogue.isActive && lines[0] === CAMILLE_ENCOUNTER_5_JOURNEY_STEPS[0]?.narrator;
}

beforeEach(() => {
  store.history = [];
  store.records.length = 0;
  store.memories.length = 0;
});

describe("CamilleEncounterSystem — beats 2–4", () => {
  it("a beat read to the end advances the story and is not re-armed for a replay", async () => {
    const env = makeScene({ ai: false });
    const { camille, internals } = stageCamille(env.scene, { pending: 2 });
    await reachCamille(env);
    expect(env.dialogue.isActive).toBe(true);
    readAll(env.dialogue);

    expect(env.reg.get(StoryKeys.CAMILLE_ENCOUNTER)).toBe(2);
    expect(internals.pendingEncounter).toBe(0);
    expect(camille.paused).toBe(false);
  });

  it("closing a beat early re-arms it and advances or stores nothing", async () => {
    const env = makeScene({ ai: false });
    const { camille, internals } = stageCamille(env.scene, { pending: 3 });
    await reachCamille(env);
    env.dialogue.dismiss();

    expect(internals.pendingEncounter).toBe(3);
    expect(env.reg.get(StoryKeys.CAMILLE_ENCOUNTER)).toBeUndefined();
    expect(camille.paused).toBe(false);
    expect(store.records).toEqual([]);
  });

  it("a reply arriving while another modal is open pauses nobody and re-arms the beat", async () => {
    const env = makeScene();
    const { camille, manu, internals } = stageCamille(env.scene, { pending: 3, withManu: true });
    env.reg.set(StoryKeys.CAMILLE_ENCOUNTER, 2);
    await reachCamille(env);
    expect(env.pendingAI).toHaveLength(1);

    env.dialogue.show(['Tiger: "What do you want?"']); // a cat chat opens during the AI wait
    env.pendingAI[0]!.resolve({ lines: ["You came back."] });
    await flush();

    expect([camille.paused, manu?.paused]).toEqual([false, false]);
    expect(internals.pendingEncounter).toBe(3);
    env.dialogue.advance(); // the cat chat closes
    expect(env.reg.get(StoryKeys.CAMILLE_ENCOUNTER)).toBe(2);
    expect(store.records).toEqual([]);

    // the next poll retries the same evening
    await reachCamille(env);
    env.pendingAI[1]!.resolve({ lines: ["You came back."] });
    await flush();
    readAll(env.dialogue);
    expect(env.reg.get(StoryKeys.CAMILLE_ENCOUNTER)).toBe(3);
  });

  it("a paired beat refuses to open over another modal, pausing nobody", () => {
    const env = makeScene();
    const { camille, manu } = stageCamille(env.scene, { withManu: true });
    env.dialogue.show(["Blacky: \"Go on, then.\""]);
    const playPairedBeat = (env.scene.camille as unknown as {
      playPairedBeat(steps: Array<{ narrator: string; spoken?: string }>, speaker: unknown, onComplete: () => void): boolean;
    }).playPairedBeat.bind(env.scene.camille);
    const onComplete = vi.fn();

    expect(playPairedBeat([{ narrator: "She waits.", spoken: "Hi." }], camille, onComplete)).toBe(false);
    expect([camille.paused, manu?.paused]).toEqual([false, false]);
    expect(env.bubbleLines()).toEqual([]);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it.each([
    ["walked out of range", (_env: ReturnType<typeof makeScene>, camille: { x: number }) => void (camille.x = 600)],
    ["the evening ended", (env: ReturnType<typeof makeScene>) => void (env.scene.dayNight.currentPhase = "night")],
    ["was torn down", (_env: ReturnType<typeof makeScene>, camille: { active: boolean }) => void (camille.active = false)],
  ])("a beat whose witness was lost during the AI wait (Camille %s) re-arms without playing", async (_label, lose) => {
    const env = makeScene();
    const { camille, internals } = stageCamille(env.scene, { pending: 4 });
    await reachCamille(env);
    lose(env, camille);
    env.pendingAI[0]!.resolve({ lines: ["Hi, sweetie."] });
    await flush();

    expect(env.dialogue.isActive).toBe(false);
    expect(camille.paused).toBe(false);
    expect(internals.pendingEncounter).toBe(4);
    expect(env.reg.get(StoryKeys.CAMILLE_ENCOUNTER)).toBeUndefined();
    expect(env.scene.stats.restore).not.toHaveBeenCalled();
    expect(store.records).toEqual([]);
  });

  it("the stored beat is the spoken lines Mamma Cat saw, with the encounter's authored fact as her side", async () => {
    const env = makeScene();
    const { camille } = stageCamille(env.scene, { pending: 2 });
    await reachCamille(env);
    const request = env.pendingAI[0]!.request;
    expect(request.interaction).toBe("beat");
    expect(request.isFirstConversation).toBe(false);
    expect(request.encounterBeat?.slots).toHaveLength(2);
    env.pendingAI[0]!.resolve({
      lines: ["There you are, mama.", "No rush."],
      memoryNote: { kind: "trait", value: "Cautious but curious." },
    });
    await flush();

    expect(env.bubbleLines()).toEqual(["There you are, mama."]);
    camille.visible = false; // second step: Camille is out of sight, so no bubble for it
    readAll(env.dialogue);
    await flush();

    expect(env.bubbleLines()).toEqual(["There you are, mama."]);
    expect(store.records).toEqual([
      expect.objectContaining({
        speaker: "Camille",
        kind: "story",
        lines: ["There you are, mama."],
        mammaCatTurn: CAMILLE_ENCOUNTER_MEMORY[2],
        gameDay: 7,
      }),
    ]);
    expect(store.records[0]).not.toHaveProperty("trustBefore", expect.anything());
    expect(store.memories).toEqual([
      { npc: "Camille", memory: expect.objectContaining({ kind: "trait", source: "ai", gameDay: 7 }) },
    ]);
  });

  it("Camille's group holds its greetings while a beat waits on its delay and AI request", async () => {
    const env = makeScene();
    const { camille, manu } = stageCamille(env.scene, { pending: 2, withManu: true });
    const rose = { identityName: "Rose" };
    expect(env.scene.camille.holdsGreetingFrom(camille as never, false)).toBe(false);

    env.scene.camille.checkProximity(); // the 8 s delay starts
    expect(env.scene.camille.holdsGreetingFrom(camille as never, false)).toBe(true);
    expect(env.scene.camille.holdsGreetingFrom(manu as never, false)).toBe(true);
    expect(env.scene.camille.holdsGreetingFrom(rose as never, true)).toBe(false);

    env.scene.humans.tick(16);
    await flush();
    expect(env.pendingAI).toHaveLength(0);
    expect(env.bubbleLines()).toEqual([]);

    env.timers[env.timers.length - 1]!.cb(); // delay over: the beat's AI request starts
    await flush();
    expect(env.scene.camille.holdsGreetingFrom(camille as never, false)).toBe(true);
    env.pendingAI[0]!.resolve({ lines: ["Hey, mama."] });
    await flush();
    expect(env.dialogue.isActive).toBe(true);
    expect(env.scene.camille.holdsGreetingFrom(camille as never, true)).toBe(false);
  });

  it("an armed beat holds the group's greetings to Mamma Cat on her approach, not those to other cats", async () => {
    const env = makeScene();
    const { camille, manu } = stageCamille(env.scene, { pending: 2, withManu: true });
    expect(env.scene.camille.holdsGreetingFrom(camille as never, true)).toBe(true);
    expect(env.scene.camille.holdsGreetingFrom(manu as never, true)).toBe(true);
    expect(env.scene.camille.holdsGreetingFrom(camille as never, false)).toBe(false);

    // Mamma Cat is 20 px away and Camille has never spoken to her: without the hold
    // this frame would say "And who are you, sweetheart?" just before beat 2's "You came back."
    env.scene.humans.tick(16);
    await flush();
    expect(env.bubbleLines()).toEqual([]);
    expect(store.records).toEqual([]);

    env.scene.npcs.push({ cat: { npcName: "Blacky", x: 140, y: 120, visible: true, state: "idle" } });
    env.scene.humans.tick(16);
    expect(env.bubbleLines()).toHaveLength(1); // her line to Blacky
    expect(store.records).toEqual([]);
  });

  it("opening a beat cancels an ambient AI line already in flight, so it never lands on the beat", async () => {
    const env = makeScene();
    const { camille, internals } = stageCamille(env.scene);
    // Camille already said her first line today: the next greeting asks the AI
    store.history = [{ speaker: "Camille", kind: "ambient", timestamp: 500, gameDay: 7, chapter: 5, lines: ["And who are you, sweetheart?"] }];
    env.scene.humans.showGreetingBubble(camille as never);
    await flush();
    expect(env.pendingAI.map((p) => p.request.interaction)).toEqual(["ambient"]);

    internals.pendingEncounter = 2; // the ambient visit is adopted into encounter 2
    await reachCamille(env);
    env.pendingAI[1]!.resolve({ lines: ["Hey, mama."] });
    await flush();
    expect(env.dialogue.isActive).toBe(true);
    expect(env.pendingAI[0]!.signal?.aborted).toBe(true);

    env.pendingAI[0]!.resolve({ lines: ["Hello there, gorgeous!"] }); // too late: already aborted
    await flush();
    expect(env.bubbleLines()).toEqual(["Hey, mama."]);
    expect(store.records).toEqual([]);
  });
});

describe("CamilleEncounterSystem — beat 5", () => {
  it("a paused game re-arms beat 5 before any registry write", () => {
    const env = makeScene();
    const { internals } = stageCamille(env.scene, { pending: 5 });
    env.scene.camille.checkProximity();
    env.scene.isPaused = true;
    env.timers[env.timers.length - 1]!.cb();

    expect(internals.pendingEncounter).toBe(5);
    expect(env.reg.get(StoryKeys.CAMILLE_ENCOUNTER)).toBeUndefined();
    expect(env.dialogue.isActive).toBe(false);
  });

  it("closing the ask early re-arms beat 5; reading it through opens the decision window without a re-arm", () => {
    const env = makeScene();
    const { camille, internals } = stageCamille(env.scene, { pending: 5 });
    env.scene.camille.checkProximity();
    env.timers[env.timers.length - 1]!.cb();
    expect(env.reg.get(StoryKeys.CAMILLE_ENCOUNTER)).toBe(5);
    env.dialogue.dismiss();
    expect(internals.pendingEncounter).toBe(5);
    expect(camille.paused).toBe(false);
    expect(store.records).toEqual([]);

    env.scene.camille.checkProximity();
    env.timers[env.timers.length - 1]!.cb();
    readAll(env.dialogue);
    expect(internals.pendingEncounter).toBe(0);
    expect(camille.paused).toBe(true); // held through the decision window
    expect(store.records).toEqual([
      expect.objectContaining({
        speaker: "Camille",
        kind: "story",
        lines: ["Would you like to come home with me, little one?", "I promise. No grabbing."],
        mammaCatTurn: "Camille crouched and asked Mamma Cat to come home with her.",
      }),
    ]);
  });

  it("accepting freezes input at once, and a modal opened before the journey delays it instead of soft-locking", () => {
    const env = makeScene();
    stageCamille(env.scene);
    (env.scene.camille as unknown as { beginBeat5Decision(): void }).beginBeat5Decision();
    env.scene.player.x = 110;
    expect(env.scene.camille.tryAcceptBeat5Decision()).toBe(true);
    expect(env.scene.playerInputFrozen).toBe(true);
    expect(store.records).toEqual([
      expect.objectContaining({ lines: [CAMILLE_BEAT5_ACCEPT_LINE], mammaCatTurn: "Mamma Cat came to Camille's feet. She said yes." }),
    ]);

    env.dialogue.show(["A guard leans on the railing and tells a story."]);
    env.timers.find((t) => t.ms === 3200)!.cb();
    expect(journeyOpen(env.dialogue)).toBe(false);
    env.dialogue.advance(); // the other modal closes
    env.timers[env.timers.length - 1]!.cb(); // the journey's retry
    expect(journeyOpen(env.dialogue)).toBe(true);

    readAll(env.dialogue);
    expect(env.reg.get(StoryKeys.ENCOUNTER_5_COMPLETE)).toBe(true);
    expect(env.scene.startChapter6Sequence).toHaveBeenCalledTimes(1);
  });

  it("her yes hands the moment to the colony's farewell: Camille stays with her and the journey waits for it", () => {
    const env = makeScene();
    const { camille } = stageCamille(env.scene);
    const farewell = { done: () => {} };
    const gatherForFarewell = vi.fn((_camille: unknown, done: () => void) => {
      farewell.done = done;
      return true;
    });
    Object.assign(env.scene, { eggs: { gatherForFarewell } });
    (env.scene.camille as unknown as { beginBeat5Decision(): void }).beginBeat5Decision();
    env.scene.player.x = 110;
    expect(env.scene.camille.isLeavingWithCamille).toBe(false);
    const turn = vi.spyOn(camille, "pauseForEncounter");
    env.scene.camille.tryAcceptBeat5Decision();
    expect(env.scene.camille.isLeavingWithCamille).toBe(true); // snatchers leave her be from here
    expect(turn).toHaveBeenCalledWith(110); // she turns to Mamma Cat, wherever she came from

    env.timers.find((t) => t.ms === 3200)!.cb();
    expect(gatherForFarewell).toHaveBeenCalledWith(camille, expect.any(Function));
    expect(camille.paused).toBe(true);
    expect(env.scene.playerInputFrozen).toBe(true);
    expect(env.dialogue.isActive).toBe(false);

    farewell.done();
    expect(journeyOpen(env.dialogue)).toBe(true);
    readAll(env.dialogue);
    expect(env.reg.get(StoryKeys.ENCOUNTER_5_COMPLETE)).toBe(true);
    expect(env.scene.startChapter6Sequence).toHaveBeenCalledTimes(1);
  });

  it("Camille is seen walking in with the carrier, and word spreads, before her last encounter can begin", () => {
    const env = makeScene();
    const { camille, internals } = stageCamille(env.scene, { pending: 5 });
    let underTrees = true;
    const storyShot = vi.fn();
    const spreadWord = vi.fn();
    Object.assign(env.scene, { storyShot, eggs: { spreadWord }, isUnderCanopy: () => underTrees });
    Object.assign(internals, { arrivalShotDue: true });
    const armed = () => env.timers.filter((t) => t.ms === 12_000).length;

    env.scene.camille.checkProximity();
    expect(armed()).toBe(0); // not before she's been seen arriving
    underTrees = false;
    camille.visible = false; // the frame she's spawned, before her first update shows her
    env.scene.camille.update();
    camille.visible = true;
    underTrees = true;
    env.scene.camille.update();
    expect(storyShot).not.toHaveBeenCalled(); // hidden under the trees: there'd be nothing to see

    underTrees = false;
    env.dialogue.show(["A cat is talking."]);
    env.scene.camille.update();
    expect(storyShot).not.toHaveBeenCalled(); // waits for the screen
    env.dialogue.advance();
    env.scene.camille.update();
    env.scene.camille.update();
    expect(storyShot).toHaveBeenCalledOnce();
    const [target, , cb] = storyShot.mock.calls[0] as [unknown, number, { onDone(): void }];
    expect(target).toBe(camille);
    env.scene.camille.checkProximity();
    expect(armed()).toBe(0); // the camera is still on her

    cb.onDone();
    expect(spreadWord).toHaveBeenCalledWith(camille);
    env.scene.camille.checkProximity();
    expect(armed()).toBe(1);
  });

  it("Mamma Cat walks into the carrier Camille set down, and Camille picks it up only once she's in", () => {
    const env = makeScene();
    const { camille, internals } = stageCamille(env.scene);
    const tweens: Array<Record<string, unknown>> = [];
    Object.assign(env.scene.tweens, { add: (cfg: Record<string, unknown>) => tweens.push(cfg) });
    const carrier = {
      x: 0,
      y: 0,
      destroy() {},
      setVisible: () => carrier,
      setDepth: () => carrier,
      setFlipX: () => carrier,
      setPosition: (x: number, y: number) => Object.assign(carrier, { x, y }),
    };
    // the journey's re-crouch has just turned her right, toward Mamma Cat; the carrier hasn't caught up
    Object.assign(camille, { depth: 3, anims: { currentAnim: { key: "camille-crouch-right" } }, setVisible() {} });
    Object.assign(internals, { carrier, carrierSide: -1 });
    camille.pauseForEncounter();

    (env.scene.camille as unknown as { runBeat5Pickup(): void }).runBeat5Pickup();
    expect(tweens[0]).toMatchObject({ targets: env.scene.player, x: camille.x + 13, y: camille.y + 11, alpha: 0 });
    expect(tweens[1]).toMatchObject({ targets: camille, delay: 1000 });
    expect(camille.paused).toBe(true); // crouched by the carrier while Mamma Cat goes in
    expect(tweens[1]!.onStart).toBeUndefined(); // and held through the walk-off: her route can't steer her
    (tweens[1]!.onComplete as () => void)();
    expect(camille.paused).toBe(false);
  });

  it("the last visit is a fresh walk-in with the carrier: it waits until a care visit on screen is out of sight", () => {
    const env = makeScene();
    const { camille, internals } = stageCamille(env.scene);
    internals.encounterActive = false; // an ambient care visit, still on its rounds
    env.reg.set(StoryKeys.CAMILLE_ENCOUNTER, 4);
    const view = { x: 0, y: 0, right: 800, bottom: 600 };
    Object.assign(env.scene, {
      map: { findObject: () => null }, // the care routes fall back to their built-in points
      cameras: { main: { worldView: view } },
      createHumanNavigationGrid: () => null,
      routeHumanConfig: (config: unknown) => config,
      physics: { add: { collider() {} } },
    });
    const destroy = vi.fn();
    Object.assign(camille, { destroy });
    const due = () => (internals as unknown as { arrivalShotDue: boolean }).arrivalShotDue;

    env.scene.camille.checkEncounter(); // she's on screen
    expect(internals.camilleNPC).toBe(camille);
    expect(internals.pendingEncounter).toBe(0);

    view.x = 5000; // the camera has moved on
    view.right = 5800;
    const roll = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      env.scene.camille.checkEncounter();
    } finally {
      roll.mockRestore();
    }
    expect(destroy).toHaveBeenCalled(); // not adopted: she walks in again from the underpass
    expect(internals.pendingEncounter).toBe(5);
    expect(due()).toBe(true); // with the carrier, owed her arrival shot

    Object.assign(internals, { camilleNPC: null, manuNPC: null, kishNPC: null }); // (the spawned fakes are bare)
    env.scene.camille.startEncounter(4);
    expect(due()).toBe(false); // earlier visits bring no carrier
  });

  it("a scene shutdown after her yes lets everything go: not leaving, Camille released", () => {
    const env = makeScene();
    const { camille } = stageCamille(env.scene);
    (env.scene.camille as unknown as { beginBeat5Decision(): void }).beginBeat5Decision();
    env.scene.player.x = 110;
    env.scene.camille.tryAcceptBeat5Decision();
    expect(camille.paused).toBe(true);

    env.scene.camille.shutdownCamilleState();
    expect(env.scene.camille.isLeavingWithCamille).toBe(false);
    expect(env.scene.playerInputFrozen).toBe(false);
    expect(camille.paused).toBe(false);
  });

  it("closing the journey early still reaches Chapter 6, exactly once", () => {
    const env = makeScene();
    const { camille } = stageCamille(env.scene);
    (env.scene.camille as unknown as { beginBeat5Decision(): void }).beginBeat5Decision();
    env.scene.player.x = 110;
    env.scene.camille.tryAcceptBeat5Decision();
    env.timers.find((t) => t.ms === 3200)!.cb();
    expect(env.dialogue.isActive).toBe(true);
    env.dialogue.dismiss();

    expect(env.reg.get(StoryKeys.ENCOUNTER_5_COMPLETE)).toBe(true);
    expect(env.scene.startChapter6Sequence).toHaveBeenCalledTimes(1);
    expect(env.dialogue.isActive).toBe(false);
    expect(camille.paused).toBe(true); // still held: only her walk-off tween moves her now
  });

  it("a timed-out ask is remembered only if Camille's line was shown", () => {
    const env = makeScene();
    const { camille, internals } = stageCamille(env.scene);
    const camilleSystem = env.scene.camille as unknown as { beginBeat5Decision(): void };
    camilleSystem.beginBeat5Decision();
    env.timers[env.timers.length - 1]!.cb();
    expect(internals.pendingEncounter).toBe(5);
    expect(store.records).toEqual([
      expect.objectContaining({ mammaCatTurn: "Camille waited, but Mamma Cat did not come to her." }),
    ]);

    camille.visible = false;
    camilleSystem.beginBeat5Decision();
    env.timers[env.timers.length - 1]!.cb();
    expect(store.records).toHaveLength(1);
    expect(env.scene.camille.isLeavingWithCamille).toBe(false);
  });
});

describe("CamilleEncounterSystem — Kish, slow down", () => {
  it("is remembered by Camille only when Mamma Cat is there to see it", () => {
    for (const [playerX, stored] of [[100, 1], [2000, 0]] as const) {
      store.records.length = 0;
      const env = makeScene();
      const { internals } = stageCamille(env.scene);
      internals.kishNPC = { x: 150, y: 100, isGreeting: false, isEncounterPaused: false } as never;
      env.scene.player.x = playerX;
      env.scene.camille.tryPlayKishSlowDownBeat();
      expect(env.bubbleLines()).toEqual(["Kish, slow down."]);
      expect(store.records).toHaveLength(stored);
    }
  });
});
