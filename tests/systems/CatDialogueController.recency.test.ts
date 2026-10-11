import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: { Math: { Distance: { Between: (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by) } } },
}));
vi.mock("../../src/services/ConversationStore", () => ({
  getRecentConversations: vi.fn(), getConversationCount: vi.fn(), getNpcMemories: vi.fn(),
  storeConversation: vi.fn(), addNpcMemory: vi.fn(),
}));

import { CatDialogueController } from "../../src/systems/CatDialogueController";
import { GP } from "../../src/config/gameplayConstants";
import { StoryKeys } from "../../src/registry/storyKeys";
import { RECENT_DIALOGUE_WINDOW_MS } from "../../src/utils/dialogueRecency";
import { matchScriptedResponse } from "../../src/services/AIDialogueService";
import { getRecentConversations, getConversationCount, getNpcMemories, storeConversation, addNpcMemory, type ConversationRecord } from "../../src/services/ConversationStore";
import type { DialogueRequest, DialogueResponse } from "../../src/services/DialogueService";
import type { GameScene } from "../../src/scenes/GameScene";
import type { NPCCat } from "../../src/sprites/NPCCat";

function cat(name: string, x = 0): NPCCat {
  return { npcName: name, x, y: 0, active: true, state: "idle", engageDialogue: vi.fn(), disengageDialogue: vi.fn() } as unknown as NPCCat;
}

