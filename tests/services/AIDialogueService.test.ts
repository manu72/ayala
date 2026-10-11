import { afterEach, describe, it, expect, vi } from "vitest";
import {
  AIDialogueService,
  AIParseError,
  AIProxyThrottledError,
  PROMPT_CHAR_BUDGET,
  buildMessages,
  buildSystemPrompt,
  matchScriptedResponse,
  parseAIJson,
} from "../../src/services/AIDialogueService";
import { FallbackDialogueService } from "../../src/services/FallbackDialogueService";
import { ScriptedDialogueService, type DialogueRequest, type DialogueService } from "../../src/services/DialogueService";

const baseReq = (): DialogueRequest => ({
  speaker: "Blacky",
  speakerType: "cat",
  target: "Mamma Cat",
  gameState: {
    chapter: 2,
    timeOfDay: "day",
   
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

  it("accepts an impression memoryNote and ignores any mammaCatCue", () => {
    const p = parseAIJson(JSON.stringify({
      lines: ["You came back."],
      mammaCatCue: "Mamma Cat says she missed me.",
      memoryNote: {
        kind: "preference",
        label: "space",
        value: "Mamma Cat settles when given room.",
      },
    }));
    expect(p).not.toHaveProperty("mammaCatCue");
    expect(p.memoryNote).toEqual({
      kind: "preference",
      label: "space",
      value: "Mamma Cat settles when given room.",
    });
  });

  it("rejects an AI memoryNote of kind event (events are the game's record)", () => {
    const p = parseAIJson(JSON.stringify({
      lines: ["Still here."],
      memoryNote: { kind: "event", label: "returned", value: "Mamma Cat told me she was lost." },
    }));
    expect(p.lines).toEqual(["Still here."]);
    expect(p.memoryNote).toBeUndefined();
  });

  it("drops malformed optional fields without rejecting the dialogue", () => {
    const p = parseAIJson(JSON.stringify({
      lines: ["Still here."],
      memoryNote: {
        kind: "trait",
        label: "x".repeat(80),
        value: "Unsafe\u0000memory",
      },
    }));
    expect(p.lines).toEqual(["Still here."]);
    expect(p.memoryNote).toBeUndefined();
  });

  it("rejects any line longer than 160 characters", () => {
    expect(parseAIJson(JSON.stringify({ lines: ["a".repeat(160)] })).lines[0]).toHaveLength(160);
    expect(() => parseAIJson(JSON.stringify({ lines: ["Short.", "b".repeat(161)] }))).toThrow(AIParseError);
  });
});

const last = <T>(items: T[]): T => items[items.length - 1]!;

/** The final user message: the per-turn scene (system prompt excluded). */
const currentTurn = (req: DialogueRequest): string => last(buildMessages(req)).content;

describe("buildSystemPrompt", () => {
  it("keeps per-turn scene facts out of the system prompt and puts them in the final user message", () => {
    const req = baseReq();
    req.relationshipStage = 2;
    req.isFirstConversation = false;
    req.conversationRecency = { cadence: "long_absence" };
    req.gameState.recentEvents = ["Shared shade near the fountain."];
    const system = buildSystemPrompt("# Blacky\nCat.", req);
    expect(system).toContain("## Your Persona");
    expect(system).toContain("## Relationship Context");
    expect(system).not.toContain("## Current scene");
    expect(system).not.toContain("Chapter: 2");
    expect(system).not.toContain("Shared shade near the fountain.");
    expect(system).not.toContain("apart across several game days");

    const messages = buildMessages(req, system);
    const final = last(messages);
    expect(final.role).toBe("user");
    expect(final.content).toContain("## Current scene (facts — follow these)");
    expect(final.content).toContain("Speaker species: cat");
    expect(final.content).toContain("Chapter: 2");
    expect(final.content).toContain("Game day: 3");
    expect(final.content).toContain("Cats Mamma Cat knows by name: Tiger");
    expect(final.content).toContain("Story so far:\n  - Shared shade near the fountain.");
    expect(final.content).toContain("apart across several game days");
    expect(final.content).toContain("[Day 3, day] Mamma Cat comes over to you.");
    expect(final.content).toMatch(/Respond in JSON as specified in the system message\.$/);
  });

  it("gives cats plain-English, Mamma-Cat-never-speaks guidance and their trust, in words not stat numbers", () => {
    const req = baseReq();
    const system = buildSystemPrompt("# Blacky\nCat.", req);
    expect(system).toContain("natural, plain English");
    expect(system).toContain("under about 90 characters");
    expect(system).toContain("she never speaks words");
    expect(system).toContain("Never claim she told you anything");
    expect(system).not.toContain("Cats use short cat-speak");
    // a silent cat (Ginger B) may answer with an action rather than being told to speak
    expect(system).toContain("a line may be a wordless action in *asterisks* instead of speech");
    expect(`${system}\n${currentTurn(req)}`).not.toMatch(/\bSpeak (?:in|to Mamma Cat)\b/);

    const final = currentTurn(req);
    expect(final).toContain("Trust toward Mamma Cat: 5 (0–100)");
    expect(final).not.toContain("colony trust");
    expect(final).toContain("Mamma Cat's condition: She is a little hungry and a little thirsty.");
    expect(final).not.toMatch(/\b(?:hunger|thirst|energy)\b|\b(?:40|70)\b/i);
  });

  it("gives humans speech-to-a-cat guidance, a human example and no trust lines at all", () => {
    const req = baseReq();
    req.speaker = "Camille";
    req.speakerType = "human";
    const system = buildSystemPrompt("# Camille\nHuman.", req);
    expect(system).toContain("speaking aloud to a cat who can't answer in words");
    expect(system).toContain("under about 60 characters");
    expect(system).toContain("don't introduce yourself again");
    expect(system).toContain("unless the story beat says so");
    expect(system).toContain('Example: {"lines":["Hey there. Taking it easy?"]');
    expect(system).not.toContain("There is shade by the fountain.");
    expect(system).not.toContain("Familiarity does not imply a new arrival");

    const final = currentTurn(req);
    expect(final).toContain("Speaker species: human");
    expect(`${system}\n${final}`).not.toMatch(/trust toward|colony trust/i);
  });

  it("asks for impression-only memory notes and never for a Mamma Cat cue", () => {
    const system = buildSystemPrompt("# Blacky\nCat.", baseReq());
    expect(system).not.toContain("mammaCatCue");
    expect(system).toContain('"kind":"identity|preference|trait|relationship"');
    expect(system).toContain("never note things Mamma Cat \"said\"");
    expect(system).toContain("Only reference events in the conversation history, the story-so-far facts and the memory lists");
  });

  it("only gives the first-conversation block when the caller says so, and never for an encounter beat", () => {
    const inferred = baseReq();
    inferred.speaker = "Camille";
    inferred.speakerType = "human";
    inferred.gameState.trustWithSpeaker = 0;
    const inferredPrompt = buildSystemPrompt("# Camille\nHuman.", inferred);
    expect(inferredPrompt).toContain("RELATIONSHIP STAGE 1");
    expect(inferredPrompt).not.toContain("FIRST CONVERSATION");

    const first = { ...inferred, isFirstConversation: true };
    expect(buildSystemPrompt("# Camille\nHuman.", first)).toContain("FIRST CONVERSATION");

    const beat: DialogueRequest = {
      ...first,
      encounterBeat: { kind: "camille_encounter", n: 2, objective: "Places a treat.", slots: ["She waits."] },
    };
    const beatPrompt = buildSystemPrompt("# Camille\nHuman.", beat);
    expect(beatPrompt).not.toContain("FIRST CONVERSATION");
    expect(beatPrompt).toContain("This is not the first conversation");
  });

  it("includes nearbyCat context when provided", () => {
    const req = baseReq();
    req.speaker = "Rose";
    req.speakerType = "human";
    req.nearbyCat = "Tiger";
    expect(currentTurn(req)).toContain("Cat currently near you: Tiger");
  });

  it("gives an encounter beat its objective and one instruction per narrator slot", () => {
    const req = baseReq();
    req.speaker = "Camille";
    req.speakerType = "human";
    req.encounterBeat = {
      kind: "camille_encounter",
      n: 3,
      objective: "Slow blink trust exchange.",
      slots: ["She closes her eyes.", "Slow blink back?"],
    };
    const final = currentTurn(req);
    expect(final).toContain("Encounter 3 of 5");
    expect(final).toContain("Objective: Slow blink trust exchange.");
    expect(final).toContain("Reply with exactly 2 line(s), in order.");
    expect(final).toContain('Line 1 is said while the narrator shows: "She closes her eyes."');
    expect(final).toContain('Line 2 is said while the narrator shows: "Slow blink back?"');
    expect(final).toContain("side-effects are handled by the game");
    expect(final).toContain("Mamma Cat is here with you.");
  });

  it("asks an ambient bubble for exactly one short line said in passing", () => {
    const req = baseReq();
    req.speaker = "Rose";
    req.speakerType = "human";
    req.interaction = "ambient";
    const final = currentTurn(req);
    expect(final).toContain("Mamma Cat passes close by.");
    expect(final).toContain("Say exactly ONE short line (under 60 characters), said in passing.");
    expect(currentTurn(baseReq())).not.toContain("exactly ONE short line");
  });

  it("includes rapid same-NPC recency as deliberate continuity context", () => {
    const req = baseReq();
    req.speaker = "Jayco Jr";
    req.isFirstConversation = false;
    req.conversationRecency = {
      cadence: "continuing_conversation",
    };

    const p = currentTurn(req);

    expect(p).toContain("## Encounter context (game time only)");
    expect(p).toContain("still in the same encounter");
    expect(p).toContain("do not imply Mamma Cat has been away or greet her again");
    expect(p).not.toMatch(/\b\d+\s+(?:seconds?|minutes?|times)\b/i);
    expect(p).not.toContain("You spoke with Mamma Cat about");
  });

  it.each(["recent_return", "same_day_return", "previous_day_return", "long_absence"] as const)(
    "keeps %s qualitative and makes acknowledgements optional",
    (cadence) => {
      const req = baseReq();
      req.isFirstConversation = false;
      req.conversationRecency = { cadence };
      const p = currentTurn(req);

      expect(p).not.toMatch(/\b\d+\s+(?:seconds?|minutes?|times|game days)\b/i);
      expect(p).toContain("Prefer the current subject");
      expect(p).toContain("Avoid repeating the last beat, greeting, or return acknowledgement");
      expect(p).toContain(cadence === "recent_return" ? "without commenting on a return or the gap" : "at the start of this visit");
    },
  );

  it("does not prime return remarks or infer tiredness from repeated speech", () => {
    const p = buildSystemPrompt("# Blacky\nCat.", baseReq());
    expect(p).not.toContain('"You came back."');
    expect(p).not.toContain('"label":"returned"');
    expect(p).toContain("Only acknowledge a return or absence when the encounter context in the current scene permits it");
    expect(p).toContain("advice to rest must follow her actual energy or visible condition");
    expect(p).toContain("including stopwatch-style wording from earlier replies");
  });

  it("does not imply an absence on first contact even with stale recency context", () => {
    const req = baseReq();
    req.isFirstConversation = true;
    req.conversationRecency = { cadence: "long_absence" };
    expect(buildSystemPrompt("# Blacky\nCat.", req)).toContain("FIRST CONVERSATION");
    expect(currentTurn(req)).not.toContain("## Encounter context");
  });

  it("splits memories into the game's true record and the NPC's own guesses", () => {
    const req = baseReq();
    req.isFirstConversation = false;
    req.npcMemories = [
      {
        npc: "Blacky",
        kind: "event",
        label: "first_meeting",
        value: "You first met Mamma Cat on day 1, at dawn.",
        dedupeKey: "a",
        source: "scripted",
        createdAt: 1,
        gameDay: 1,
      },
      {
        npc: "Blacky",
        kind: "preference",
        label: "distance",
        value: "Mamma Cat responds better when Blacky gives her space.",
        dedupeKey: "b",
        source: "ai",
        createdAt: 2,
        gameDay: 2,
      },
    ];

    const p = buildSystemPrompt("# Blacky\nCat.", req);
    const facts = p.indexOf("## What has happened between you (game record — true)\n- first_meeting: You first met Mamma Cat on day 1, at dawn.");
    const guesses = p.indexOf(
      "## Your own impressions of Mamma Cat (guesses; may be wrong — never present them as shared events)\n- distance: Mamma Cat responds better",
    );
    expect(facts).toBeGreaterThan(-1);
    expect(guesses).toBeGreaterThan(facts);
    expect(p).not.toContain("No durable memories are listed yet.");

    req.npcMemories = [];
    const empty = buildSystemPrompt("# Blacky\nCat.", req);
    expect(empty).toContain("No durable memories are listed yet.");
    // history and story facts are still fair to use; only the memory list is empty
    expect(empty).not.toContain("Only reference memories listed here");
  });
});

describe("buildMessages", () => {
  it("omits future exchanges from AI context without changing scripted branch selection", () => {
    const req = baseReq();
    req.isFirstConversation = false;
    req.conversationHistory = [{ timestamp: 900_000, speaker: "Blacky", text: "Future exchange." }];
    req.promptConversationHistory = [];

    expect(buildMessages(req)).toHaveLength(1);
    expect(buildMessages(req).some((message) => message.content.includes("Future exchange."))).toBe(false);
    expect(matchScriptedResponse(req)?.event).toBe("blacky_return");
  });

  it("includes history and final user turn", () => {
    const req = baseReq();
    req.conversationHistory = [{ timestamp: 1, speaker: "Blacky", text: "Earlier." }];
    const m = buildMessages(req);
    expect(m.some((x) => x.role === "assistant" && x.content === "Earlier.")).toBe(true);
    expect(m[m.length - 1]!.role).toBe("user");
  });

  it("sends every history entry, oldest first, while under the budget", () => {
    const req = baseReq();
    req.conversationHistory = Array.from({ length: 30 }, (_, i) => ({
      timestamp: i,
      speaker: "Blacky",
      mammaCatTurn: `Mamma turn ${i}`,
      text: `line ${i}`,
    }));
    const m = buildMessages(req, "system");
    expect(m).toHaveLength(61);
    expect(m[0]).toEqual({ role: "user", content: "Mamma turn 0" });
    expect(m[1]).toEqual({ role: "assistant", content: "line 0" });
    expect(m[59]).toEqual({ role: "assistant", content: "line 29" });
  });

  it("drops the oldest pairs to fit PROMPT_CHAR_BUDGET (system included) and says so", () => {
    const req = baseReq();
    req.conversationHistory = Array.from({ length: 40 }, (_, i) => ({
      timestamp: i,
      speaker: "Blacky",
      mammaCatTurn: `[Day ${i + 1}, day] Mamma Cat came over to talk.`,
      text: `${i} `.padEnd(1_000, "x"),
    }));
    const system = "s".repeat(5_000);
    const m = buildMessages(req, system);
    const total = system.length + m.reduce((n, message) => n + message.content.length, 0);
    expect(total).toBeLessThanOrEqual(PROMPT_CHAR_BUDGET);

    const assistants = m.filter((message) => message.role === "assistant");
    expect(assistants.length).toBeLessThan(40);
    expect(last(assistants).content.startsWith("39 ")).toBe(true);
    const dropped = 40 - assistants.length;
    expect(assistants[0]!.content.startsWith(`${dropped} `)).toBe(true);
    expect(m[0]).toEqual({
      role: "user",
      content: `(Earlier meetings are not shown.) [Day ${dropped + 1}, day] Mamma Cat came over to talk.`,
    });
    // One more pair would not have fitted.
    const lastDropped = req.conversationHistory[dropped - 1]!;
    expect(total + lastDropped.mammaCatTurn!.length + lastDropped.text.length).toBeGreaterThan(PROMPT_CHAR_BUDGET);
  });

  it("does not mark history as trimmed when nothing was dropped", () => {
    const req = baseReq();
    req.conversationHistory = [{ timestamp: 1, speaker: "Blacky", mammaCatTurn: "Came over.", text: "Hi." }];
    expect(buildMessages(req, "system")[0]!.content).toBe("Came over.");
  });

  it("uses a neutral Mamma Cat turn for entries without one", () => {
    const req = baseReq();
    req.speaker = "Kish";
    req.speakerType = "human";
    req.conversationHistory = [{
      timestamp: 1,
      speaker: "Kish",
      text: "Earlier line.",
    }];
    const m = buildMessages(req);
    expect(m[0]).toEqual({ role: "user", content: "Mamma Cat came over." });
    expect(m[1]).toEqual({ role: "assistant", content: "Earlier line." });
    expect(m[m.length - 1]!.content).toContain("Respond in JSON");
  });

  it("marks the current Mamma Cat turn as a rapid deliberate follow-up", () => {
    const req = baseReq();
    req.speaker = "Jayco Jr";
    req.isFirstConversation = false;
    req.conversationRecency = {
      cadence: "continuing_conversation",
    };

    const m = buildMessages(req);

    expect(m[m.length - 1]!.content).toContain("Continue the existing conversation naturally");
    expect(m[m.length - 1]!.content).not.toContain("approaches");
    expect(m[m.length - 1]!.content).not.toMatch(/\b\d+\s+(?:seconds?|minutes?|times)\b/i);
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
          choices: [{ message: { content: '{"lines":["Careful now."],"speakerPose":"curious","emote":"curious","mammaCatCue":"Mamma Cat steps closer.","memoryNote":{"kind":"trait","label":"steady","value":"Mamma Cat stepped closer calmly."},"event":"model_must_not_win","trustChange":99}' } }],
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
    expect(out).not.toHaveProperty("mammaCatCue");
    expect(out.memoryNote).toEqual({
      kind: "trait",
      label: "steady",
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
  it("resolves human persona and puts the encounterBeat in the final user message", async () => {
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
      slots: ["She waits."],
    };
    const out = await svc.getDialogue(req);
    expect(out.lines).toEqual(["You came back."]);
    const parsed = JSON.parse(capturedBody!) as { messages: Array<{ role: string; content: string }> };
    expect(parsed.messages[0]?.role).toBe("system");
    expect(parsed.messages.filter((m) => m.role === "system")).toHaveLength(1);
    expect(parsed.messages[0]?.content).not.toContain("Encounter 2 of 5");
    const finalMessage = last(parsed.messages);
    expect(finalMessage?.role).toBe("user");
    expect(finalMessage?.content).toContain("Encounter 2 of 5");
    expect(finalMessage?.content).toContain("Speaker species: human");
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
      slots: ["She waits."],
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
      slots: ["She closes her eyes."],
    };

    await expect(fb.getDialogue(req)).rejects.toThrow("network");
    debug.mockRestore();
  });

  it("does not replay an exhausted script when AI fails, but keeps its event and trust", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const primary = {
      getDialogue: vi.fn().mockRejectedValue(new Error("network")),
    };
    const secondary = new ScriptedDialogueService({
      Blacky: [
        {
          id: "blacky_return",
          condition: () => true,
          response: {
            lines: ["Scripted return."],
            speakerPose: "friendly",
            emote: "heart",
            narration: "Not for placeholders.",
            trustChange: 5,
            event: "blacky_return",
          },
        },
      ],
    });
    const fb = new FallbackDialogueService(primary, secondary);
    const req = baseReq();
    req.conversationHistory = [{ timestamp: 1, speaker: "Blacky", text: "Scripted return." }];

    const out = await fb.getDialogue(req);

    expect(out).toEqual({
      lines: ["*Blacky blinks slowly at you.*"],
      speakerPose: "friendly",
      emote: "heart",
      trustChange: 5,
      event: "blacky_return",
      placeholder: true,
    });
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

describe("AIDialogueService network", () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const ok = () => json(200, { choices: [{ message: { content: '{"lines":["Hi."]}' } }] });
  const service = (fetchImpl: ReturnType<typeof vi.fn>) =>
    new AIDialogueService({
      proxyUrl: "/api/ai/chat",
      personas: { Blacky: "# Blacky" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
  const providers = (fetchImpl: ReturnType<typeof vi.fn>) =>
    fetchImpl.mock.calls.map((c) => (JSON.parse((c[1] as RequestInit).body as string) as { provider: string }).provider);
  /** A fetch that only settles when its signal aborts. */
  const hangUntilAborted = (_url: string, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });

  afterEach(() => vi.useRealTimers());

  it("does not fail over on a proxy rate limit and makes no calls until retryAfterSeconds lapses", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const fetchImpl = vi.fn().mockResolvedValue(json(429, { error: "rate_limited", retryAfterSeconds: 12 }));
    const svc = service(fetchImpl);

    await expect(svc.getDialogue(baseReq())).rejects.toBeInstanceOf(AIProxyThrottledError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    vi.setSystemTime(1_000_000 + 11_999);
    await expect(svc.getDialogue(baseReq())).rejects.toBeInstanceOf(AIProxyThrottledError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    vi.setSystemTime(1_000_000 + 12_000);
    fetchImpl.mockResolvedValueOnce(ok());
    await expect(svc.getDialogue(baseReq())).resolves.toMatchObject({ lines: ["Hi."] });
  });

  it.each([
    [{ error: "rate_limited" }, 429, 30_000],
    [{ error: "ai_disabled" }, 503, 300_000],
  ])("defaults the cool-down for %j", async (body, status, coolDownMs) => {
    vi.useFakeTimers({ now: 0 });
    const fetchImpl = vi.fn().mockResolvedValue(json(status, body));
    const svc = service(fetchImpl);
    await expect(svc.getDialogue(baseReq())).rejects.toMatchObject({ retryAfterMs: coolDownMs });
    vi.setSystemTime(coolDownMs - 1);
    await expect(svc.getDialogue(baseReq())).rejects.toBeInstanceOf(AIProxyThrottledError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("still fails over on an upstream-shaped 429 (object error)", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(429, { error: { message: "Too many requests" } }))
      .mockResolvedValueOnce(ok());
    await expect(service(fetchImpl).getDialogue(baseReq())).resolves.toMatchObject({ lines: ["Hi."] });
    expect(providers(fetchImpl)).toEqual(["deepseek", "openai"]);
  });

  it.each([400, 404, 422])("fails over on an upstream %i with an object error (e.g. a retired model)", async (status) => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(status, { error: { message: "Model Not Exist", type: "invalid_request_error" } }))
      .mockResolvedValueOnce(ok());
    await expect(service(fetchImpl).getDialogue(baseReq())).resolves.toMatchObject({ lines: ["Hi."] });
    expect(providers(fetchImpl)).toEqual(["deepseek", "openai"]);
  });

  it("does not fail over on the Worker's own validation 400 (string error)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(400, { error: "messages exceed size limit" }));
    await expect(service(fetchImpl).getDialogue(baseReq())).rejects.toThrow(/AI proxy error 400/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("tries the secondary provider at most once", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json(503, { error: "upstream error" }));
    await expect(service(fetchImpl).getDialogue(baseReq())).rejects.toThrow(/AI proxy error 503/);
    expect(providers(fetchImpl)).toEqual(["deepseek", "openai"]);
  });

  it("gives both attempts one deadline", async () => {
    vi.useFakeTimers({ now: 0 });
    const fetchImpl = vi.fn()
      .mockImplementationOnce(() => new Promise((_resolve, reject) => setTimeout(() => reject(new TypeError("fetch failed")), 1_000)))
      .mockImplementationOnce(hangUntilAborted);
    const outcome = service(fetchImpl).getDialogue(baseReq(), { timeoutMs: 3_000 }).catch((err: unknown) => err);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const secondarySignal = (fetchImpl.mock.calls[1]![1] as RequestInit).signal!;
    await vi.advanceTimersByTimeAsync(1_999);
    expect(secondarySignal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(secondarySignal.aborted).toBe(true);
    expect(await outcome).toMatchObject({ name: "AbortError" });
  });

  it("skips the secondary provider when too little of the deadline is left", async () => {
    vi.useFakeTimers({ now: 0 });
    const fetchImpl = vi.fn().mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(json(503, { error: { message: "busy" } })), 1_500)),
    );
    const outcome = service(fetchImpl).getDialogue(baseReq(), { timeoutMs: 2_000 }).catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(String(await outcome)).toMatch(/AI proxy error 503/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not fetch at all for an already-aborted caller signal", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok());
    const controller = new AbortController();
    controller.abort();
    await expect(service(fetchImpl).getDialogue(baseReq(), { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not fail over when the caller aborts after a primary failure", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockImplementationOnce(async () => {
      controller.abort();
      return json(503, { error: { message: "busy" } });
    });
    await expect(service(fetchImpl).getDialogue(baseReq(), { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("FallbackDialogueService serves scripted lines to cats while throttled, and rethrows for beats", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(json(429, { error: "rate_limited", retryAfterSeconds: 30 }));
    const ai = new AIDialogueService({
      proxyUrl: "/api/ai/chat",
      personas: { Blacky: "# Blacky", Camille: "# Camille" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const scripted: DialogueService = { getDialogue: vi.fn().mockResolvedValue({ lines: ["(scripted)"] }) };
    const fb = new FallbackDialogueService(ai, scripted);
    await expect(fb.getDialogue(baseReq())).resolves.toEqual({ lines: ["(scripted)"] });

    const beat = baseReq();
    beat.speaker = "Camille";
    beat.speakerType = "human";
    beat.encounterBeat = { kind: "camille_encounter", n: 2, objective: "Places a treat.", slots: ["She waits."] };
    await expect(fb.getDialogue(beat)).rejects.toBeInstanceOf(AIProxyThrottledError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
