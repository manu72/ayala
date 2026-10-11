import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import { CAT_DIALOGUE_SCRIPTS } from "../../src/data/cat-dialogue";
import {
  addNpcMemory,
  clearAllConversations,
  getRecentConversations,
  storeConversation,
  type ConversationRecord,
} from "../../src/services/ConversationStore";
import { findUnplayedDialogueScript, type DialogueRequest } from "../../src/services/DialogueService";
import {
  buildConversationRecord,
  loadNpcContext,
  milestoneMemory,
  talkMammaCatTurn,
  toConversationEntry,
  type NpcSceneSnapshot,
} from "../../src/services/NpcContext";

const scene = (overrides: Partial<NpcSceneSnapshot> = {}): NpcSceneSnapshot => ({
  timestamp: 5_000,
  realTimestamp: 1,
  gameDay: 3,
  chapter: 2,
  timeOfDay: "evening",
  hunger: 80,
  thirst: 80,
  energy: 80,
  ...overrides,
});

const talk = (lines: string[], overrides: Partial<NpcSceneSnapshot> = {}): ConversationRecord =>
  buildConversationRecord(scene(overrides), { speaker: "Blacky", kind: "talk", lines, mammaCatTurn: "Mamma Cat came over to talk." });

describe("NpcContext with IndexedDB", () => {
  const originalIndexedDB = globalThis.indexedDB;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    await clearAllConversations();
  });

  afterEach(() => {
    globalThis.indexedDB = originalIndexedDB;
  });

  it("loads the full history, so an exhausted script is not replayed at talk 13", async () => {
    await storeConversation(talk(["New here, are you?"]));
    await storeConversation(talk(["Still here? Good. You're tougher than you look."]));
    for (let i = 0; i < 11; i++) await storeConversation(talk([`AI line ${i}`]));

    const ctx = await loadNpcContext("Blacky", { timestamp: 9_000, gameDay: 3 });
    expect(ctx.records).toHaveLength(13);

    const request: DialogueRequest = {
      speaker: "Blacky",
      speakerType: "cat",
      target: "Mamma Cat",
      gameState: {
        chapter: 2,
        timeOfDay: "evening",
        trustWithSpeaker: 30,
        hunger: 80,
        thirst: 80,
        energy: 80,
        daysSurvived: 3,
        knownCats: [],
        recentEvents: [],
      },
      conversationHistory: ctx.records.map(toConversationEntry),
    };
    expect(findUnplayedDialogueScript(CAT_DIALOGUE_SCRIPTS, request)).toBeNull();
  });

  it("filters prompt records against the full list after a save rollback, keeping scripted records unfiltered", async () => {
    for (let i = 0; i < 5; i++) await storeConversation(talk([`past ${i}`], { timestamp: 1_000 + i, gameDay: 2 }));
    for (let i = 0; i < 12; i++) await storeConversation(talk([`future ${i}`], { timestamp: 50_000 + i, gameDay: 9 }));

    const ctx = await loadNpcContext("Blacky", { timestamp: 2_000, gameDay: 2 });
    expect(ctx.records).toHaveLength(17);
    expect(ctx.promptRecords.map((r) => r.lines[0])).toEqual(["past 0", "past 1", "past 2", "past 3", "past 4"]);
  });

  it("hides memories from a later game day and legacy _return filler", async () => {
    await addNpcMemory("Blacky", { kind: "event", label: "first_meeting", value: "Met on day 1.", source: "scripted", gameDay: 1 });
    await addNpcMemory("Blacky", { kind: "event", label: "blacky_return", value: "Shared a blacky return exchange on day 2.", source: "scripted", gameDay: 2 });
    await addNpcMemory("Blacky", { kind: "trait", label: "calm", value: "Calm.", source: "ai", gameDay: 2 });
    await addNpcMemory("Blacky", { kind: "trait", label: "later", value: "From an abandoned timeline.", source: "ai", gameDay: 6 });

    const ctx = await loadNpcContext("Blacky", { timestamp: 9_000, gameDay: 3 });
    expect(ctx.memories.map((m) => m.value)).toEqual(["Met on day 1.", "Calm."]);
  });

  it("hides memories formed later the same day when a save from that morning is restored", async () => {
    await addNpcMemory("Tiger", { kind: "event", label: "first_meeting", value: "Met in the morning.", source: "scripted", gameDay: 5, timestamp: 40_000 });
    await addNpcMemory("Tiger", { kind: "event", label: "warmed_up", value: "Warmed up in the evening.", source: "scripted", gameDay: 5, timestamp: 70_000 });
    await addNpcMemory("Tiger", { kind: "trait", label: "bold", value: "Bold.", source: "ai", gameDay: 5, timestamp: 70_001 });

    const ctx = await loadNpcContext("Tiger", { timestamp: 50_000, gameDay: 5 });
    expect(ctx.memories.map((m) => m.value)).toEqual(["Met in the morning."]);
  });

  it("round-trips a built record through the store", async () => {
    const record = buildConversationRecord(scene({ trustBefore: 10, trustAfter: 15 }), {
      speaker: "Jayco",
      kind: "story",
      lines: ["The steps are wide enough for all of us."],
      mammaCatTurn: "Mamma Cat came to Jayco's steps.",
    });
    await storeConversation(record);
    expect((await getRecentConversations("Jayco"))[0]).toMatchObject({
      speaker: "Jayco",
      kind: "story",
      gameDay: 3,
      chapter: 2,
      trustBefore: 10,
      trustAfter: 15,
      mammaCatTurn: "Mamma Cat came to Jayco's steps.",
      lines: ["The steps are wide enough for all of us."],
      gameStateSnapshot: { timeOfDay: "evening", hunger: 80, thirst: 80, energy: 80 },
    });
  });
});

