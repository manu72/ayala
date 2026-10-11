import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: { Math: { Distance: { Between: (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by) } } },
}));
vi.mock("../../src/services/ConversationStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/services/ConversationStore")>()),
  getRecentConversations: vi.fn(), getNpcMemories: vi.fn(), storeConversation: vi.fn(), addNpcMemory: vi.fn(),
}));

import { CatDialogueController } from "../../src/systems/CatDialogueController";
import { GP } from "../../src/config/gameplayConstants";
import { StoryKeys } from "../../src/registry/storyKeys";
import { RECENT_DIALOGUE_WINDOW_MS } from "../../src/utils/dialogueRecency";
import { matchScriptedResponse } from "../../src/services/AIDialogueService";
import { FallbackDialogueService } from "../../src/services/FallbackDialogueService";
import { ScriptedDialogueService } from "../../src/services/DialogueService";
import { NPC_DIALOGUE_SCRIPTS } from "../../src/data/npc-dialogue";
import { getRecentConversations, getNpcMemories, storeConversation, addNpcMemory, type ConversationRecord, type NpcMemory } from "../../src/services/ConversationStore";
import type { DialogueRequest, DialogueResponse } from "../../src/services/DialogueService";
import type { DialogueHooks } from "../../src/systems/DialogueSystem";
import type { GameScene } from "../../src/scenes/GameScene";
import type { NPCCat } from "../../src/sprites/NPCCat";

function cat(name: string, x = 0): NPCCat {
  return { npcName: name, x, y: 0, active: true, state: "idle", engageDialogue: vi.fn(), disengageDialogue: vi.fn() } as unknown as NPCCat;
}

/** DialogueSystem's contract: onHide on every hide; onComplete past the last line, or on an early close with completeOnClose. */
function fakeDialogue() {
  let open: { lines: string[]; line: number; onComplete?: () => void; hooks?: DialogueHooks } | null = null;
  const hide = () => {
    const hooks = open?.hooks;
    open = null;
    dialogue.isActive = false;
    hooks?.onHide?.();
  };
  const dialogue = {
    isActive: false,
    show: vi.fn((lines: string[], onComplete?: () => void, hooks?: DialogueHooks) => {
      if (dialogue.isActive) return;
      open = { lines, line: 0, onComplete, hooks };
      dialogue.isActive = true;
      hooks?.onLineShown?.(0);
    }),
    advance() {
      const current = open;
      if (!current) return;
      current.line++;
      if (current.line < current.lines.length) return current.hooks?.onLineShown?.(current.line);
      hide();
      current.onComplete?.();
    },
    /** Click outside the box / the x. */
    closeEarly() {
      const done = open?.hooks?.completeOnClose ? open.onComplete : undefined;
      if (open) hide();
      done?.();
    },
    dismiss: vi.fn(() => { if (open) hide(); }),
  };
  return dialogue;
}

