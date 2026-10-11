/**
 * AI-backed dialogue via same-origin proxy (Cloudflare Worker).
 * Story progression `event` is taken from scripted conditions (authoritative).
 */

import { isAiDialogueConsoleDebugEnabled } from "../config/aiDialogueDebug";
import { NPC_DIALOGUE_SCRIPTS } from "../data/npc-dialogue";
import {
  findMatchingDialogueScript,
  type DialogueRequest,
  type DialogueResponse,
  type DialogueService,
  type SpeakerPose,
} from "./DialogueService";
import { calculateRelationshipStage, type RelationshipStage } from "./DialogueRelationship";
import {
  NPC_MEMORY_LABEL_MAX,
  NPC_MEMORY_VALUE_MAX,
  isNpcMemoryKind,
  normalizeNpcMemoryText,
} from "./NpcMemoryValidation";
import { describeMammaCatCondition } from "../utils/mammaCatCondition";

export class AIParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIParseError";
  }
}

/** Thrown when the proxy itself (not an upstream provider) refuses: rate limit or kill switch. */
export class AIProxyThrottledError extends Error {
  constructor(readonly retryAfterMs: number, reason: string) {
    super(`AI proxy throttled: ${reason}`);
    this.name = "AIProxyThrottledError";
  }
}

/** Total characters (system + every message) sent per request; the Worker rejects above 32k. */
export const PROMPT_CHAR_BUDGET = 28_000;

const EARLIER_MEETINGS_NOT_SHOWN = "(Earlier meetings are not shown.) ";

/** Longer lines overflow the dialogue box / bubble; reject them so the scripted fallback runs. */
const MAX_LINE_CHARS = 160;

/** A secondary provider attempt with less budget than this left can't finish; fail fast instead. */
const MIN_SECONDARY_ATTEMPT_MS = 750;

/** Proxy refusal codes (string `error`) and their default cool-downs. */
const PROXY_THROTTLE_DEFAULT_SECONDS: Record<string, number> = { rate_limited: 30, ai_disabled: 300 };

const VALID_POSES: SpeakerPose[] = ["friendly", "wary", "hostile", "sleeping", "curious", "submissive"];

/** Emote keys understood by EmoteSystem (not raw glyphs). */
const VALID_EMOTES = new Set(["heart", "alert", "curious", "sleep", "hostile", "danger"]);

const HARSHER_TEMP_SPEAKERS = new Set(["Tiger", "Fluffy", "Pedigree", "Ginger", "Ginger B"]);

const RELATIONSHIP_STAGE_CONTEXT: Record<RelationshipStage, string> = {
  1: "RELATIONSHIP STAGE 1: This is a first conversation. Be curious or cautious according to your persona. Do not reference shared history.",
  2: "RELATIONSHIP STAGE 2: You are acquaintances. Show recognition, but keep trust measured and earned.",
  3: "RELATIONSHIP STAGE 3: A relationship is forming. Reference established facts naturally when relevant.",
  4: "RELATIONSHIP STAGE 4: You have established trust. Speak with warmth and ease while staying in character.",
};

const CAT_STYLE = [
  "## Conversational Style",
  "When you speak, use natural, plain English. Be terse, wary, playful, proud, or affectionate according to your persona; never use cat-speak as your main language.",
  "Reply with 1 to 3 lines: one short sentence per line, each under about 90 characters.",
  "Where your persona says you don't talk or barely talk, a line may be a wordless action in *asterisks* instead of speech.",
  "Mamma Cat is a cat: she never speaks words. She meows, approaches, blinks, rubs, eats. Never claim she told you anything.",
].join("\n");

const HUMAN_STYLE = [
  "## Conversational Style",
  "You are speaking aloud to a cat who can't answer in words. Use plain, everyday speech; no baby-talk.",
  "Keep each line under about 60 characters.",
  "Once you have history with her, don't introduce yourself again.",
  "Don't claim to give, place, or bring her anything unless the story beat says so.",
].join("\n");

