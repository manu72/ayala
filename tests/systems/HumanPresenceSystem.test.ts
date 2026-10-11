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
  history: [] as Array<{ speaker: string } & Record<string, unknown>>,
  seededMemories: [] as Array<{ npc: string } & Record<string, unknown>>,
  records: [] as Array<Record<string, unknown>>,
  memories: [] as Array<{ npc: string; memory: Record<string, unknown> }>,
}));
vi.mock("../../src/services/ConversationStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/services/ConversationStore")>()),
  getRecentConversations: async (speaker: string) => store.history.filter((r) => r.speaker === speaker),
  getNpcMemories: async (npc: string) => store.seededMemories.filter((m) => m.npc === npc),
  storeConversation: async (record: Record<string, unknown>) => {
    store.records.push(record);
  },
  addNpcMemory: async (npc: string, memory: Record<string, unknown>) => {
    store.memories.push({ npc, memory });
  },
}));

import { StoryKeys } from "../../src/registry/storyKeys";
import { CAMILLE_ENCOUNTER_MEMORY } from "../../src/data/camille-encounter-beats";
import { HUMAN_BUBBLE_WRAP_PX } from "../../src/config/gameplayConstants";
import { flush, human, makeScene } from "./humanSceneHarness";

/** Camille has said both her scripted lines (day 6), so her next greeting asks the AI. */
function camilleMetYesterday(): void {
  store.history = [
    { speaker: "Camille", kind: "ambient", timestamp: 100, gameDay: 6, chapter: 5, lines: ["And who are you, sweetheart?"], gameStateSnapshot: { timeOfDay: "evening", hunger: 80, thirst: 80, energy: 80 } },
    { speaker: "Camille", kind: "ambient", timestamp: 200, gameDay: 6, chapter: 5, lines: ["There you are. I hoped you'd come."] },
  ];
}

function greet(env: ReturnType<typeof makeScene>, who: ReturnType<typeof human>): void {
  env.scene.humans.register(who as never);
  env.scene.humans.showGreetingBubble(who as never);
}