function fixture() {
  const history: ConversationRecord[] = ["Blacky", "Tiger"].map((speaker) => ({
    speaker, timestamp: 1_000, realTimestamp: 5_000, gameDay: 1,
    lines: ["There is shade here."], trustBefore: 20, trustAfter: 20, chapter: 2,
  }));
  vi.mocked(getRecentConversations).mockImplementation(async (name, limit) => history.filter((r) => r.speaker === name).slice(-(limit ?? 20)));
  vi.mocked(getNpcMemories).mockResolvedValue([]);
  vi.mocked(storeConversation).mockImplementation(async (record) => { history.push(record); });
  vi.mocked(addNpcMemory).mockResolvedValue(undefined);

  const dialogue = fakeDialogue();
  const getDialogue = vi.fn<(request: DialogueRequest) => Promise<DialogueResponse>>().mockResolvedValue({ lines: ["Tell me more."] });
  const removeThinking = vi.fn();
  const registryData = new Map<string, unknown>();
  const scene = {
    dialogue,
    dialogueService: { getDialogue },
    dayNight: { totalGameTimeMs: 10_000, dayCount: 1, currentPhase: "dawn" },
    chapters: { chapter: 2 },
    stats: { hunger: 70, thirst: 70, energy: 90 },
    trust: { global: 20, getCatTrust: vi.fn(() => 20), returnConversation: vi.fn(), firstConversation: vi.fn() },
    knownCats: new Set(["Blacky", "Tiger"]),
    player: { x: 0, y: 0, faceToward: vi.fn() },
    playerInputFrozen: false,
    time: { now: 10_000, delayedCall: vi.fn(() => ({ remove: removeThinking })) },
    emotes: { show: vi.fn() },
    audio: { playCatGrowl: vi.fn() },
    narrateIfPerceivable: vi.fn(),
    hasLineOfSight: vi.fn(() => true),
    registry: {
      get: vi.fn((key: string) => registryData.get(key)),
      set: vi.fn((key: string, value: unknown) => registryData.set(key, value)),
    },
    curiosity: { rumour: vi.fn<() => { lines: string[]; heard: () => void } | null>().mockReturnValue(null) },
    npcs: [],
    addKnownCat: vi.fn(),
    autoSave: vi.fn(),
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
  /** Read the open dialogue through to the end. */
  function close() {
    while (dialogue.isActive) dialogue.advance();
    controller.tickEngagement();
  }
  function reload() {
    controller.shutdown();
    const variables = JSON.parse(JSON.stringify(Object.fromEntries(registryData))) as Record<string, unknown>;
    registryData.clear();
    for (const [key, value] of Object.entries(variables)) registryData.set(key, value);
    controller = new CatDialogueController(scene as unknown as GameScene);
  }
  /** Space on the cat; the reply is on screen when this resolves. */
  async function open(speaker = blacky): Promise<DialogueRequest> {
    const previousDisplays = dialogue.show.mock.calls.length;
    const requestIndex = getDialogue.mock.calls.length;
    controller.show(speaker);
    await vi.waitFor(() => expect(dialogue.show).toHaveBeenCalledTimes(previousDisplays + 1));
    const request = getDialogue.mock.calls[requestIndex]?.[0];
    if (!request) throw new Error("Expected an AI dialogue request");
    return request;
  }
  async function speak(speaker = blacky): Promise<DialogueRequest> {
    const request = await open(speaker);
    close();
    return request;
  }
  return { get controller() { return controller; }, blacky, scene, history, registryData, getDialogue, removeThinking, advanceGame, observe, close, reload, open, speak };
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
    f.scene.curiosity.rumour.mockReturnValueOnce({ lines: ["Look under the bench."], heard: vi.fn() });
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

describe("CatDialogueController — what a cat remembers", () => {
  const blackyReturn = NPC_DIALOGUE_SCRIPTS.Blacky?.find((s) => s.id === "blacky_return")?.response.lines.join(" ");

  it("never replays a used-up return line, however many talks follow (talk 13)", async () => {
    const f = fixture();
    f.history.splice(0);
    const ai = vi.fn(async (request: DialogueRequest): Promise<DialogueResponse> => ({
      lines: [`New thought ${ai.mock.calls.length}.`],
      event: matchScriptedResponse(request)?.event,
    }));
    const service = new FallbackDialogueService({ getDialogue: ai }, new ScriptedDialogueService(NPC_DIALOGUE_SCRIPTS));
    f.getDialogue.mockImplementation((request) => service.getDialogue(request));
    for (let talk = 0; talk < 13; talk++) await f.speak();
    const shown = f.scene.dialogue.show.mock.calls.map(([lines]) => lines.join(" "));
    expect(shown.filter((text) => text === blackyReturn)).toHaveLength(1);
    expect(ai).toHaveBeenCalledTimes(11); // talks 3-13; talks 1-2 are blacky_first and blacky_return
  });

  it("stores a rumour as a story record that the cat's scripts don't count as a talk", async () => {
    const f = fixture();
    const tiger = cat("Tiger");
    const heard = vi.fn();
    f.scene.curiosity.rumour.mockReturnValueOnce({ lines: ["There's a tabby in the empty shop."], heard });
    f.controller.show(tiger);
    f.close();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(storeConversation).toHaveBeenCalledWith(expect.objectContaining({
      speaker: "Tiger", kind: "story", lines: ["There's a tabby in the empty shop."], mammaCatTurn: "Mamma Cat came over and listened.",
    }));

    const request = await f.speak(tiger);
    expect(request.conversationHistory).toHaveLength(1);
    expect(request.promptConversationHistory?.map((entry) => entry.text)).toEqual(["There is shade here.", "There's a tabby in the empty shop."]);
    expect(matchScriptedResponse(request)?.event).toBe("tiger_warmup");
  });

  it("leaves a rumour closed before its last line untold: not marked heard, not stored", () => {
    const f = fixture();
    const heard = vi.fn();
    f.scene.curiosity.rumour.mockReturnValueOnce({ lines: ["One.", "Two."], heard });
    f.controller.show(f.blacky);
    f.scene.dialogue.closeEarly();
    expect(heard).not.toHaveBeenCalled();
    expect(storeConversation).not.toHaveBeenCalled();
    expect(f.blacky.disengageDialogue).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["closes the box", (f: ReturnType<typeof fixture>) => f.scene.dialogue.closeEarly()],
    ["walks away", (f: ReturnType<typeof fixture>) => {
      f.scene.player.x = GP.DIALOGUE_BREAK_DIST + 1;
      f.controller.tickEngagement();
    }],
  ])("finishes an exchange whose last line was read when the player %s", async (_how, leave) => {
    const f = fixture();
    f.getDialogue.mockResolvedValue({ lines: ["One.", "Two."], event: "blacky_return" });
    await f.open();
    f.scene.dialogue.advance();
    leave(f);
    expect(f.scene.dialogue.isActive).toBe(false);
    expect(f.scene.trust.returnConversation).toHaveBeenCalledTimes(1);
    expect(storeConversation).toHaveBeenCalledWith(expect.objectContaining({ speaker: "Blacky", kind: "talk", lines: ["One.", "Two."] }));
    expect(f.controller.isSkippedPartner(f.blacky)).toBe(true);
  });

  it.each([
    ["closes the box", (f: ReturnType<typeof fixture>) => f.scene.dialogue.closeEarly()],
    ["walks away", (f: ReturnType<typeof fixture>) => {
      f.scene.player.x = GP.DIALOGUE_BREAK_DIST + 1;
      f.controller.tickEngagement();
    }],
    ["is interrupted by a story cut-in", (f: ReturnType<typeof fixture>) => f.scene.dialogue.dismiss()],
  ])("leaves no trace when the player %s before the last line", async (_how, leave) => {
    const f = fixture();
    f.getDialogue.mockResolvedValue({ lines: ["One.", "Two."], event: "blacky_return" });
    await f.open();
    leave(f);
    expect(f.blacky.disengageDialogue).toHaveBeenCalledTimes(1);
    expect(f.scene.trust.returnConversation).not.toHaveBeenCalled();
    expect(storeConversation).not.toHaveBeenCalled();
  });

  it("does not finish an exchange when the scene tears its dialogue down", async () => {
    const f = fixture();
    f.getDialogue.mockResolvedValue({ lines: ["Only line."], event: "blacky_return" });
    await f.open();
    f.scene.dialogue.dismiss();
    f.controller.shutdown();
    expect(f.scene.trust.returnConversation).not.toHaveBeenCalled();
    expect(storeConversation).not.toHaveBeenCalled();
  });

  it("applies a placeholder's scripted event and trust but doesn't store it as speech", async () => {
    const f = fixture();
    f.getDialogue.mockResolvedValue({ lines: ["*Blacky blinks slowly at you.*"], event: "blacky_return", placeholder: true });
    await f.speak();
    expect(f.scene.trust.returnConversation).toHaveBeenCalledTimes(1);
    expect(storeConversation).not.toHaveBeenCalled();
  });

  it("stores a talk with Mamma Cat's side in words, and remembers only milestones", async () => {
    const f = fixture();
    f.history.splice(0);
    f.scene.stats.hunger = 20;
    f.getDialogue.mockResolvedValueOnce({ lines: ["New here?"], event: "blacky_first" }).mockResolvedValueOnce({ lines: ["Still here."], event: "blacky_return" });
    await f.speak();
    await f.speak();
    expect(vi.mocked(storeConversation).mock.calls.map(([record]) => [record.kind, record.mammaCatTurn])).toEqual([
      ["talk", "Mamma Cat came over to talk. She was very hungry."],
      ["talk", "Mamma Cat came over to talk. She was very hungry."],
    ]);
    expect(vi.mocked(addNpcMemory).mock.calls).toEqual([
      ["Blacky", { kind: "event", source: "scripted", gameDay: 1, timestamp: 10_000, label: "first_meeting", value: "You first met Mamma Cat on day 1, at dawn." }],
    ]);
  });

  it("builds prompt history from every row at the restored time, not just the newest ten", async () => {
    const f = fixture();
    const row = (timestamp: number, gameDay: number, text: string): ConversationRecord => ({
      speaker: "Blacky", timestamp, gameDay, lines: [text], trustBefore: 20, trustAfter: 20, chapter: 2,
    });
    f.history.splice(0, f.history.length,
      ...[1, 2, 3, 4, 5].map((n) => row(n * 1_000, 1, `Past ${n}.`)),
      ...Array.from({ length: 12 }, (_, n) => row(900_000 + n, 2, `Abandoned ${n}.`)),
    );
    const request = await f.speak();
    expect(request.conversationHistory).toHaveLength(17);
    expect(request.promptConversationHistory?.map((entry) => entry.text)).toEqual(["Past 1.", "Past 2.", "Past 3.", "Past 4.", "Past 5."]);
  });

  it("passes only memories formed by the current game day, without legacy daily filler", async () => {
    const f = fixture();
    const memory = (gameDay: number, label: string, source: NpcMemory["source"]): NpcMemory => ({
      npc: "Blacky", kind: "event", label, value: label, dedupeKey: label, source, createdAt: 0, gameDay,
    });
    vi.mocked(getNpcMemories).mockResolvedValue([
      memory(1, "first_meeting", "scripted"), memory(1, "blacky_return", "scripted"), memory(3, "from_a_later_day", "ai"),
    ]);
    const request = await f.speak();
    expect(request.npcMemories?.map((m) => m.label)).toEqual(["first_meeting"]);
  });

  it("tells a cat the story so far: Fluffy hears about Manu's visit, every cat about Camille", async () => {
    const f = fixture();
    f.registryData.set(StoryKeys.CAMILLE_ENCOUNTER, 1);
    f.registryData.set(StoryKeys.MANU_VISITED_FLUFFY_DAY, 1);
    const request = await f.speak(cat("Fluffy"));
    expect(request.interaction).toBe("talk");
    expect(request.gameState.recentEvents).toEqual([
      "Mamma Cat has met Camille, the quiet woman who walks the evening rounds.",
      "Manu came by to see you today.",
    ]);
  });

  it("drops a reply that lands after a story moment froze input", async () => {
    const f = fixture();
    let reply: (response: DialogueResponse) => void = () => {};
    f.getDialogue.mockReturnValue(new Promise((resolve) => { reply = resolve; }));
    f.controller.show(f.blacky);
    await vi.waitFor(() => expect(f.getDialogue).toHaveBeenCalledTimes(1));
    f.scene.playerInputFrozen = true;
    reply({ lines: ["Too late."] });
    await vi.waitFor(() => expect(f.removeThinking).toHaveBeenCalledTimes(1));
    expect(f.scene.dialogue.show).not.toHaveBeenCalled();
    expect(f.blacky.engageDialogue).not.toHaveBeenCalled();
  });

  it("releases the cat with her own modal, so walking off never closes another system's dialogue", async () => {
    const f = fixture();
    await f.open();
    f.scene.dialogue.closeEarly();
    f.scene.dialogue.show(["Camille crouches."]);
    f.scene.player.x = GP.DIALOGUE_BREAK_DIST + 1;
    f.controller.tickEngagement();
    expect(f.scene.dialogue.isActive).toBe(true);
    expect(f.scene.dialogue.dismiss).not.toHaveBeenCalled();
    expect(f.blacky.disengageDialogue).toHaveBeenCalledTimes(1);
  });
});