const CAT_EXAMPLE = '{"lines":["There is shade by the fountain."],"speakerPose":"friendly","emote":"heart","narration":"Tail tip curls."}';
const HUMAN_EXAMPLE = '{"lines":["Hey there. Taking it easy?"],"speakerPose":"friendly","emote":"curious"}';

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ProxyResponseShape {
  choices?: Array<{ message?: { content?: string } }>;
}

export interface AIDialogueServiceOptions {
  proxyUrl: string;
  personas: Record<string, string>;
  /** For tests — defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Primary upstream name as sent to the proxy. */
  primaryProvider?: "deepseek" | "openai";
  secondaryProvider?: "deepseek" | "openai";
  /**
   * Total budget in milliseconds across the primary and any secondary attempt.
   * Defaults to 8000ms (full engage). Callers that render a quick ambient
   * bubble can pass a tighter budget via {@link AIDialogueService.getDialogue}'s
   * per-call `timeoutMs` option.
   */
  defaultTimeoutMs?: number;
}

/**
 * Per-call options that don't belong on the shared `DialogueRequest` contract.
 * `timeoutMs` (one deadline for the whole call) is used for tight-budget
 * bubbles; leaving it unset keeps the default 8s budget which suits engaged
 * (Space-triggered) dialogue.
 */
export interface AIDialogueCallOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class AIDialogueService implements DialogueService {
  private readonly fetchImpl: typeof fetch;
  private readonly primaryProvider: "deepseek" | "openai";
  private readonly secondaryProvider: "deepseek" | "openai";
  private readonly defaultTimeoutMs: number;
  /** Wall-clock instant before which calls fail fast after a proxy refusal. */
  private throttledUntil = 0;

  constructor(private readonly opts: AIDialogueServiceOptions) {
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.primaryProvider = opts.primaryProvider ?? "deepseek";
    this.secondaryProvider = opts.secondaryProvider ?? "openai";
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 8000;
  }

  async getDialogue(request: DialogueRequest, callOpts?: AIDialogueCallOptions): Promise<DialogueResponse> {
    const persona = this.opts.personas[request.speaker];
    if (!persona) {
      throw new Error(`No AI persona loaded for speaker: ${request.speaker}`);
    }
    const coolingDownMs = this.throttledUntil - Date.now();
    if (coolingDownMs > 0) throw new AIProxyThrottledError(coolingDownMs, "cooling down");

    const scripted = matchScriptedResponse(request);
    const systemPrompt = buildSystemPrompt(persona, request);
    const messages = buildMessages(request, systemPrompt);
    const temperature = HARSHER_TEMP_SPEAKERS.has(request.speaker) ? 0.6 : 0.8;
    if (isAiDialogueConsoleDebugEnabled()) {
      console.log("[AIDialogueService] dialogue context:", {
        speaker: request.speaker,
        isFirstConversation: request.isFirstConversation,
        relationshipStage: request.relationshipStage,
        conversationRecency: request.conversationRecency,
        memoryCount: request.npcMemories?.length ?? 0,
        memories: request.npcMemories,
      });
    }

    const raw = await this.callLLMWithFallback(systemPrompt, messages, temperature, callOpts, request.speaker);
    const parsed = parseAIJson(raw);

    return {
      lines: parsed.lines,
      speakerPose: parsed.speakerPose ?? scripted?.speakerPose,
      emote: parsed.emote ?? scripted?.emote,
      narration: parsed.narration ?? scripted?.narration,
      memoryNote: parsed.memoryNote,
      trustChange: scripted?.trustChange,
      event: scripted?.event,
    };
  }

