import { describe, it, expect, vi } from "vitest";
import {
  AIDialogueService,
  AIParseError,
  buildMessages,
  buildSystemPrompt,
  matchScriptedResponse,
  parseAIJson,
} from "../../src/services/AIDialogueService";
import { FallbackDialogueService } from "../../src/services/FallbackDialogueService";
import { ScriptedDialogueService, type DialogueRequest } from "../../src/services/DialogueService";

const baseReq = (): DialogueRequest => ({
  speaker: "Blacky",
  speakerType: "cat",
  target: "Mamma Cat",
  gameState: {
    chapter: 2,
    timeOfDay: "day",
    trustGlobal: 10,
    trustWithSpeaker: 5,
    hunger: 40,
    thirst: 40,
    energy: 70,
    daysSurvived: 3,
    knownCats: ["Tiger"],
    recentEvents: [],
  },
  conversationHistory: [],
});

describe("parseAIJson", () => {
  it("parses minimal valid JSON", () => {
    const p = parseAIJson(`{"lines":["Hello there."],"speakerPose":"friendly","emote":"heart"}`);
    expect(p.lines).toEqual(["Hello there."]);
    expect(p.speakerPose).toBe("friendly");
    expect(p.emote).toBe("heart");
  });

  it("strips markdown fences", () => {
    const p = parseAIJson("```json\n{\"lines\":[\"Hi\"]}\n```");
    expect(p.lines).toEqual(["Hi"]);
  });

  it("rejects empty lines array", () => {
    expect(() => parseAIJson('{"lines":[]}')).toThrow(AIParseError);
  });

  it("rejects more than 3 lines", () => {
    expect(() =>
      parseAIJson('{"lines":["a","b","c","d"],"speakerPose":"friendly"}'),
    ).toThrow(AIParseError);
  });

  it("ignores invalid emote strings", () => {
    const p = parseAIJson('{"lines":["x"],"emote":"not_a_real_emote"}');
    expect(p.emote).toBeUndefined();
  });

  it("clamps unknown speakerPose to undefined", () => {
    const p = parseAIJson('{"lines":["x"],"speakerPose":"dancing"}');
    expect(p.speakerPose).toBeUndefined();
  });

  it("accepts safe optional mammaCatCue and memoryNote fields", () => {
    const p = parseAIJson(JSON.stringify({
      lines: ["You came back."],
      mammaCatCue: "Mamma Cat sits close but keeps her tail low.",
      memoryNote: {
        kind: "event",
        label: "returned",
        value: "Mamma Cat returned calmly after their first meeting.",
      },
    }));
    expect(p.mammaCatCue).toBe("Mamma Cat sits close but keeps her tail low.");
    expect(p.memoryNote).toEqual({
      kind: "event",
      label: "returned",
      value: "Mamma Cat returned calmly after their first meeting.",
    });
  });

  it("drops malformed optional fields without rejecting the dialogue", () => {
    const p = parseAIJson(JSON.stringify({
      lines: ["Still here."],
      mammaCatCue: "",
      memoryNote: {
        kind: "event",
        label: "x".repeat(80),
        value: "Unsafe\u0000memory",
      },
    }));
    expect(p.lines).toEqual(["Still here."]);
    expect(p.mammaCatCue).toBeUndefined();
    expect(p.memoryNote).toBeUndefined();
  });
});

