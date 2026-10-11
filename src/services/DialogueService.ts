/**
 * Centralized dialogue service interface.
 *
 * Phase 4: scripted implementation (ScriptedDialogueService).
 * Phase 5: swap to AI-powered implementation — same interface, different backend.
 *
 * All NPC dialogue flows through this service. The UI layer (DialogueSystem)
 * remains responsible for rendering; this service decides WHAT to say.
 */

import type { ConversationKind, NpcMemory } from "./ConversationStore";
import type { DialogueRecencyContext } from "../utils/dialogueRecency";

// ── Public Interfaces ───────────────────────────────────────────────

export interface DialogueRequest {
  speaker: string;
  speakerType: "cat" | "human";
  target: string;
  gameState: {
    chapter: number;
    timeOfDay: string;
    /** Cats only; humans have no per-human trust and the prompt omits it. */
    trustWithSpeaker: number;
    hunger: number;
    thirst: number;
    energy: number;
    daysSurvived: number;
    knownCats: string[];
    recentEvents: string[];
  };
  conversationHistory: ConversationEntry[];
  /** Optional snapshot-compatible history for AI context; scripted branch selection keeps the full history above. */
  promptConversationHistory?: ConversationEntry[];
  /** What Mamma Cat is doing this turn. Defaults to "beat" with an encounterBeat, else "talk". */
  interaction?: "talk" | "ambient" | "beat";
  /** Prompt-only context derived from existing first-meet logic. */
  isFirstConversation?: boolean;
  /** Relationship warmth stage for prompt tone. */
  relationshipStage?: 1 | 2 | 3 | 4;
  /** Per-NPC memories, already validated by ConversationStore. */
  npcMemories?: NpcMemory[];
  /** Qualitative game-time and encounter context; never wall-clock durations. */
  conversationRecency?: DialogueRecencyContext;
  /**
   * Optional: name of a nearby cat the speaker is engaging (e.g. a feeder
   * greeting a named cat). Used to flavour ambient bubble lines with the
   * cat's identity without changing `target` (which stays "Mamma Cat").
   */
  nearbyCat?: string;
  /**
   * Optional: pinned story beat context for Camille's 5-encounter sequence.
   * Deterministic side-effects (trust, registry, chapter gating) are owned by
   * GameScene; this field tells the LLM the emotional objective of the beat.
   */
  encounterBeat?: {
    kind: "camille_encounter";
    n: 1 | 2 | 3 | 4 | 5;
    objective: string;
    /** Narrator text shown beside each spoken line the AI must supply, in order. */
    slots: string[];
  };
}

export interface ConversationEntry {
  timestamp: number;
  speaker: string;
  gameDay?: number;
  kind?: ConversationKind;
  /** The Mamma Cat side of this previous exchange, if captured. */
  mammaCatTurn?: string;
  text: string;
}

export type SpeakerPose = "friendly" | "wary" | "hostile" | "sleeping" | "curious" | "submissive";

export interface DialogueResponse {
  lines: string[];
  speakerPose?: SpeakerPose;
  emote?: string;
  narration?: string;
  /** Advisory-only memory suggestion. Never drives story state. */
  memoryNote?: {
    kind: NpcMemory["kind"];
    label?: string;
    value: string;
  };
  trustChange?: number;
  event?: string;
  /**
   * A non-verbal stand-in shown when the AI failed and the speaker's scripts
   * are used up: apply its event/trust, but don't persist it as speech.
   */
  placeholder?: boolean;
}

export interface DialogueService {
  getDialogue(request: DialogueRequest): Promise<DialogueResponse>;
}

// ── Scripted Implementation ─────────────────────────────────────────

export interface DialogueScript {
  /** Stable branch identifier for tests/tooling. Story side effects use response.event. */
  id: string;
  condition: (req: DialogueRequest) => boolean;
  response: DialogueResponse;
}

const PLACEHOLDER_BY_POSE: Record<SpeakerPose, string> = {
  friendly: " blinks slowly at you.",
  wary: " watches you, tail low.",
  hostile: "'s ears flatten.",
  curious: " tilts their head at you.",
  submissive: " tilts their head at you.",
  sleeping: " is half asleep.",
};

function dialogueTextSignature(lines: string[]): string {
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function cloneDialogueResponse(response: DialogueResponse): DialogueResponse {
  return {
    ...response,
    lines: [...response.lines],
    memoryNote: response.memoryNote ? { ...response.memoryNote } : undefined,
  };
}

function hasRenderedResponse(request: DialogueRequest, response: DialogueResponse): boolean {
  const expected = dialogueTextSignature(response.lines);
  if (!expected) return false;
  return request.conversationHistory.some((entry) => dialogueTextSignature([entry.text]) === expected);
}

export function findMatchingDialogueScript(
  scripts: Record<string, DialogueScript[]>,
  request: DialogueRequest,
): DialogueScript | null {
  const speakerScripts = scripts[request.speaker];
  if (!speakerScripts) return null;
  return speakerScripts.find((script) => script.condition(request)) ?? null;
}

export function findUnplayedDialogueScript(
  scripts: Record<string, DialogueScript[]>,
  request: DialogueRequest,
): DialogueScript | null {
  const speakerScripts = scripts[request.speaker];
  if (!speakerScripts) return null;
  return speakerScripts.find((script) => script.condition(request) && !hasRenderedResponse(request, script.response)) ?? null;
}

export class ScriptedDialogueService implements DialogueService {
  private scripts: Record<string, DialogueScript[]>;

  constructor(scripts: Record<string, DialogueScript[]>) {
    this.scripts = scripts;
  }

  async getDialogue(request: DialogueRequest): Promise<DialogueResponse> {
    const match = findMatchingDialogueScript(this.scripts, request);
    return match ? cloneDialogueResponse(match.response) : this.getDefaultResponse(request);
  }

  async getUnplayedDialogue(request: DialogueRequest): Promise<DialogueResponse | null> {
    const match = findUnplayedDialogueScript(this.scripts, request);
    return match ? cloneDialogueResponse(match.response) : null;
  }

  async getFallbackDialogue(request: DialogueRequest): Promise<DialogueResponse> {
    const unplayed = await this.getUnplayedDialogue(request);
    if (unplayed) return unplayed;
    if (request.speakerType !== "cat") return this.getDefaultResponse(request);
    // Don't replay used-up words, but keep the matched script's deterministic
    // trust/story fields so AI failure progresses like AI success.
    const match = findMatchingDialogueScript(this.scripts, request)?.response;
    const pose = match?.speakerPose;
    return {
      lines: [`*${request.speaker}${pose ? PLACEHOLDER_BY_POSE[pose] : " regards you quietly."}*`],
      speakerPose: pose,
      emote: match?.emote,
      trustChange: match?.trustChange,
      event: match?.event,
      placeholder: true,
    };
  }

  private getDefaultResponse(request: DialogueRequest): DialogueResponse {
    if (request.speakerType === "cat") {
      return { lines: ["*The cat regards you warily.*"] };
    }
    return { lines: ["..."] };
  }
}