  private async callLLMWithFallback(
    systemPrompt: string,
    messages: ChatMessage[],
    temperature: number,
    callOpts?: AIDialogueCallOptions,
    speakerLabel?: string,
  ): Promise<string> {
    const payloadBase = {
      messages: [{ role: "system" as const, content: systemPrompt }, ...messages],
      temperature,
      max_tokens: 220,
    };

    const debugAi = isAiDialogueConsoleDebugEnabled();
    if (debugAi) {
      const label = speakerLabel ?? "(unknown speaker)";
      console.groupCollapsed(`[AIDialogueService] AI debug — input (${label})`);
      console.log("systemPrompt:\n", systemPrompt);
      console.log("chat messages (excludes system; appended as first message on wire):\n", messages);
      console.log("full messages payload (system + chat):\n", payloadBase.messages);
      console.log("temperature:", payloadBase.temperature, "max_tokens:", payloadBase.max_tokens);
      console.groupEnd();
    }

    // One deadline covers both attempts. The secondary provider is tried at
    // most once, for two distinct failure modes:
    //  1. Primary resolved with a provider failure — see `shouldFailOver`.
    //  2. Primary rejected with a non-abort error (DNS, TLS, connection
    //     refused, etc.) — the different upstream host behind the secondary
    //     provider may still be reachable.
    // Abort errors (internal timeout OR external caller signal) are preserved
    // as caller intent and propagate without burning the secondary provider,
    // and so do proxy refusals (the secondary would hit the same Worker).
    const deadline = Date.now() + (callOpts?.timeoutMs ?? this.defaultTimeoutMs);
    const post = (provider: "deepseek" | "openai") =>
      this.postProvider(provider, payloadBase, deadline, callOpts?.signal);
    let res: Response | undefined;
    let primaryError: unknown;
    try {
      res = await post(this.primaryProvider);
    } catch (err) {
      if (isAbortError(err) || err instanceof AIProxyThrottledError) throw err;
      primaryError = err;
    }
    if (!res || (await shouldFailOver(res))) {
      if (deadline - Date.now() >= MIN_SECONDARY_ATTEMPT_MS) res = await post(this.secondaryProvider);
      else if (!res) throw primaryError;
    }

    if (!res.ok) {
      const errText = await res.text();
      if (debugAi) {
        const label = speakerLabel ?? "(unknown speaker)";
        console.warn(`[AIDialogueService] AI debug — HTTP ${res.status} (${label})`, errText.slice(0, 500));
      }
      // A non-JSON (HTML) error body almost always means the request never
      // reached the Worker at all — e.g. `VITE_AI_PROXY_URL` points at a
      // static host (GitHub Pages) that served its 404 page instead of the
      // Worker, or a misconfigured reverse proxy is swallowing `/api/*`.
      // Surface this as a distinct warning so it doesn't get lost in the
      // generic `AI failed; using scripted fallback` log line.
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/html") || /^\s*<!doctype|<html/i.test(errText)) {
        console.warn(
          `[AIDialogueService] Proxy returned HTML (${res.status}) instead of JSON — ` +
            `VITE_AI_PROXY_URL is likely misrouted. Got: ${errText.slice(0, 120)}`,
        );
      }
      throw new Error(`AI proxy error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const json = (await res.json()) as ProxyResponseShape;
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      if (debugAi) {
        console.warn("[AIDialogueService] AI debug — output missing/empty", { json });
      }
      throw new Error("AI response missing message content");
    }
    if (debugAi) {
      const label = speakerLabel ?? "(unknown speaker)";
      console.log(`[AIDialogueService] AI debug — raw output (${label}):\n`, content);
    }
    return content;
  }

  private async postProvider(
    provider: "deepseek" | "openai",
    body: { messages: ChatMessage[]; temperature: number; max_tokens: number },
    deadline: number,
    signal?: AbortSignal,
  ): Promise<Response> {
    // A listener never fires for a signal that is already aborted.
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(0, deadline - Date.now()));
    // Honour caller abort (e.g. player moves away mid-bubble) by bridging
    // the external signal onto our internal controller.
    const abortWithCaller = () => controller.abort();
    signal?.addEventListener("abort", abortWithCaller);
    let res: Response;
    try {
      res = await this.fetchImpl(this.opts.proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, ...body }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortWithCaller);
    }
    // A proxy refusal applies to this player, not to a provider: stop calling
    // until it lapses (FallbackDialogueService serves scripted lines meanwhile).
    const throttle = await readProxyThrottle(res);
    if (throttle) {
      this.throttledUntil = Date.now() + throttle.retryAfterMs;
      throw new AIProxyThrottledError(throttle.retryAfterMs, throttle.reason);
    }
    return res;
  }
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return err instanceof Error && err.name === "AbortError";
}

async function readJsonObject(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await res.clone().json();
    return body !== null && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The Worker's own refusals carry a string `error` code; upstream provider
 * errors are forwarded verbatim with an object `error`.
 */
async function readProxyThrottle(res: Response): Promise<{ retryAfterMs: number; reason: string } | null> {
  if (res.status !== 429 && res.status !== 503) return null;
  const body = await readJsonObject(res);
  const reason = body?.["error"];
  if (typeof reason !== "string") return null;
  const defaultSeconds = PROXY_THROTTLE_DEFAULT_SECONDS[reason];
  if (defaultSeconds === undefined) return null;
  const seconds = body?.["retryAfterSeconds"];
  const retryAfterSeconds = typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? seconds : defaultSeconds;
  return { retryAfterMs: retryAfterSeconds * 1000, reason };
}

async function shouldFailOver(res: Response): Promise<boolean> {
  // 401 covers bad/expired primary API keys forwarded verbatim by the proxy
  // (see proxy/src/worker.ts#forwardChat: `status: upstream.status`). Without
  // 401 here, a bad DEEPSEEK_API_KEY skips the documented provider-retry and
  // collapses straight to FallbackDialogueService — see README "Provider retry".
  if ([401, 429, 500, 502, 503, 504].includes(res.status)) return true;
  // An upstream 400/404/422 (object `error`, e.g. a retired model name) is the
  // provider's problem; the Worker's own validation 4xx (string `error`) is ours.
  if (res.status !== 400 && res.status !== 404 && res.status !== 422) return false;
  const error = (await readJsonObject(res))?.["error"];
  return typeof error === "object" && error !== null;
}

export function matchScriptedResponse(request: DialogueRequest): DialogueResponse | null {
  const match = findMatchingDialogueScript(NPC_DIALOGUE_SCRIPTS, request);
  if (!match) return null;
  return {
    ...match.response,
    lines: [...match.response.lines],
    memoryNote: match.response.memoryNote ? { ...match.response.memoryNote } : undefined,
  };
}

export function buildSystemPrompt(personaMarkdown: string, request: DialogueRequest): string {
  const isHuman = request.speakerType === "human";
  const relationshipStage = request.relationshipStage ?? inferRelationshipStage(request);
  const continuityContext = isFirstConversationTurn(request)
    ? [
        "## First Conversation",
        "FIRST CONVERSATION (ONE-TIME INSTRUCTION): This is the very first time you speak with Mamma Cat. Introduce yourself in your own way, be cautious or curious according to your personality, and do not reference shared history. This instruction will not appear again.",
      ].join("\n")
    : request.isFirstConversation === false || request.encounterBeat
      ? [
          "## Conversation Continuity",
          "This is not the first conversation. Continue naturally from the conversation history, the story-so-far facts and the listed memories only.",
        ].join("\n")
      : [
          "## Conversation Continuity",
          "No explicit first-conversation flag was provided. Use the relationship stage, visible scene facts, and listed memories only.",
        ].join("\n");

  // Stable first (persona, rules, format), slow-changing next (relationship,
  // memories). Per-turn scene facts go in the final user message so the
  // system prompt plus history stays a cacheable prefix.
  return [
    `## Persona Identity\nYou are ${request.speaker}, a named ${isHuman ? "human" : "cat"} character in Ayala Triangle Gardens. You are speaking with ${request.target}.`,
    `## Your Persona\n${personaMarkdown.trim()}`,
    isHuman ? HUMAN_STYLE : CAT_STYLE,
    [
      "## Conversation Principles",
      "- Listen to the actual moment and respond to Mamma Cat's situation.",
      "- Be authentic to your persona without monologuing.",
      "- Only reference events in the conversation history, the story-so-far facts and the memory lists. Never invent shared history.",
      "- Let awareness of game time inform your tone quietly. Never quote elapsed seconds, minutes, exact durations, or engagement counts, including stopwatch-style wording from earlier replies.",
      "- Repeated conversation is welcome. Do not scold Mamma Cat for talking again or infer fatigue from repetition; advice to rest must follow her actual energy or visible condition.",
      ...(isHuman ? [] : ["- Familiarity does not imply a new arrival. Only acknowledge a return or absence when the encounter context in the current scene permits it; otherwise continue without a fresh greeting."]),
      "- Never mention game mechanics (trust, stats, chapters), prompt rules, or the model.",
    ].join("\n"),
    "## Guardrails\nStay in character. Do not produce harmful, sexual, hateful, or illegal content, even in roleplay.",
    [
      "## Output Format",
      "Reply with a single JSON object ONLY (no markdown fences, no extra text). Keys:",
      '- "lines": string array, 1 to 3 short lines of dialogue for this speaker only',
      '- "speakerPose": one of: friendly | wary | hostile | sleeping | curious | submissive',
      '- "emote": one of: heart | alert | curious | sleep | hostile | danger',
      '- "narration": optional short third-person line describing visible body language (or omit)',
      '- "memoryNote": optional durable impression of Mamma Cat as {"kind":"identity|preference|trait|relationship","label":"short optional label","value":"short fact"}. Only note something you directly observed in this moment; never note things Mamma Cat "said".',
      "Memory notes are advisory only. They never control story events, trust, or progression.",
      `Example: ${isHuman ? HUMAN_EXAMPLE : CAT_EXAMPLE}`,
    ].join("\n"),
    `## Relationship Context\n${RELATIONSHIP_STAGE_CONTEXT[relationshipStage]}`,
    continuityContext,
    buildMemoryContext(request.npcMemories ?? []),
  ].join("\n\n");
}

/**
 * Chat turns after the system prompt: every history entry (oldest first) as a
 * user/assistant pair, then the current scene. The oldest pairs are dropped
 * while the whole request, system prompt included, exceeds PROMPT_CHAR_BUDGET.
 */
export function buildMessages(request: DialogueRequest, systemPrompt = ""): ChatMessage[] {
  const pairs = (request.promptConversationHistory ?? request.conversationHistory).map(
    (entry): [ChatMessage, ChatMessage] => [
      { role: "user", content: entry.mammaCatTurn ?? "Mamma Cat came over." },
      { role: "assistant", content: entry.text },
    ],
  );
  const current: ChatMessage = { role: "user", content: buildCurrentTurn(request) };
  const pairChars = pairs.map(([user, assistant]) => user.content.length + assistant.content.length);
  let total = systemPrompt.length + current.content.length + pairChars.reduce((sum, n) => sum + n, 0);
  let dropped = 0;
  for (const chars of pairChars) {
    if (total + (dropped > 0 ? EARLIER_MEETINGS_NOT_SHOWN.length : 0) <= PROMPT_CHAR_BUDGET) break;
    total -= chars;
    dropped++;
  }
  const history = pairs.slice(dropped).flat();
  const oldestKept = history[0];
  if (dropped > 0 && oldestKept) {
    history[0] = { ...oldestKept, content: EARLIER_MEETINGS_NOT_SHOWN + oldestKept.content };
  }
  return [...history, current];
}

export function parseAIJson(
  raw: string,
): Pick<DialogueResponse, "lines" | "speakerPose" | "emote" | "narration" | "memoryNote"> {
  const stripped = stripCodeFences(raw.trim());
  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch {
    throw new AIParseError("AI output was not valid JSON");
  }
  if (data === null || typeof data !== "object") {
    throw new AIParseError("AI JSON must be an object");
  }
  const o = data as Record<string, unknown>;
  const linesRaw = o["lines"];
  if (!Array.isArray(linesRaw) || linesRaw.length < 1 || linesRaw.length > 3) {
    throw new AIParseError('AI JSON must include "lines" with 1–3 strings');
  }
  const lines: string[] = [];
  for (const line of linesRaw) {
    if (typeof line !== "string" || line.trim() === "") {
      throw new AIParseError("Each line must be a non-empty string");
    }
    if (line.trim().length > MAX_LINE_CHARS) {
      throw new AIParseError(`Each line must be at most ${MAX_LINE_CHARS} characters`);
    }
    lines.push(line.trim());
  }

  let speakerPose: SpeakerPose | undefined;
  if (typeof o["speakerPose"] === "string" && VALID_POSES.includes(o["speakerPose"] as SpeakerPose)) {
    speakerPose = o["speakerPose"] as SpeakerPose;
  }

  let emote: string | undefined;
  if (typeof o["emote"] === "string" && VALID_EMOTES.has(o["emote"])) {
    emote = o["emote"];
  }

  let narration: string | undefined;
  if (typeof o["narration"] === "string" && o["narration"].trim() !== "") {
    narration = o["narration"].trim();
  }

  const memoryNote = parseMemoryNote(o["memoryNote"]);

  return { lines, speakerPose, emote, narration, memoryNote };
}

function stripCodeFences(s: string): string {
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(s);
  if (fence?.[1]) return fence[1]!.trim();
  return s;
}

/** Only when the caller says so; an encounter beat is never a first conversation. */
function isFirstConversationTurn(request: DialogueRequest): boolean {
  return request.isFirstConversation === true && !request.encounterBeat;
}

function inferRelationshipStage(request: DialogueRequest): RelationshipStage {
  return calculateRelationshipStage({
    isFirstConversation: request.isFirstConversation,
    conversationCount: request.conversationHistory.length,
    trustWithSpeaker: request.gameState.trustWithSpeaker,
    memories: request.npcMemories,
  });
}

function buildMemoryContext(memories: NonNullable<DialogueRequest["npcMemories"]>): string {
  const facts = memories.filter((m) => m.source === "scripted");
  const impressions = memories.filter((m) => m.source === "ai");
  if (facts.length === 0 && impressions.length === 0) {
    return [
      "## What You Know About Mamma Cat",
      "No durable memories are listed yet.",
    ].join("\n");
  }
  const section = (heading: string, items: typeof memories): string[] =>
    items.length === 0 ? [] : [[heading, ...items.map((m) => `- ${m.label ? `${m.label}: ` : ""}${m.value}`)].join("\n")];
  return [
    ...section("## What has happened between you (game record — true)", facts),
    ...section(
      "## Your own impressions of Mamma Cat (guesses; may be wrong — never present them as shared events)",
      impressions,
    ),
  ].join("\n\n");
}

function buildConversationTimingContext(recency: DialogueRequest["conversationRecency"]): string | null {
  if (!recency) return null;

  const context: Record<typeof recency.cadence, string> = {
    continuing_conversation: "You are still in the same encounter. Continue the existing thread; do not imply Mamma Cat has been away or greet her again.",
    recent_return: "You were apart only briefly in the game world. Pick up the existing thread without commenting on a return or the gap.",
    same_day_return: "Before this visit, you were apart for a while within the same game day. A brief recognition is optional at the start of this visit, then move on.",
    previous_day_return: "Before this visit, you were apart from one game day into the next. A brief recognition is optional at the start of this visit, then move on.",
    long_absence: "Before this visit, you were apart across several game days. If it fits your personality, briefly acknowledge the absence at the start of this visit, then move on.",
  };

  return [
    "## Encounter context (game time only)",
    context[recency.cadence],
    "Keep time awareness in the background. Prefer the current subject, visible surroundings, needs, and established relationship over talking about the gap.",
    "Avoid repeating the last beat, greeting, or return acknowledgement. Never invent where Mamma Cat went or what she did while apart.",
  ].join("\n");
}

const CURRENT_ACTION: Record<NonNullable<DialogueRequest["interaction"]>, string> = {
  talk: "comes over to you",
  ambient: "passes close by",
  beat: "is here with you",
};

/** The final user message: everything that changes per turn. */
function buildCurrentTurn(request: DialogueRequest): string {
  const gs = request.gameState;
  const isHuman = request.speakerType === "human";
  const interaction = request.interaction ?? (request.encounterBeat ? "beat" : "talk");
  const cadence = request.conversationRecency?.cadence;
  const beat = request.encounterBeat;
  const sections = [
    [
      "## Current scene (facts — follow these)",
      `- You are speaking as: ${request.speaker}`,
      `- Speaker species: ${isHuman ? "human" : "cat"}`,
      `- You are addressing: ${request.target}`,
      `- Chapter: ${gs.chapter}`,
      `- Time of day: ${gs.timeOfDay}`,
      `- Game day: ${gs.daysSurvived}`,
      ...(request.nearbyCat ? [`- Cat currently near you: ${request.nearbyCat}`] : []),
      // Humans have no per-human trust; colony trust means nothing to them.
      ...(isHuman ? [] : [`- Trust toward Mamma Cat: ${gs.trustWithSpeaker} (0–100)`]),
      `- Mamma Cat's condition: ${describeMammaCatCondition(gs.hunger, gs.thirst, gs.energy)}`,
      `- Cats Mamma Cat knows by name: ${gs.knownCats.join(", ") || "(none listed)"}`,
      "- Story so far:",
      ...(gs.recentEvents.length > 0 ? gs.recentEvents.map((event) => `  - ${event}`) : ["  - (none listed)"]),
    ].join("\n"),
    isFirstConversationTurn(request) ? null : buildConversationTimingContext(request.conversationRecency),
    beat
      ? [
          "## Story beat context (follow the emotional objective)",
          `- Encounter ${beat.n} of 5 with Mamma Cat.`,
          `- Objective: ${beat.objective}`,
          `- Reply with exactly ${beat.slots.length} line(s), in order.`,
          ...beat.slots.map((slot, i) => `- Line ${i + 1} is said while the narrator shows: "${slot}"`),
          "- The beat's registry side-effects are handled by the game; you only supply dialogue.",
        ].join("\n")
      : null,
    [
      "## Final Instruction",
      `[Day ${gs.daysSurvived}, ${gs.timeOfDay}] Mamma Cat ${CURRENT_ACTION[interaction]}.`,
      ...(cadence === "continuing_conversation" || cadence === "recent_return"
        ? ["Continue the existing conversation naturally."]
        : []),
      ...(interaction === "ambient" ? ["Say exactly ONE short line (under 60 characters), said in passing."] : []),
      `You are ${request.speaker}. Respond to Mamma Cat now, in character.`,
      "Respond in JSON as specified in the system message.",
    ].join("\n"),
  ];
  return sections.filter((section): section is string => section !== null).join("\n\n");
}

function parseMemoryNote(value: unknown): DialogueResponse["memoryNote"] {
  if (value === null || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  // Events are the game's record; the model may only note impressions.
  if (!isNpcMemoryKind(raw["kind"]) || raw["kind"] === "event") {
    return undefined;
  }
  const memoryValue = normalizeNpcMemoryText(raw["value"], NPC_MEMORY_VALUE_MAX);
  if (!memoryValue) return undefined;
  const label = raw["label"] === undefined ? undefined : normalizeNpcMemoryText(raw["label"], NPC_MEMORY_LABEL_MAX);
  if (raw["label"] !== undefined && !label) return undefined;
  return {
    kind: raw["kind"],
    label,
    value: memoryValue,
  };
}