describe("buildSystemPrompt", () => {
  it("includes sectioned persona, scene facts, and human-like guidance for cats", () => {
    const req = baseReq();
    req.relationshipStage = 2;
    req.gameDaysSinceLastTalk = 3;
    req.gameState.recentEvents = ["Shared shade near the fountain."];
    const p = buildSystemPrompt("# Blacky\nCat.", req);
    expect(p).toContain("Blacky");
    expect(p).toContain("Chapter: 2");
    expect(p).toContain("Tiger");
    expect(p).toContain("Speaker species: cat");
    expect(p).toContain("## Your Persona");
    expect(p).toContain("## Relationship Context");
    expect(p).toContain("human-like English");
    expect(p).not.toContain("Cats use short cat-speak");
    expect(p).toContain("Days since last talk: 3");
    expect(p).toContain("Shared shade near the fountain.");
  });

  it("uses unified plain-speech guidance and example for humans", () => {
    const req = baseReq();
    req.speaker = "Camille";
    req.speakerType = "human";
    const p = buildSystemPrompt("# Camille\nHuman.", req);
    expect(p).toContain("Speaker species: human");
    expect(p).toContain("speak in natural, human-like English");
    expect(p).not.toContain('"Meow to you mamma cat');
    expect(p).toContain('"mammaCatCue"');
    expect(p).toContain('"memoryNote"');
  });

  it("does not emit returning-context instructions for an inferred human first conversation", () => {
    const req = baseReq();
    req.speaker = "Camille";
    req.speakerType = "human";
    req.gameState.trustWithSpeaker = 0;
    req.conversationHistory = [];

    const p = buildSystemPrompt("# Camille\nHuman.", req);

    expect(p).toContain("RELATIONSHIP STAGE 1");
    expect(p).toContain("FIRST CONVERSATION");
    expect(p).not.toContain("This is not the first conversation");
  });

  it("includes nearbyCat context when provided", () => {
    const req = baseReq();
    req.speaker = "Rose";
    req.speakerType = "human";
    req.nearbyCat = "Tiger";
    const p = buildSystemPrompt("# Rose\n", req);
    expect(p).toContain("Cat currently near you: Tiger");
  });

  it("includes encounterBeat context when provided", () => {
    const req = baseReq();
    req.speaker = "Camille";
    req.speakerType = "human";
    req.encounterBeat = {
      kind: "camille_encounter",
      n: 3,
      objective: "Slow blink trust exchange.",
    };
    const p = buildSystemPrompt("# Camille\n", req);
    expect(p).toContain("Encounter 3 of 5");
    expect(p).toContain("Slow blink trust exchange.");
  });

  it("includes rapid same-NPC recency as deliberate continuity context", () => {
    const req = baseReq();
    req.speaker = "Jayco Jr";
    req.isFirstConversation = false;
    req.conversationRecency = {
      cadence: "immediate_followup",
      lastTalkElapsedSeconds: 12,
      sameNpcTalksInRecentWindow: 3,
      recentWindowSeconds: 60,
    };

    const p = buildSystemPrompt("# Jayco Jr\nPlayful.", req);

    expect(p).toContain("## Conversation Timing");
    expect(p).toContain("You spoke with Mamma Cat about 12 seconds ago.");
    expect(p).toContain("Mamma Cat has engaged this same NPC 3 times in the last 60 seconds.");
    expect(p).toContain("Treat rapid repeated engagement as deliberate continuity, not as a mistake or a new scene.");
  });

  it("includes first-conversation and memory context without inventing history", () => {
    const req = baseReq();
    req.isFirstConversation = true;
    req.relationshipStage = 1;
    req.npcMemories = [
      {
        npc: "Blacky",
        kind: "event",
        label: "first_meeting",
        value: "Met Mamma Cat on day 1 at dusk.",
        dedupeKey: '["Blacky","event","first_meeting","met mamma cat on day 1 at dusk."]',
        source: "scripted",
        createdAt: 1,
        gameDay: 1,
      },
      {
        npc: "Blacky",
        kind: "preference",
        label: "distance",
        value: "Mamma Cat responds better when Blacky gives her space.",
        dedupeKey: '["Blacky","preference","distance","mamma cat responds better when blacky gives her space."]',
        source: "ai",
        createdAt: 2,
        gameDay: 2,
      },
    ];

    const p = buildSystemPrompt("# Blacky\nCat.", req);
    expect(p).toContain("FIRST CONVERSATION");
    expect(p).toContain("do not reference shared history");
    expect(p).toContain("[Event]");
    expect(p).toContain("Met Mamma Cat on day 1 at dusk.");
    expect(p).toContain("[Preference]");
    expect(p).toContain("Only reference memories listed here");
  });
});