describe("HumanPresenceSystem — ambient lines to Mamma Cat", () => {
  beforeEach(() => {
    store.history = [];
    store.seededMemories = [];
    store.records.length = 0;
    store.memories.length = 0;
  });

  it("a human's first line is the scripted introduction, remembered as an ambient exchange", async () => {
    const env = makeScene();
    greet(env, human("camille", "Camille", 120, 100));
    await flush();

    expect(env.pendingAI).toHaveLength(0);
    expect(env.bubbleLines()).toEqual(["And who are you, sweetheart?"]);
    expect(store.records).toEqual([
      expect.objectContaining({
        speaker: "Camille",
        kind: "ambient",
        lines: ["And who are you, sweetheart?"],
        mammaCatTurn: "Mamma Cat passed close by.",
        gameDay: 7,
      }),
    ]);
  });

  it("asks the AI for one line in passing, with the human's history, memories and story facts", async () => {
    const env = makeScene();
    camilleMetYesterday();
    store.seededMemories = [
      { npc: "Camille", kind: "trait", label: "shy", value: "Keeps her distance.", source: "ai", gameDay: 6 },
      { npc: "Camille", kind: "trait", value: "From a later save.", source: "ai", gameDay: 9 },
    ];
    env.reg.set(StoryKeys.CAMILLE_ENCOUNTER, 2);
    env.reg.set(StoryKeys.CAMILLE_ENCOUNTER_DAY, 6);
    greet(env, human("camille", "Camille", 120, 100));
    await flush();

    const request = env.pendingAI[0]!.request;
    expect(request.interaction).toBe("ambient");
    expect(request.isFirstConversation).toBe(false);
    expect(request.relationshipStage).toBe(2);
    expect(request.gameState.recentEvents).toEqual([
      CAMILLE_ENCOUNTER_MEMORY[1],
      CAMILLE_ENCOUNTER_MEMORY[2],
      "Last encounter was on day 6.",
    ]);
    expect(request.npcMemories?.map((m) => m.value)).toEqual(["Keeps her distance."]);
    expect(request.promptConversationHistory?.[0]?.mammaCatTurn).toBe("[Day 6, evening] Mamma Cat passed close by.");

    env.pendingAI[0]!.resolve({ lines: ["Back again, sweetie.", "never shown"], memoryNote: { kind: "preference", value: "Likes the steps." } });
    await flush();
    expect(env.bubbleLines()).toEqual(["Back again, sweetie."]);
    expect(store.records).toEqual([expect.objectContaining({ speaker: "Camille", kind: "ambient", lines: ["Back again, sweetie."] })]);
    expect(store.memories).toEqual([
      { npc: "Camille", memory: expect.objectContaining({ kind: "preference", value: "Likes the steps.", source: "ai", gameDay: 7, timestamp: 1000 }) },
    ]);
  });

  it("after a save from before they met is restored, the human is neither a stranger nor a first conversation", async () => {
    const env = makeScene(); // day 7, game time 1000
    store.history = [
      { speaker: "Rose", kind: "ambient", timestamp: 5_000, gameDay: 8, chapter: 2, lines: ["Hello, sweetie. Food is here."] },
      { speaker: "Rose", kind: "ambient", timestamp: 6_000, gameDay: 9, chapter: 2, lines: ["Come eat when you're ready."] },
    ];
    greet(env, human("feeder", "Rose", 120, 100));
    await flush();

    const request = env.pendingAI[0]!.request;
    expect(request.promptConversationHistory).toEqual([]);
    expect(request.isFirstConversation).toBe(false);
    expect(request.relationshipStage).toBe(2);
  });

  it.each([
    ["paused for an encounter beat", (_env: ReturnType<typeof makeScene>, h: ReturnType<typeof human>) => h.pauseForEncounter()],
    ["frozen for the beat-5 pickup", (env: ReturnType<typeof makeScene>) => void (env.scene.playerInputFrozen = true)],
  ])("an AI reply that arrives once the human is %s is neither shown nor stored", async (_label, interrupt) => {
    const env = makeScene();
    camilleMetYesterday();
    const camille = human("camille", "Camille", 120, 100);
    greet(env, camille);
    await flush();
    interrupt(env, camille);
    env.dialogue.show(["She sees you. She's not coming closer."]);
    env.pendingAI[0]!.resolve({ lines: ["Hello there, gorgeous!"] });
    await flush();

    expect(env.bubbleLines()).toEqual([]);
    expect(store.records).toEqual([]);
  });

  it("a named human's pool fallback, when the AI fails, is shown and remembered", async () => {
    const env = makeScene();
    camilleMetYesterday();
    greet(env, human("camille", "Camille", 120, 100));
    await flush();
    env.pendingAI[0]!.reject(new Error("upstream 500"));
    await flush();

    const [line] = env.bubbleLines();
    expect(["Hi sweetie.", "Kamusta, pusa.", "There you are.", "Good girl.", "Hello, beautiful."]).toContain(line);
    expect(store.records).toEqual([
      expect.objectContaining({ speaker: "Camille", kind: "ambient", lines: [line], mammaCatTurn: "Mamma Cat passed close by." }),
    ]);
  });

  it("in the scripted-only build a named human's pool line is remembered too", async () => {
    const env = makeScene({ ai: false });
    store.history = [{ speaker: "Ben", kind: "ambient", timestamp: 100, gameDay: 7, chapter: 2, lines: ["Easy there. You're safe by the bowls."] }];
    greet(env, human("ben", "Ben", 120, 100));
    await flush();

    const [line] = env.bubbleLines();
    // ben.md: a few plain words, no pet names
    expect(["There you go.", "Easy.", "Good cat.", "Eat up."]).toContain(line);
    expect(store.records).toEqual([expect.objectContaining({ speaker: "Ben", kind: "ambient", lines: [line] })]);
  });

  it("a greeting aimed at a nearby cat is shown but not remembered", async () => {
    const env = makeScene();
    const rose = human("feeder", "Rose", 500, 500);
    env.scene.humans.register(rose as never);
    env.scene.npcs.push({ cat: { npcName: "Blacky", x: 520, y: 500, visible: true, state: "idle" } });
    env.scene.humans.tick(16);
    await flush();

    expect(env.bubbleLines()).toHaveLength(1);
    expect(env.pendingAI).toEqual([]);
    expect(store.records).toEqual([]);
  });

  it("no one greets Mamma Cat while the beat-5 pickup has her frozen", async () => {
    const env = makeScene();
    env.scene.humans.register(human("feeder", "Rose", 120, 100) as never);
    env.scene.playerInputFrozen = true;
    env.scene.humans.tick(16);
    await flush();

    expect(env.bubbleLines()).toEqual([]);
    expect(env.scene.emotes.show).not.toHaveBeenCalled();
  });
});

describe("HumanPresenceSystem — speech bubbles", () => {
  it("wrap long lines and sit on their bottom edge above the head, so they grow upward", () => {
    const env = makeScene();
    env.scene.humans.renderHumanBubble(human("camille", "Camille", 200, 300) as never, "A long line.", { persistent: true });
    const [bubble] = env.texts;
    expect(bubble?.style).toMatchObject({ wordWrap: { width: HUMAN_BUBBLE_WRAP_PX } });
    expect(bubble?.origin).toEqual([0.5, 1]);
    expect(bubble?.y).toBeLessThan(300);
  });
});
