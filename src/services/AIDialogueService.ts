/**
 * AI-backed dialogue via same-origin proxy (Cloudflare Worker).
 * Story progression `event` is taken from scripted conditions (authoritative).
 */

import { CAT_DIALOGUE_SCRIPTS } from "../data/cat-dialogue";
import type { DialogueRequest, DialogueResponse, DialogueService, SpeakerPose } from "./DialogueService";

export class AIParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIParseError";
  }
}

const VALID_POSES: SpeakerPose[] = [
  "friendly",
  "wary",
  "hostile",
  "sleeping",
  "curious",
  "submissive",
];

/** Emote keys understood by EmoteSystem (not raw glyphs). */
const VALID_EMOTES = new Set(["heart", "alert", "curious", "sleep", "hostile", "danger"]);

const HARSHER_TEMP_SPEAKERS = new Set([
  "Tiger",
  "Fluffy",
  "Pedigree",
  "Ginger",
  "Ginger B",
]);

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
}

export class AIDialogueService implements DialogueService {
  private readonly fetchImpl: typeof fetch;
  private readonly primaryProvider: "deepseek" | "openai";
  private readonly secondaryProvider: "deepseek" | "openai";

  constructor(
    private readonly opts: AIDialogueServiceOptions,
  ) {
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.primaryProvider = opts.primaryProvider ?? "deepseek";
    this.secondaryProvider = opts.secondaryProvider ?? "openai";
  }

  async getDialogue(request: DialogueRequest): Promise<DialogueResponse> {
    const persona = this.opts.personas[request.speaker];
    if (!persona) {
      throw new Error(`No AI persona loaded for speaker: ${request.speaker}`);
    }

    const scripted = matchScriptedResponse(request);
    const systemPrompt = buildSystemPrompt(persona, request);
    const messages = buildMessages(request);
    const temperature = HARSHER_TEMP_SPEAKERS.has(request.speaker) ? 0.6 : 0.8;

    const raw = await this.callLLMWithFallback(systemPrompt, messages, temperature);
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
  ): Promise<string> {
    const payloadBase = {
      messages: [{ role: "system" as const, content: systemPrompt }, ...messages],
      temperature,
      max_tokens: 150,
    };

    let res = await this.postProvider(this.primaryProvider, payloadBase);
    if (shouldRetryWithFallback(res.status)) {
      res = await this.postProvider(this.secondaryProvider, payloadBase);
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
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      return await this.fetchImpl(this.opts.proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, ...body }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
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
  const scene = [
    "## Current scene (facts — follow these)",
    `- You are speaking as: ${request.speaker}`,
    `- You are addressing: ${request.target}`,
    `- Chapter: ${gs.chapter}`,
    `- Time of day: ${gs.timeOfDay}`,
    `- Trust with you toward Mamma Cat: ${gs.trustWithSpeaker} (0–100)`,
    `- Global colony trust: ${gs.trustGlobal} (0–100)`,
    `- Mamma Cat hunger / thirst / energy: ${gs.hunger} / ${gs.thirst} / ${gs.energy}`,
    `- Days survived (game): ${gs.daysSurvived}`,
    `- Cats Mamma Cat knows by name: ${gs.knownCats.join(", ") || "(none listed)"}`,
    "",
    "## Your persona (stay in character)",
    personaMarkdown.trim(),
    "",
    "## Output format",
    "Reply with a single JSON object ONLY (no markdown fences, no extra text). Keys:",
    '- "lines": string array, 1 to 3 short lines of dialogue for this NPC only',
    '- "speakerPose": one of: friendly | wary | hostile | sleeping | curious | submissive',
    '- "emote": one of: heart | alert | curious | sleep | hostile | danger',
    '- "narration": optional short third-person line describing visible body language (or omit)',
    "",
    "Cats use short cat-speak (mrrp, prrp, hisses) — not human paragraphs. Humans are not in this reply (you are a cat).",
    'Example: {"lines":["Mrrp. You came back."],"speakerPose":"friendly","emote":"heart","narration":"Tail tip curls."}',
  ].join("\n");

  return scene;
}

export function buildMessages(request: DialogueRequest): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  const recent = request.conversationHistory.slice(-20);
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

export function parseAIJson(raw: string): Pick<
  DialogueResponse,
  "lines" | "speakerPose" | "emote" | "narration"
> {
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