function fixture() {
  const history: ConversationRecord[] = ["Blacky", "Tiger"].map((speaker) => ({
    speaker, timestamp: 1_000, realTimestamp: 5_000, gameDay: 1,
    lines: ["There is shade here."], trustBefore: 20, trustAfter: 20, chapter: 2,
  }));
  vi.mocked(getRecentConversations).mockImplementation(async (name, limit) => history.filter((r) => r.speaker === name).slice(-(limit ?? 20)));
  vi.mocked(getConversationCount).mockImplementation(async (name) => history.filter((r) => r.speaker === name).length);
  vi.mocked(getNpcMemories).mockResolvedValue([]);
  vi.mocked(storeConversation).mockImplementation(async (record) => { history.push(record); });
  vi.mocked(addNpcMemory).mockResolvedValue(undefined);

  let completion: (() => void) | undefined;
  const dialogue = {
    isActive: false,
    show: vi.fn((_lines: string[], onComplete?: () => void) => { dialogue.isActive = true; completion = onComplete; }),
    dismiss: vi.fn(() => { dialogue.isActive = false; completion = undefined; }),
  };
  const getDialogue = vi.fn<(request: DialogueRequest) => Promise<DialogueResponse>>().mockResolvedValue({ lines: ["Tell me more."] });
  const removeThinking = vi.fn();
  const registryData = new Map<string, unknown>();
  const scene = {
    dialogue,
    dialogueService: { getDialogue },
    dayNight: { totalGameTimeMs: 10_000, dayCount: 1, currentPhase: "dawn" },
    chapters: { chapter: 2 },
    stats: { hunger: 70, thirst: 70, energy: 90 },
    trust: { global: 20, getCatTrust: vi.fn(() => 20), returnConversation: vi.fn() },
    knownCats: new Set(["Blacky", "Tiger"]),
    player: { x: 0, y: 0, faceToward: vi.fn() },
    time: { now: 10_000, delayedCall: vi.fn(() => ({ remove: removeThinking })) },
    emotes: { show: vi.fn() },
    hasLineOfSight: vi.fn(() => true),
    registry: {
      get: vi.fn((key: string) => registryData.get(key)),
      set: vi.fn((key: string, value: unknown) => registryData.set(key, value)),
    },
    curiosity: { takeRumour: vi.fn<() => string[] | null>().mockReturnValue(null) },
    syncTrustDisposition: vi.fn(),
    scene: { get: vi.fn(() => ({ showNarration: vi.fn() })) },
  };
  let controller = new CatDialogueController(scene as unknown as GameScene);
  const blacky = cat("Blacky");
  function advanceGame(ms: number, gameDay = scene.dayNight.dayCount) {
    scene.dayNight.totalGameTimeMs += ms;
    scene.dayNight.dayCount = gameDay;
    scene.time.now += ms;
  }
  function observe(distance: number) {
    scene.player.x = distance;
    controller.refreshLastPartner(blacky, distance, scene.time.now);
  }
  function close() {
    dialogue.isActive = false;
    completion?.();
    completion = undefined;
    controller.tickEngagement();
  }
  function reload() {
    controller.shutdown();
    const variables = JSON.parse(JSON.stringify(Object.fromEntries(registryData))) as Record<string, unknown>;
    registryData.clear();
    for (const [key, value] of Object.entries(variables)) registryData.set(key, value);
    controller = new CatDialogueController(scene as unknown as GameScene);
  }
  async function speak(speaker = blacky): Promise<DialogueRequest> {
    const previousDisplays = dialogue.show.mock.calls.length;
    const requestIndex = getDialogue.mock.calls.length;
    controller.show(speaker);
    await vi.waitFor(() => expect(dialogue.show).toHaveBeenCalledTimes(previousDisplays + 1));
    const request = getDialogue.mock.calls[requestIndex]?.[0];
    if (!request) throw new Error("Expected an AI dialogue request");
    close();
    return request;
  }
  return { get controller() { return controller; }, blacky, scene, history, registryData, getDialogue, removeThinking, advanceGame, observe, close, reload, speak };
}

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("CatDialogueController — encounter continuity", () => {
  it("keeps deliberate repeated speech available and preserves scripted trust awards", async () => {
    const f = fixture();
    f.getDialogue.mockResolvedValue({ lines: ["Tell me more."], event: "blacky_return" });
    for (let i = 0; i < 5; i++) {
      f.advanceGame(2_000);
      f.observe(0);
      expect(f.controller.isSkippedPartner(f.blacky)).toBe(false);
      expect((await f.speak()).conversationRecency).toEqual({ cadence: "continuing_conversation" });
    }
    expect(f.getDialogue).toHaveBeenCalledTimes(5);
    expect(f.scene.trust.returnConversation).toHaveBeenCalledTimes(5);
    expect(storeConversation).toHaveBeenCalledTimes(5);
  });

  it("allows a return acknowledgement only on the first displayed exchange of each meaningful visit", async () => {
    const f = fixture();
    for (let visit = 0; visit < 2; visit++) {
      f.observe(GP.DIALOGUE_BREAK_DIST + 1);
      f.advanceGame(RECENT_DIALOGUE_WINDOW_MS + 1);
      f.observe(0);
      expect((await f.speak()).conversationRecency).toEqual({ cadence: "same_day_return" });
      f.advanceGame(2_000);
      f.observe(0);
      expect((await f.speak()).conversationRecency).toEqual({ cadence: "continuing_conversation" });
    }
  });

  it("does not create a new visit merely by leaving the smaller interaction radius", async () => {
    const f = fixture();
    f.observe((GP.INTERACTION_DIST + GP.DIALOGUE_BREAK_DIST) / 2);
    f.advanceGame(RECENT_DIALOGUE_WINDOW_MS + 1);
    f.observe(0);
    expect((await f.speak()).conversationRecency).toEqual({ cadence: "continuing_conversation" });
  });

  it("keeps presence independent for each NPC", async () => {
    const f = fixture();
    const tiger = cat("Tiger", 10);
    f.observe(GP.DIALOGUE_BREAK_DIST + 1);
    f.controller.refreshLastPartner(tiger, GP.DIALOGUE_BREAK_DIST - 9, f.scene.time.now);
    f.advanceGame(RECENT_DIALOGUE_WINDOW_MS + 1);
    f.observe(0);
    expect((await f.speak()).conversationRecency).toEqual({ cadence: "same_day_return" });
    expect((await f.speak(tiger)).conversationRecency).toEqual({ cadence: "continuing_conversation" });
  });

  it("does not count days spent beside a cat as absence before a brief departure", async () => {
    const f = fixture();
    f.advanceGame(2_600_000, 4);
    f.observe(0);
    f.observe(GP.DIALOGUE_BREAK_DIST + 1);
    f.advanceGame(1_000);
    f.observe(0);
    expect((await f.speak()).conversationRecency).toEqual({ cadence: "recent_return" });
  });

  it("stops counting absence at reunion instead of when the player finally talks", async () => {
    const f = fixture();
    f.observe(GP.DIALOGUE_BREAK_DIST + 1);
    f.advanceGame(1_000);
    f.observe(0);
    f.advanceGame(2_600_000, 4);
    f.observe(0);
    expect((await f.speak()).conversationRecency).toEqual({ cadence: "recent_return" });
  });

  it("recognises a long absence using game days despite an unrelated device time", async () => {
    const f = fixture();
    vi.spyOn(Date, "now").mockReturnValue(5_000);
    f.observe(GP.DIALOGUE_BREAK_DIST + 1);
    f.advanceGame(2_600_000, 4);
    f.observe(0);
    const request = await f.speak();
    expect(request.conversationRecency).toEqual({ cadence: "long_absence" });
    expect(request.gameState.recentEvents).toEqual([]);
    expect(request).not.toHaveProperty("gameDaysSinceLastTalk");
  });

  it("does not invent an absence after a pause or reset when the device clock jumps", async () => {
    const f = fixture();
    await f.speak();
    f.controller.resetTransient();
    vi.spyOn(Date, "now").mockReturnValue(50_000_000);
    f.observe(0);
    expect((await f.speak()).conversationRecency).toEqual({ cadence: "continuing_conversation" });
  });

  it("preserves an in-game absence through reload without counting offline wall-clock time", async () => {
    const f = fixture();
    f.observe(GP.DIALOGUE_BREAK_DIST + 1);
    f.advanceGame(2_600_000, 4);
    f.reload();
    vi.spyOn(Date, "now").mockReturnValue(500_000_000);
    f.observe(0);
    expect((await f.speak(cat("Blacky"))).conversationRecency).toEqual({ cadence: "long_absence" });
    f.reload();
    expect((await f.speak(cat("Blacky"))).conversationRecency).toEqual({ cadence: "continuing_conversation" });
  });

  it("preserves a brief reunion through reload even when the player waits days before talking", async () => {
    const f = fixture();
    f.observe(GP.DIALOGUE_BREAK_DIST + 1);
    f.advanceGame(1_000);
    f.observe(0);
    f.reload();
    f.advanceGame(2_600_000, 4);
    f.observe(0);
    expect((await f.speak()).conversationRecency).toEqual({ cadence: "recent_return" });
  });

  it.each([null, [], { Blacky: { departedAt: { timestamp: "yesterday", gameDay: 1 } } },
    { Blacky: { departedAt: { timestamp: 900_000, gameDay: 2 } } }])("ignores malformed or future encounter save data", async (saved) => {
    const f = fixture();
    f.registryData.set(StoryKeys.CAT_DIALOGUE_SEPARATIONS, saved);
    f.reload();
    f.observe(0);
    expect((await f.speak()).conversationRecency).toEqual({ cadence: "continuing_conversation" });
  });

  it("does not consume the return opportunity if the response is discarded before display", async () => {
    const f = fixture();
    f.observe(GP.DIALOGUE_BREAK_DIST + 1);
    f.advanceGame(RECENT_DIALOGUE_WINDOW_MS + 1);
    f.observe(0);
    f.scene.hasLineOfSight.mockReturnValue(false);
    f.controller.show(f.blacky);
    await vi.waitFor(() => expect(f.removeThinking).toHaveBeenCalledTimes(1));
    expect(f.scene.dialogue.show).not.toHaveBeenCalled();
    f.scene.hasLineOfSight.mockReturnValue(true);
    expect((await f.speak()).conversationRecency).toEqual({ cadence: "same_day_return" });
  });

  it("counts a scripted rumour as the first exchange of a visit", async () => {
    const f = fixture();
    f.observe(GP.DIALOGUE_BREAK_DIST + 1);
    f.advanceGame(RECENT_DIALOGUE_WINDOW_MS + 1);
    f.observe(0);
    f.scene.curiosity.takeRumour.mockReturnValueOnce(["Look under the bench."]);
    f.controller.show(f.blacky);
    f.close();
    expect((await f.speak()).conversationRecency).toEqual({ cadence: "continuing_conversation" });
  });

  it("filters future conversation rows against the request snapshot before building prompt history", async () => {
    const f = fixture();
    f.history.push({ ...f.history[0]!, timestamp: 90_000, gameDay: 2, lines: ["Future exchange."] });
    vi.mocked(getRecentConversations).mockImplementationOnce(async () => {
      f.advanceGame(100_000, 2); // IndexedDB lookup crosses a day after the request snapshot.
      return f.history.filter((entry) => entry.speaker === "Blacky");
    });
    const request = await f.speak();
    expect(request.gameState.daysSurvived).toBe(1);
    expect(request.conversationHistory).toHaveLength(2);
    expect(request.promptConversationHistory).toHaveLength(1);
    expect(request.promptConversationHistory?.some((entry) => entry.text === "Future exchange.")).toBe(false);
  });

  it.each([["Blacky", "blacky_return"], ["Tiger", "tiger_warmup"]])("preserves %s's scripted branch when all history is ahead of a restored save", async (speaker, event) => {
    const f = fixture();
    const previous = f.history.find((entry) => entry.speaker === speaker);
    if (!previous) throw new Error("Missing fixture history");
    f.history.splice(0, f.history.length, { ...previous, timestamp: 900_000, gameDay: 2 });
    const request = await f.speak(speaker === "Blacky" ? f.blacky : cat(speaker));
    expect(request.isFirstConversation).toBe(false);
    expect(request.promptConversationHistory).toEqual([]);
    expect(request.conversationRecency).toBeUndefined();
    expect(matchScriptedResponse(request)?.event).toBe(event);
  });
});