describe("buildMessages", () => {
  it("includes history and final user turn", () => {
    const req = baseReq();
    req.conversationHistory = [{ timestamp: 1, speaker: "Blacky", text: "Earlier." }];
    const m = buildMessages(req);
    expect(m.some((x) => x.role === "assistant" && x.content === "Earlier.")).toBe(true);
    expect(m[m.length - 1]!.role).toBe("user");
  });

  it("caps history at 20 chat messages and renders persisted Mamma Cat turns", () => {
    const req = baseReq();
    req.speaker = "Blacky";
    req.conversationHistory = Array.from({ length: 12 }, (_, i) => ({
      timestamp: i,
      speaker: "Blacky",
      mammaCatTurn: `Mamma turn ${i}`,
      text: `line ${i}`,
    }));
    const m = buildMessages(req);
    // 10 exchange pairs * 2 messages, plus the final current-scene user turn.
    expect(m.length).toBe(21);
    const historyMessages = m.slice(0, -1);
    expect(historyMessages[0]).toEqual({ role: "user", content: "Mamma turn 2" });
    expect(historyMessages[1]).toEqual({ role: "assistant", content: "line 2" });
    const assistants = m.filter((x) => x.role === "assistant");
    expect(assistants[assistants.length - 1]!.content).toBe("line 11");
  });

  it("uses deterministic Mamma Cat fallback turns for legacy history", () => {
    const req = baseReq();
    req.speaker = "Kish";
    req.speakerType = "human";
    req.conversationHistory = [{
      timestamp: 1,
      speaker: "Kish",
      text: "Earlier line.",
    }];
    const m = buildMessages(req);
    expect(m[0]).toMatchObject({
      role: "user",
      content: expect.stringContaining("Mamma Cat approaches"),
    });
    expect(m[1]).toEqual({ role: "assistant", content: "Earlier line." });
    expect(m[m.length - 1]!.content).toContain("Respond in JSON");
  });

  it("marks the current Mamma Cat turn as a rapid deliberate follow-up", () => {
    const req = baseReq();
    req.speaker = "Jayco Jr";
    req.isFirstConversation = false;
    req.conversationRecency = {
      cadence: "immediate_followup",
      lastTalkElapsedSeconds: 12,
      sameNpcTalksInRecentWindow: 2,
      recentWindowSeconds: 60,
    };

    const m = buildMessages(req);

    expect(m[m.length - 1]!.content).toContain("This is a deliberate follow-up");
    expect(m[m.length - 1]!.content).toContain("about 12 seconds after their previous exchange");
  });
});

describe("matchScriptedResponse", () => {
  it("returns scripted event for first Blacky meeting", () => {
    const req = baseReq();
    req.gameState.trustWithSpeaker = 0;
    req.conversationHistory = [];
    const r = matchScriptedResponse(req);
    expect(r?.event).toBe("blacky_first");
  });
});

