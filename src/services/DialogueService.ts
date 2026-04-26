/**
 * Centralized dialogue service interface.
 *
 * Phase 4: scripted implementation (ScriptedDialogueService).
 * Phase 5: swap to AI-powered implementation — same interface, different backend.
 *
 * All NPC dialogue flows through this service. The UI layer (DialogueSystem)
 * remains responsible for rendering; this service decides WHAT to say.
 */

import type { NpcMemory } from "./ConversationStore";
import type { DialogueRecencyContext } from "../utils/dialogueRecency";

// ── Public Interfaces ───────────────────────────────────────────────

export interface DialogueRequest {
  speaker: string;
  speakerType: "cat" | "human";
  target: string;
  gameState: {
    chapter: number;
    timeOfDay: string;
    trustGlobal: number;
    trustWithSpeaker: number;
    hunger: number;
    thirst: number;
    energy: number;
    daysSurvived: number;
    knownCats: string[];
    recentEvents: string[];
  };
  conversationHistory: ConversationEntry[];
  /** Prompt-only context derived from existing first-meet logic. */
  isFirstConversation?: boolean;
  /** Relationship warmth stage for prompt tone. */
  relationshipStage?: 1 | 2 | 3 | 4;
  /** Per-NPC memories, already validated by ConversationStore. */
  npcMemories?: NpcMemory[];
  /** Number of in-game days since this NPC last spoke to Mamma Cat. */
  gameDaysSinceLastTalk?: number;
  /** Same-speaker timing context for deliberate repeated engagement. */
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
  };
}

export interface ConversationEntry {
  timestamp: number;
  speaker: string;
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
  /** Optional body-language cue describing Mamma Cat's side of this exchange. */
  mammaCatCue?: string;
  /** Advisory-only memory suggestion. Never drives story state. */
  memoryNote?: {
    kind: NpcMemory["kind"];
    label?: string;
    value: string;
  };
  trustChange?: number;
  event?: string;
}

export interface DialogueService {
  getDialogue(request: DialogueRequest): Promise<DialogueResponse>;
}

// ── Scripted Implementation ─────────────────────────────────────────

export interface DialogueScript {
  condition: (req: DialogueRequest) => boolean;
  response: DialogueResponse;
}

export class ScriptedDialogueService implements DialogueService {
  private scripts: Record<string, DialogueScript[]>;

  constructor(scripts: Record<string, DialogueScript[]>) {
    this.scripts = scripts;
  }

  async getDialogue(request: DialogueRequest): Promise<DialogueResponse> {
    const speakerScripts = this.scripts[request.speaker];
    if (!speakerScripts) return this.getDefaultResponse(request);

    const match = speakerScripts.find((s) => s.condition(request));
    return match?.response ?? this.getDefaultResponse(request);
  }

  private getDefaultResponse(request: DialogueRequest): DialogueResponse {
    if (request.speakerType === "cat") {
      return { lines: ["*The cat regards you warily.*"] };
    }
    return { lines: ["..."] };
  }
}
