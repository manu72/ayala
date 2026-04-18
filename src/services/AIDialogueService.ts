/**
 * AI-backed dialogue via same-origin proxy (Cloudflare Worker).
 * Story progression `event` is taken from scripted conditions (authoritative).
 */

import { PERSONA_TIER } from "../ai/personas";
import { CAT_DIALOGUE_SCRIPTS } from "../data/cat-dialogue";
import type { DialogueRequest, DialogueResponse, DialogueService, SpeakerPose } from "./DialogueService";

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

    const raw = await this.callLLMWithFallback(systemPrompt, messages, temperature, callOpts);
    const parsed = parseAIJson(raw);

    return {
      lines: parsed.lines,
      speakerPose: parsed.speakerPose ?? scripted?.speakerPose,
      emote: parsed.emote ?? scripted?.emote,
      narration: parsed.narration ?? scripted?.narration,
      trustChange: scripted?.trustChange,
      event: scripted?.event,
    };
  }

  private async callLLMWithFallback(
    systemPrompt: string,
    messages: ChatMessage[],
    temperature: number,
    callOpts?: AIDialogueCallOptions,
  ): Promise<string> {
    const payloadBase = {
      messages: [{ role: "system" as const, content: systemPrompt }, ...messages],
      temperature,
      max_tokens: 150,
    };

    let res = await this.postProvider(this.primaryProvider, payloadBase, callOpts);
    if (shouldRetryWithFallback(res.status)) {
      res = await this.postProvider(this.secondaryProvider, payloadBase, callOpts);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`AI proxy error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const json = (await res.json()) as ProxyResponseShape;
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new Error("AI response missing message content");
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

function shouldRetryWithFallback(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
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

  // Species-specific output guidance — cats speak cat-speak; humans speak
  // naturally but briefly. The JSON contract is identical for both so
  // downstream parsing stays species-agnostic.
  const speechGuidance = isHuman
    ? "Humans speak plainly and briefly — one short sentence per line, two at most. No cat-speak. No baby-talk. Leave room for silence."
    : "Cats use short cat-speak (meow, mrrp, prrp, hiss, purr) — not human paragraphs. Humans are not in this reply (you are a cat).";
  const exampleJson = isHuman
    ? '{"lines":["You came back."],"speakerPose":"friendly","emote":"heart","narration":"She crouches low."}'
    : '{"lines":["Meow to you mamma cat. You came back purrr."],"speakerPose":"friendly","emote":"heart","narration":"Tail tip curls."}';

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
    nearbyCatLine,
  ];

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
    "## Your persona (stay in character)",
    personaMarkdown.trim(),
    "",
    "## Output format",
    "Reply with a single JSON object ONLY (no markdown fences, no extra text). Keys:",
    '- "lines": string array, 1 to 3 short lines of dialogue for this speaker only',
    '- "speakerPose": one of: friendly | wary | hostile | sleeping | curious | submissive',
    '- "emote": one of: heart | alert | curious | sleep | hostile | danger',
    '- "narration": optional short third-person line describing visible body language (or omit)',
    "",
    speechGuidance,
    `Example: ${exampleJson}`,
  );

  return sceneLines.filter((l): l is string => l !== null).join("\n");
}

export function buildMessages(request: DialogueRequest): ChatMessage[] {
  // Tier 2 speakers get a shorter history window so the prompt stays compact
  // and cheap. Unknown speakers default to the richer tier-1 window so new
  // speakers do not silently lose context.
  const tier = PERSONA_TIER[request.speaker] ?? "tier1";
  const windowSize = tier === "tier2" ? 10 : 20;

  const msgs: ChatMessage[] = [];
  const recent = request.conversationHistory.slice(-windowSize);
  for (const entry of recent) {
    msgs.push({ role: "user", content: "Mamma Cat is nearby; you exchange a moment in the gardens." });
    msgs.push({ role: "assistant", content: entry.text });
  }
  msgs.push({
    role: "user",
    content: [
      "Mamma Cat is here with you now for a new exchange.",
      `Her hunger ${request.gameState.hunger}, energy ${request.gameState.energy}.`,
      "Respond in JSON as specified in the system message.",
    ].join(" "),
  });
  return msgs;
}

export function parseAIJson(raw: string): Pick<DialogueResponse, "lines" | "speakerPose" | "emote" | "narration"> {
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

  return { lines, speakerPose, emote, narration };
}

function stripCodeFences(s: string): string {
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(s);
  if (fence?.[1]) return fence[1]!.trim();
  return s;
}