describe("AIDialogueService.getDialogue", () => {
  it("returns merged response from proxy JSON + scripted event", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"lines":["Careful now."],"speakerPose":"curious","emote":"curious","mammaCatCue":"Mamma Cat steps closer.","memoryNote":{"kind":"event","label":"first_step","value":"Mamma Cat stepped closer calmly."},"event":"model_must_not_win","trustChange":99}' } }],
        }),
        { status: 200 },
      ),
    );
    const svc = new AIDialogueService({
      proxyUrl: "/api/ai/chat",
      personas: { Blacky: "# Blacky\n" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const req = baseReq();
    req.conversationHistory = [];
    req.gameState.trustWithSpeaker = 0;
    const out = await svc.getDialogue(req);
    expect(out.lines).toEqual(["Careful now."]);
    expect(out.event).toBe("blacky_first");
    expect(out.trustChange).toBe(10);
    expect(out.mammaCatCue).toBe("Mamma Cat steps closer.");
    expect(out.memoryNote).toEqual({
      kind: "event",
      label: "first_step",
      value: "Mamma Cat stepped closer calmly.",
    });
  });

  it("retries on 504 with secondary provider", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("timeout", { status: 504 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: '{"lines":["Retry ok"],"speakerPose":"friendly","emote":"heart"}' } },
            ],
          }),
          { status: 200 },
        ),
      );
    const svc = new AIDialogueService({
      proxyUrl: "/api/ai/chat",
      personas: { Blacky: "# x" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      primaryProvider: "deepseek",
      secondaryProvider: "openai",
    });
    const req = baseReq();
    req.conversationHistory = [];
    req.gameState.trustWithSpeaker = 0;
    await svc.getDialogue(req);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const bodies = fetchImpl.mock.calls.map((c) => JSON.parse(c[1]!.body as string));
    expect(bodies[0]!.provider).toBe("deepseek");
    expect(bodies[1]!.provider).toBe("openai");
  });

  // Regression: on GitHub Pages, a mis-set `VITE_AI_PROXY_URL` means the POST
  // never reaches the Worker and the static host serves its own 404 HTML page
  // instead. The generic `AI failed; using scripted fallback` log line hid the
  // true cause for weeks. `callLLMWithFallback` now emits a distinct warning
  // whenever the proxy responds with an HTML body so ops can spot the misroute
  // immediately. See README § AI Dialogue Proxy (hosting shapes A/B).
  it("logs a distinct warning when the proxy returns an HTML body (misrouted URL)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const htmlBody = "<!DOCTYPE html><html><head><title>404</title></head></html>";
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(htmlBody, {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      );
    const svc = new AIDialogueService({
      proxyUrl: "/api/ai/chat",
      personas: { Blacky: "# x" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(svc.getDialogue(baseReq())).rejects.toThrow(/AI proxy error 404/);
    const joined = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(joined).toMatch(/\[AIDialogueService\] Proxy returned HTML/);
    expect(joined).toMatch(/VITE_AI_PROXY_URL is likely misrouted/);
    warn.mockRestore();
  });

  // Regression: a pure network error (DNS, TLS, connection refused) on the
  // primary provider used to propagate straight past the secondary-provider
  // retry. The documented provider-failover contract should cover this too —
  // the secondary provider uses a different upstream host so it may well work.
  it("retries secondary provider when primary fetch rejects with a network error", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: '{"lines":["Retry ok"],"speakerPose":"friendly","emote":"heart"}' } },
            ],
          }),
          { status: 200 },
        ),
      );
    const svc = new AIDialogueService({
      proxyUrl: "/api/ai/chat",
      personas: { Blacky: "# x" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      primaryProvider: "deepseek",
      secondaryProvider: "openai",
    });
    const req = baseReq();
    req.conversationHistory = [];
    req.gameState.trustWithSpeaker = 0;
    const out = await svc.getDialogue(req);
    expect(out.lines).toEqual(["Retry ok"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const bodies = fetchImpl.mock.calls.map((c) => JSON.parse(c[1]!.body as string));
    expect(bodies[0]!.provider).toBe("deepseek");
    expect(bodies[1]!.provider).toBe("openai");
  });

  // External aborts are caller intent ("stop now"). We must NOT burn the
  // secondary provider on them — the caller either walked away from the NPC
  // or set a tight budget that's already elapsed.
  it("does not retry secondary when the external caller aborts the request", async () => {
    const fetchImpl = vi.fn().mockImplementation((_url, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });
    const svc = new AIDialogueService({
      proxyUrl: "/api/ai/chat",
      personas: { Blacky: "# x" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      primaryProvider: "deepseek",
      secondaryProvider: "openai",
    });
    const req = baseReq();
    req.conversationHistory = [];
    req.gameState.trustWithSpeaker = 0;
    const controller = new AbortController();
    const p = svc.getDialogue(req, { signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // Regression: a bad DEEPSEEK_API_KEY makes the proxy forward the upstream
  // 401 verbatim. The documented provider-retry contract (README "Provider
  // retry" step) requires that this failover to the secondary provider, not
  // collapse straight to scripted fallback.
  it("retries on 401 (bad primary API key) with secondary provider", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: '{"lines":["Retry ok"],"speakerPose":"friendly","emote":"heart"}' } },
            ],
          }),
          { status: 200 },
        ),
      );
    const svc = new AIDialogueService({
      proxyUrl: "/api/ai/chat",
      personas: { Blacky: "# x" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      primaryProvider: "deepseek",
      secondaryProvider: "openai",
    });
    const req = baseReq();
    req.conversationHistory = [];
    req.gameState.trustWithSpeaker = 0;
    const out = await svc.getDialogue(req);
    expect(out.lines).toEqual(["Retry ok"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const bodies = fetchImpl.mock.calls.map((c) => JSON.parse(c[1]!.body as string));
    expect(bodies[0]!.provider).toBe("deepseek");
    expect(bodies[1]!.provider).toBe("openai");
  });
});