describe("toConversationEntry", () => {
  const legacy = (overrides: Partial<ConversationRecord>): ConversationRecord => ({
    speaker: "Camille",
    timestamp: 10,
    gameDay: 4,
    lines: ["Hey, mama.", "You came back."],
    chapter: 5,
    gameStateSnapshot: { timeOfDay: "evening", hunger: 50, thirst: 50, energy: 50 },
    ...overrides,
  });

  it("prefixes the stored Mamma Cat turn with its day and phase and joins the lines", () => {
    const entry = toConversationEntry(legacy({ kind: "story", mammaCatTurn: "Encounter 2: you set a treat down." }));
    expect(entry).toEqual({
      timestamp: 10,
      speaker: "Camille",
      gameDay: 4,
      kind: "story",
      mammaCatTurn: "[Day 4, evening] Encounter 2: you set a treat down.",
      text: "Hey, mama. You came back.",
    });
  });

  it("replaces missing or legacy verbose turns with a neutral line for the record's kind", () => {
    expect(toConversationEntry(legacy({ playerAction: "ambient_greeting" })).mammaCatTurn).toBe(
      "[Day 4, evening] Mamma Cat passed close by.",
    );
    expect(toConversationEntry(legacy({ playerAction: "camille_encounter_2" })).mammaCatTurn).toBe(
      "[Day 4, evening] Mamma Cat was there.",
    );
    // Every stored turn without a `kind` is legacy: raw stats plus a model-invented cue,
    // "approaches" from v0.3.4 to v0.6.2 and "speaks with" from v0.6.3.
    for (const mammaCatTurn of [
      "Mamma Cat approaches Blacky during day. Her hunger is 40, thirst is 55, and energy is 70. Trust with Blacky before this exchange is 25. Mamma Cat flicks her tail.",
      "Mamma Cat speaks with Blacky during dawn. Her hunger is 91.4. Mamma Cat says she is lost.",
    ]) {
      expect(toConversationEntry(legacy({ speaker: "Blacky", mammaCatTurn }))).toMatchObject({
        kind: "talk",
        mammaCatTurn: "[Day 4, evening] Mamma Cat came over to talk.",
      });
    }
  });

  it("omits the parts of the bracket it does not know", () => {
    expect(toConversationEntry(legacy({ kind: "talk", gameStateSnapshot: undefined, mammaCatTurn: "Came over." })).mammaCatTurn).toBe(
      "[Day 4] Came over.",
    );
  });
});

describe("game-authored Mamma Cat turns and milestone memories", () => {
  it("describes an engaged talk, adding her condition only when notable", () => {
    expect(talkMammaCatTurn({ hunger: 90, thirst: 90, energy: 90 })).toBe("Mamma Cat came over to talk.");
    expect(talkMammaCatTurn({ hunger: 20, thirst: 90, energy: 50 })).toBe(
      "Mamma Cat came over to talk. She was very hungry and tired.",
    );
  });

  it("writes scripted memories only for milestones, in words the NPC can use", () => {
    expect(milestoneMemory("blacky_first", { timestamp: 7_000, gameDay: 3, timeOfDay: "evening" })).toEqual({
      kind: "event",
      label: "first_meeting",
      value: "You first met Mamma Cat on day 3, in the evening.",
      source: "scripted",
      gameDay: 3,
      timestamp: 7_000,
    });
    expect(milestoneMemory("tiger_warmup", { timestamp: 8_000, gameDay: 4, timeOfDay: "dawn" })?.value).toBe(
      "On day 4, at dawn, you stopped hissing at Mamma Cat and told her about the food by the stone building.",
    );
    expect(milestoneMemory("blacky_return", { timestamp: 9_000, gameDay: 5, timeOfDay: "day" })).toBeNull();
    expect(milestoneMemory(undefined, { timestamp: 9_000, gameDay: 5, timeOfDay: "day" })).toBeNull();
  });
});
