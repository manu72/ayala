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
  it("includes persona and scene facts", () => {
    const p = buildSystemPrompt("# Blacky\nCat.", baseReq());
    expect(p).toContain("Blacky");
    expect(p).toContain("Chapter: 2");
    expect(p).toContain("Tiger");
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
