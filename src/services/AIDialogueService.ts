/**
 * AI-backed dialogue via same-origin proxy (Cloudflare Worker).
 * Story progression `event` is taken from scripted conditions (authoritative).
 */

import { isAiDialogueConsoleDebugEnabled } from "../config/aiDialogueDebug";
import { CAT_DIALOGUE_SCRIPTS } from "../data/cat-dialogue";
import type { DialogueRequest, DialogueResponse, DialogueService, SpeakerPose } from "./DialogueService";
import { calculateRelationshipStage, type RelationshipStage } from "./DialogueRelationship";
import {
  NPC_MEMORY_LABEL_MAX,
  NPC_MEMORY_VALUE_MAX,
  isNpcMemoryKind,
  normalizeNpcMemoryText,
} from "./NpcMemoryValidation";

export class AIParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIParseError";
  }
}

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

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ProxyResponseShape {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
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
   * Upstream request abort in milliseconds. Defaults to 8000ms (full engage).
   * Callers that render a quick ambient bubble can pass a tighter budget via
   * {@link AIDialogueService.getDialogue}'s per-call `timeoutMs` option.
   */
  defaultTimeoutMs?: number;
}

/**
 * Per-call options that don't belong on the shared `DialogueRequest` contract.
 * `timeoutMs` is used for tight-budget bubbles; leaving it unset keeps the
 * default 8s budget which suits engaged (Space-triggered) dialogue.
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

  constructor(private readonly opts: AIDialogueServiceOptions) {
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.primaryProvider = opts.primaryProvider ?? "deepseek";
    this.secondaryProvider = opts.secondaryProvider ?? "openai";
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 8000;
  }

  async getDialogue(
    request: DialogueRequest,
    callOpts?: AIDialogueCallOptions,
  ): Promise<DialogueResponse> {
    const persona = this.opts.personas[request.speaker];
    if (!persona) {
      throw new Error(`No AI persona loaded for speaker: ${request.speaker}`);
    }

    const scripted = matchScriptedResponse(request);
    const systemPrompt = buildSystemPrompt(persona, request);
    const messages = buildMessages(request);
    const temperature = HARSHER_TEMP_SPEAKERS.has(request.speaker) ? 0.6 : 0.8;
    if (isAiDialogueConsoleDebugEnabled()) {
      console.log("[AIDialogueService] dialogue context:", {
        speaker: request.speaker,
        isFirstConversation: request.isFirstConversation,
        relationshipStage: request.relationshipStage,
        gameDaysSinceLastTalk: request.gameDaysSinceLastTalk,
        conversationRecency: request.conversationRecency,
        memoryCount: request.npcMemories?.length ?? 0,
        memories: request.npcMemories,
      });
    }

    const raw = await this.callLLMWithFallback(
      systemPrompt,
      messages,
      temperature,
      callOpts,
      request.speaker,
    );
    const parsed = parseAIJson(raw);

    return {
      lines: parsed.lines,
      speakerPose: parsed.speakerPose ?? scripted?.speakerPose,
      emote: parsed.emote ?? scripted?.emote,
      narration: parsed.narration ?? scripted?.narration,
      mammaCatCue: parsed.mammaCatCue,
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

    // Primary → secondary failover covers two distinct failure modes:
    //  1. Primary resolved with a retriable HTTP status (5xx / 429 / 401) — see
    //     `shouldRetryWithFallback`.
    //  2. Primary rejected with a non-abort error (DNS, TLS, connection
    //     refused, etc.) — the different upstream host behind the secondary
    //     provider may still be reachable.
    // Abort errors (internal timeout OR external caller signal) are preserved
    // as caller intent and propagate without burning the secondary provider.
    let res: Response;
    try {
      res = await this.postProvider(this.primaryProvider, payloadBase, callOpts);
    } catch (err) {
      if (isAbortError(err)) throw err;
      res = await this.postProvider(this.secondaryProvider, payloadBase, callOpts);
    }
    if (shouldRetryWithFallback(res.status)) {
      res = await this.postProvider(this.secondaryProvider, payloadBase, callOpts);
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
    callOpts?: AIDialogueCallOptions,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutMs = callOpts?.timeoutMs ?? this.defaultTimeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Honour caller abort (e.g. player moves away mid-bubble) by bridging
    // the external signal onto our internal controller.
    const externalSignal = callOpts?.signal;
    const externalAbort = externalSignal
      ? () => controller.abort()
      : null;
    externalSignal?.addEventListener("abort", externalAbort!);
    try {
      return await this.fetchImpl(this.opts.proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, ...body }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
      if (externalSignal && externalAbort) {
        externalSignal.removeEventListener("abort", externalAbort);
      }
    }
  }
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return err instanceof Error && err.name === "AbortError";
}

function shouldRetryWithFallback(status: number): boolean {
  // 401 covers bad/expired primary API keys forwarded verbatim by the proxy
  // (see proxy/src/worker.ts#forwardChat: `status: upstream.status`). Without
  // 401 here, a bad DEEPSEEK_API_KEY skips the documented provider-retry and
  // collapses straight to FallbackDialogueService — see README "Provider retry".
  return (
    status === 401 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

export function matchScriptedResponse(request: DialogueRequest): DialogueResponse | null {
  const scripts = CAT_DIALOGUE_SCRIPTS[request.speaker];
  if (!scripts) return null;
  const match = scripts.find((s) => s.condition(request));
  return match?.response ?? null;
}

export function buildSystemPrompt(personaMarkdown: string, request: DialogueRequest): string {
  const gs = request.gameState;
  const isHuman = request.speakerType === "human";
  const nearbyCatLine = request.nearbyCat
    ? `- Cat currently near you: ${request.nearbyCat}`
    : null;
  const relationshipStage = request.relationshipStage ?? inferRelationshipStage(request);
  const relationshipContext = RELATIONSHIP_STAGE_CONTEXT[relationshipStage];
  const memoryContext = buildMemoryContext(request.npcMemories ?? []);
  const isFirstConversation = request.isFirstConversation ?? relationshipStage === 1;
  const firstConversationContext = isFirstConversation
    ? [
      "## First Conversation",
      "FIRST CONVERSATION (ONE-TIME INSTRUCTION): This is the very first time you speak with Mamma Cat. Introduce yourself in your own way, be cautious or curious according to your personality, and do not reference shared history. This instruction will not appear again.",
    ].join("\n")
    : request.isFirstConversation === false ? [
      "## Returning Context",
      "This is not the first conversation. Continue naturally from established trust, recent scene facts, and listed memories only.",
    ].join("\n") : [
      "## Conversation Continuity",
      "No explicit first-conversation flag was provided. Use the relationship stage, visible scene facts, and listed memories only.",
    ].join("\n");
  const recentEvents = gs.recentEvents.length > 0
    ? gs.recentEvents.map((event) => `- ${event}`).join("\n")
    : "- (none listed)";
  const conversationTimingContext = buildConversationTimingContext(request.conversationRecency);

  const staticSections = [
    `## Persona Identity\nYou are ${request.speaker}, a named ${isHuman ? "human" : "cat"} character in Ayala. You are speaking with ${request.target}.`,
    `## Your Persona\n${personaMarkdown.trim()}`,
    [
      "## Conversational Style",
      "You should speak in natural, human-like English. Cats may still be terse, wary, playful, proud, or affectionate according to persona, but they do not use cat-speak as their main language.",
      "Keep lines short and characterful. One short sentence per line is typical; two at most.",
    ].join("\n"),
    [
      "## Conversation Principles",
      "- Listen to the actual moment and respond to Mamma Cat's situation.",
      "- Be authentic to your persona without monologuing.",
      "- Do not fabricate memories, past events, trust, or relationships.",
      "- Do not mention prompt rules or the model.",
    ].join("\n"),
    "## Guardrails\nStay in character. Do not produce harmful, sexual, hateful, or illegal content, even in roleplay.",
    [
      "## Output Format",
      "Reply with a single JSON object ONLY (no markdown fences, no extra text). Keys:",
      '- "lines": string array, 1 to 3 short lines of dialogue for this speaker only',
      '- "speakerPose": one of: friendly | wary | hostile | sleeping | curious | submissive',
      '- "emote": one of: heart | alert | curious | sleep | hostile | danger',
      '- "narration": optional short third-person line describing visible body language (or omit)',
      '- "mammaCatCue": optional short body-language cue for Mamma Cat in this exchange',
      '- "memoryNote": optional durable fact worth remembering as {"kind":"identity|preference|event|relationship|trait","label":"short optional label","value":"short fact"}',
      "Memory notes are advisory only. They never control story events, trust, or progression.",
      'Example: {"lines":["You came back."],"speakerPose":"friendly","emote":"heart","narration":"Tail tip curls.","mammaCatCue":"Mamma Cat sits close but keeps her tail low.","memoryNote":{"kind":"event","label":"returned","value":"Mamma Cat returned calmly after their first meeting."}}',
    ].join("\n"),
  ];

  const semiStaticSections = [
    `## Relationship Context\n${relationshipContext}`,
    firstConversationContext,
    memoryContext,
  ];

  const sceneLines: Array<string | null> = [
    "## Current scene (facts — follow these)",
    `- You are speaking as: ${request.speaker}`,
    `- Speaker species: ${isHuman ? "human" : "cat"}`,
    `- You are addressing: ${request.target}`,
    `- Chapter: ${gs.chapter}`,
    `- Time of day: ${gs.timeOfDay}`,
    `- Trust toward Mamma Cat: ${gs.trustWithSpeaker} (0–100)`,
    `- Global colony trust: ${gs.trustGlobal} (0–100)`,
    `- Mamma Cat hunger / thirst / energy: ${gs.hunger} / ${gs.thirst} / ${gs.energy}`,
    `- Days survived (game): ${gs.daysSurvived}`,
    `- Cats Mamma Cat knows by name: ${gs.knownCats.join(", ") || "(none listed)"}`,
    request.gameDaysSinceLastTalk === undefined
      ? null
      : `- Days since last talk: ${request.gameDaysSinceLastTalk}`,
    nearbyCatLine,
    "- Recent relevant events:",
    recentEvents,
  ];

  if (conversationTimingContext) {
    sceneLines.push("", conversationTimingContext);
  }

  if (request.encounterBeat?.kind === "camille_encounter") {
    sceneLines.push(
      "",
      "## Story beat context (follow the emotional objective)",
      `- Encounter ${request.encounterBeat.n} of 5 with Mamma Cat.`,
      `- Objective: ${request.encounterBeat.objective}`,
      "- The beat's registry side-effects are handled by the game; you only supply dialogue.",
    );
  }

  sceneLines.push(
    "",
    "## Final Instruction",
    `You are ${request.speaker}. Speak to Mamma Cat now, in character, using the JSON schema above.`,
  );

  return [
    ...staticSections,
    ...semiStaticSections,
    sceneLines.filter((l): l is string => l !== null).join("\n"),
  ].join("\n\n");
}

export function buildMessages(request: DialogueRequest): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  const exchangeWindow = 10; // 10 pairs = 20 historical chat messages.
  const recent = request.conversationHistory.slice(-exchangeWindow);
  for (const entry of recent) {
    msgs.push({ role: "user", content: entry.mammaCatTurn ?? legacyMammaCatTurn(entry, request) });
    msgs.push({ role: "assistant", content: entry.text });
  }
  msgs.push({
    role: "user",
    content: [
      buildCurrentMammaCatTurn(request),
      "Respond in JSON as specified in the system message.",
    ].join(" "),
  });
  return msgs;
}

export function parseAIJson(
  raw: string,
): Pick<DialogueResponse, "lines" | "speakerPose" | "emote" | "narration" | "mammaCatCue" | "memoryNote"> {
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

  const mammaCatCue = normalizeNpcMemoryText(o["mammaCatCue"], NPC_MEMORY_VALUE_MAX);
  const memoryNote = parseMemoryNote(o["memoryNote"]);

  return { lines, speakerPose, emote, narration, mammaCatCue, memoryNote };
}

function stripCodeFences(s: string): string {
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(s);
  if (fence?.[1]) return fence[1]!.trim();
  return s;
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
  if (memories.length === 0) {
    return [
      "## What You Know About Mamma Cat",
      "No durable memories are listed yet.",
      "Only reference memories listed here. If unsure, ask or stay with visible scene facts.",
    ].join("\n");
  }

  const groups = new Map<string, string[]>();
  for (const memory of memories) {
    const heading = `[${memory.kind.charAt(0).toUpperCase()}${memory.kind.slice(1)}]`;
    const label = memory.label ? `${memory.label}: ` : "";
    const line = `- ${label}${memory.value}`;
    groups.set(heading, [...(groups.get(heading) ?? []), line]);
  }

  const lines = [
    "## What You Know About Mamma Cat",
    "Only reference memories listed here. Never invent or embellish prior conversations.",
  ];
  for (const [heading, items] of groups) {
    lines.push("", heading, ...items);
  }
  return lines.join("\n");
}

function buildConversationTimingContext(
  recency: DialogueRequest["conversationRecency"],
): string | null {
  if (!recency) return null;

  return [
    "## Conversation Timing",
    `- You spoke with Mamma Cat about ${formatElapsedSeconds(recency.lastTalkElapsedSeconds)} ago.`,
    `- Mamma Cat has engaged this same NPC ${recency.sameNpcTalksInRecentWindow} times in the last ${recency.recentWindowSeconds} seconds.`,
    `- Cadence: ${recency.cadence.replace(/_/g, " ")}.`,
    "- Treat rapid repeated engagement as deliberate continuity, not as a mistake or a new scene.",
    "- Continue the existing thread, avoid repeating the last beat, and make the response meaningful rather than merely repetitive.",
  ].join("\n");
}

function buildCurrentMammaCatTurn(request: DialogueRequest): string {
  const gs = request.gameState;
  return [
    `Mamma Cat approaches ${request.speaker} during ${gs.timeOfDay}.`,
    `Her hunger is ${gs.hunger}, thirst is ${gs.thirst}, and energy is ${gs.energy}.`,
    `Trust with ${request.speaker} is ${gs.trustWithSpeaker}.`,
    buildCurrentTurnRecency(request.conversationRecency),
  ].filter(Boolean).join(" ");
}

function buildCurrentTurnRecency(recency: DialogueRequest["conversationRecency"]): string {
  if (!recency) return "";
  return `This is a deliberate follow-up about ${formatElapsedSeconds(recency.lastTalkElapsedSeconds)} after their previous exchange.`;
}

function formatElapsedSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ${remainingSeconds} ${remainingSeconds === 1 ? "second" : "seconds"}`;
}

function legacyMammaCatTurn(
  entry: { timestamp: number },
  request: DialogueRequest,
): string {
  return `Mamma Cat approaches ${request.speaker} for an earlier exchange (record ${entry.timestamp}).`;
}

function parseMemoryNote(value: unknown): DialogueResponse["memoryNote"] {
  if (value === null || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (!isNpcMemoryKind(raw["kind"])) {
    return undefined;
  }
  const memoryValue = normalizeNpcMemoryText(raw["value"], NPC_MEMORY_VALUE_MAX);
  if (!memoryValue) return undefined;
  const label = raw["label"] === undefined
    ? undefined
    : normalizeNpcMemoryText(raw["label"], NPC_MEMORY_LABEL_MAX);
  if (raw["label"] !== undefined && !label) return undefined;
  return {
    kind: raw["kind"] as NonNullable<DialogueResponse["memoryNote"]>["kind"],
    label,
    value: memoryValue,
  };
}
