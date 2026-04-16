/**
 * Centralized dialogue service interface.
 *
 * Phase 4: scripted implementation (ScriptedDialogueService).
 * Phase 5: swap to AI-powered implementation — same interface, different backend.
 *
 * All NPC dialogue flows through this service. The UI layer (DialogueSystem)
 * remains responsible for rendering; this service decides WHAT to say.
 */

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
}

export interface ConversationEntry {
  timestamp: number;
  speaker: string;
  text: string;
}

export type SpeakerPose = "friendly" | "wary" | "hostile" | "sleeping" | "curious" | "submissive";

export interface DialogueResponse {
  lines: string[];
  speakerPose?: SpeakerPose;
  emote?: string;
  narration?: string;
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