describe("AIDialogueService human dialogue", () => {
  it("resolves human persona and includes encounterBeat in system prompt", async () => {
    let capturedBody: string | undefined;
    const fetchImpl = vi.fn().mockImplementation((_url, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"lines":["You came back."],"speakerPose":"friendly","emote":"heart"}' } }],
          }),
          { status: 200 },
        ),
      );
    });
    const svc = new AIDialogueService({
      proxyUrl: "/api/ai/chat",
      personas: { Camille: "# Camille\nHuman." },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const req = baseReq();
    req.speaker = "Camille";
    req.speakerType = "human";
    req.encounterBeat = {
      kind: "camille_encounter",
      n: 2,
      objective: "Second meeting — places treat, waits.",
    };
    const out = await svc.getDialogue(req);
    expect(out.lines).toEqual(["You came back."]);
    const parsed = JSON.parse(capturedBody!) as { messages: Array<{ role: string; content: string }> };
    const systemMessage = parsed.messages.find((m) => m.role === "system");
    expect(systemMessage?.content).toContain("Encounter 2 of 5");
    expect(systemMessage?.content).toContain("Speaker species: human");
  });

  it("aborts the request when the per-call timeout elapses", async () => {
    const fetchImpl = vi.fn().mockImplementation((_url, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });
    const svc = new AIDialogueService({
      proxyUrl: "/api/ai/chat",
      personas: { Rose: "# Rose\nHuman." },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const req = baseReq();
    req.speaker = "Rose";
    req.speakerType = "human";
    await expect(
      svc.getDialogue(req, { timeoutMs: 10 }),
    ).rejects.toThrow();
  });
});

