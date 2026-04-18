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
import type { DialogueRequest } from "../../src/services/DialogueService";

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
    const p = parseAIJson(`{"lines":["Mrrp."],"speakerPose":"friendly","emote":"heart"}`);
    expect(p.lines).toEqual(["Mrrp."]);
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
});

describe("buildSystemPrompt", () => {
  it("includes persona and scene facts for cats", () => {
    const p = buildSystemPrompt("# Blacky\nCat.", baseReq());
    expect(p).toContain("Blacky");
    expect(p).toContain("Chapter: 2");
    expect(p).toContain("Tiger");
    expect(p).toContain("Speaker species: cat");
    expect(p).toContain("cat-speak");
  });

  it("gives humans plain-speech guidance and a human example", () => {
    const req = baseReq();
    req.speaker = "Camille";
    req.speakerType = "human";
    const p = buildSystemPrompt("# Camille\nHuman.", req);
    expect(p).toContain("Speaker species: human");
    expect(p).toContain("Humans speak plainly");
    expect(p).not.toContain('"Meow to you mamma cat');
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
});

describe("buildMessages", () => {
  it("includes history and final user turn", () => {
    const req = baseReq();
    req.conversationHistory = [{ timestamp: 1, speaker: "Blacky", text: "Earlier." }];
    const m = buildMessages(req);
    expect(m.some((x) => x.role === "assistant" && x.content === "Earlier.")).toBe(true);
    expect(m[m.length - 1]!.role).toBe("user");
  });

  it("uses a 20-turn window for tier-1 speakers (Blacky)", () => {
    const req = baseReq();
    req.speaker = "Blacky";
    req.conversationHistory = Array.from({ length: 25 }, (_, i) => ({
      timestamp: i,
      speaker: "Blacky",
      text: `line ${i}`,
    }));
    const m = buildMessages(req);
    // Each history entry contributes 2 messages (user + assistant); plus the
    // final user turn. 20 turns * 2 + 1 = 41.
    expect(m.length).toBe(41);
    // The last assistant echo should be the most recent of the 20 kept.
    const assistants = m.filter((x) => x.role === "assistant");
    expect(assistants[assistants.length - 1]!.content).toBe("line 24");
    expect(assistants[0]!.content).toBe("line 5");
  });

  it("uses a 10-turn window for tier-2 speakers (Kish)", () => {
    const req = baseReq();
    req.speaker = "Kish";
    req.speakerType = "human";
    req.conversationHistory = Array.from({ length: 25 }, (_, i) => ({
      timestamp: i,
      speaker: "Kish",
      text: `line ${i}`,
    }));
    const m = buildMessages(req);
    // 10 * 2 + 1 = 21.
    expect(m.length).toBe(21);
    const assistants = m.filter((x) => x.role === "assistant");
    expect(assistants[0]!.content).toBe("line 15");
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
          choices: [{ message: { content: '{"lines":["Mrrp test"],"speakerPose":"curious","emote":"curious"}' } }],
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
    expect(out.lines).toEqual(["Mrrp test"]);
    expect(out.event).toBe("blacky_first");
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
});