describe("FallbackDialogueService", () => {
  it("returns unplayed scripted dialogue before calling AI", async () => {
    const primary = {
      getDialogue: vi.fn().mockResolvedValue({ lines: ["ai"] }),
    };
    const secondary = new ScriptedDialogueService({
      Blacky: [
        {
          id: "blacky_first",
          condition: (req) => req.conversationHistory.length === 0,
          response: { lines: ["Scripted first."], event: "blacky_first" },
        },
      ],
    });
    const fb = new FallbackDialogueService(primary, secondary);

    const out = await fb.getDialogue(baseReq());

    expect(out.lines).toEqual(["Scripted first."]);
    expect(primary.getDialogue).not.toHaveBeenCalled();
  });

  it("calls AI after the matching scripted dialogue has already rendered", async () => {
    const primary = {
      getDialogue: vi.fn().mockResolvedValue({ lines: ["ai"] }),
    };
    const secondary = new ScriptedDialogueService({
      Blacky: [
        {
          id: "blacky_return",
          condition: () => true,
          response: { lines: ["Scripted return."] },
        },
      ],
    });
    const fb = new FallbackDialogueService(primary, secondary);
    const req = baseReq();
    req.conversationHistory = [{ timestamp: 1, speaker: "Blacky", text: "Scripted return." }];

    const out = await fb.getDialogue(req);

    expect(out.lines).toEqual(["ai"]);
    expect(primary.getDialogue).toHaveBeenCalled();
  });

  it("does not let scripted-first dialogue intercept encounter beat AI", async () => {
    const primary = {
      getDialogue: vi.fn().mockResolvedValue({ lines: ["beat ai"] }),
    };
    const secondary = new ScriptedDialogueService({
      Camille: [
        {
          id: "camille_return",
          condition: () => true,
          response: { lines: ["Generic Camille return."] },
        },
      ],
    });
    const fb = new FallbackDialogueService(primary, secondary);
    const req = baseReq();
    req.speaker = "Camille";
    req.speakerType = "human";
    req.conversationHistory = [{ timestamp: 1, speaker: "Camille", text: "Earlier ambient line." }];
    req.encounterBeat = {
      kind: "camille_encounter",
      n: 2,
      objective: "Places a treat and waits without crowding Mamma Cat.",
    };

    const out = await fb.getDialogue(req);

    expect(out.lines).toEqual(["beat ai"]);
    expect(primary.getDialogue).toHaveBeenCalled();
  });

  it("rethrows encounter beat AI failures so GameScene can use authored beat fallback", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const primary = {
      getDialogue: vi.fn().mockRejectedValue(new Error("network")),
    };
    const secondary = new ScriptedDialogueService({
      Camille: [
        {
          id: "camille_return",
          condition: () => true,
          response: { lines: ["Generic Camille return."] },
        },
      ],
    });
    const fb = new FallbackDialogueService(primary, secondary);
    const req = baseReq();
    req.speaker = "Camille";
    req.speakerType = "human";
    req.conversationHistory = [{ timestamp: 1, speaker: "Camille", text: "Earlier ambient line." }];
    req.encounterBeat = {
      kind: "camille_encounter",
      n: 3,
      objective: "Slow blink trust exchange.",
    };

    await expect(fb.getDialogue(req)).rejects.toThrow("network");
    debug.mockRestore();
  });

  it("does not replay an exhausted script when AI fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const primary = {
      getDialogue: vi.fn().mockRejectedValue(new Error("network")),
    };
    const secondary = new ScriptedDialogueService({
      Blacky: [
        {
          id: "blacky_return",
          condition: () => true,
          response: { lines: ["Scripted return."] },
        },
      ],
    });
    const fb = new FallbackDialogueService(primary, secondary);
    const req = baseReq();
    req.conversationHistory = [{ timestamp: 1, speaker: "Blacky", text: "Scripted return." }];

    const out = await fb.getDialogue(req);

    expect(out.lines).toEqual(["*The cat regards you warily.*"]);
    warn.mockRestore();
  });

  it("uses secondary when primary throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const primary = {
      getDialogue: vi.fn().mockRejectedValue(new Error("network")),
    };
    const secondary = {
      getDialogue: vi.fn().mockResolvedValue({ lines: ["fallback"] }),
    };
    const fb = new FallbackDialogueService(primary, secondary);
    const out = await fb.getDialogue(baseReq());
    expect(out.lines).toEqual(["fallback"]);
    expect(secondary.getDialogue).toHaveBeenCalled();
    warn.mockRestore();
  });

  // A caller-owned AbortController is the caller's way of saying "stop; I no
  // longer want this response." Converting that signal into a scripted
  // secondary call discards caller intent — e.g. Camille beat timeouts then
  // surface ScriptedDialogueService's default-human response ("...") as a
  // Camille speech bubble. When the caller's signal is aborted we must
  // propagate the abort so callers own their cleanup path.
  it("rethrows when the caller's signal is aborted; does not call secondary", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const controller = new AbortController();
    const primary = {
      getDialogue: vi.fn().mockImplementation(async () => {
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      }),
    };
    const secondary = {
      getDialogue: vi.fn().mockResolvedValue({ lines: ["scripted"] }),
    };
    const fb = new FallbackDialogueService(primary, secondary);
    await expect(
      fb.getDialogue(baseReq(), { signal: controller.signal }),
    ).rejects.toThrow();
    expect(secondary.getDialogue).not.toHaveBeenCalled();
    debug.mockRestore();
  });

  // Internal-timeout aborts (no caller signal, or caller signal not fired)
  // must still fall back to scripted. Engaged cat dialogue relies on this to
  // deliver the designed scripted response when the 8s default budget lapses.
  it("still falls back to secondary when an internal-timeout AbortError occurs without caller-aborting", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const primary = {
      getDialogue: vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")),
    };
    const secondary = {
      getDialogue: vi.fn().mockResolvedValue({ lines: ["scripted"] }),
    };
    const fb = new FallbackDialogueService(primary, secondary);
    const out = await fb.getDialogue(baseReq());
    expect(out.lines).toEqual(["scripted"]);
    expect(secondary.getDialogue).toHaveBeenCalled();
    debug.mockRestore();
  });
});
