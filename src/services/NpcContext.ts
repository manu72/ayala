/**
 * What an NPC knows when it speaks: its stored records and memories, and the
 * one mapping from a stored record to a prompt history entry. Also builds the
 * records every dialogue site persists, so they all share one shape.
 */

import {
  CONVERSATION_KEEP,
  getNpcMemories,
  getRecentConversations,
  isLegacyReturnFiller,
  recordKind,
  type ConversationKind,
  type ConversationRecord,
  type NewNpcMemory,
  type NpcMemory,
} from "./ConversationStore";
import type { ConversationEntry } from "./DialogueService";
import { getDialogueHistoryAtTime } from "../utils/dialogueRecency";
import { mammaCatCondition } from "../utils/mammaCatCondition";

export interface NpcContext {
  /** Every kept record, insertion order, unfiltered: scripted progression and "already played" checks. */
  records: ConversationRecord[];
  /** Records that exist at the current game time (a restored older save hides later ones): prompt history. */
  promptRecords: ConversationRecord[];
  /** Memories formed by the current game time (by day on older rows), without legacy `_return` filler. */
  memories: NpcMemory[];
}

export async function loadNpcContext(
  speaker: string,
  now: { timestamp: number; gameDay: number },
): Promise<NpcContext> {
  // Capped even between a write and its prune, so the request stays within the Worker's message limit.
  const [records, memories] = await Promise.all([
    getRecentConversations(speaker, CONVERSATION_KEEP),
    getNpcMemories(speaker),
  ]);
  return {
    records,
    promptRecords: getDialogueHistoryAtTime(records, now.timestamp, now.gameDay),
    memories: memories.filter(
      (m) =>
        (m.timestamp !== undefined ? m.timestamp <= now.timestamp : m.gameDay <= now.gameDay) &&
        !isLegacyReturnFiller(m),
    ),
  };
}

const DEFAULT_MAMMA_CAT_TURN: Record<ConversationKind, string> = {
  talk: "Mamma Cat came over to talk.",
  ambient: "Mamma Cat passed close by.",
  story: "Mamma Cat was there.",
};

export function toConversationEntry(record: ConversationRecord): ConversationEntry {
  const kind = recordKind(record);
  // Rows without `kind` predate game-authored turns: any stored turn is the old
  // raw-stats line plus a model-invented cue, so it never reaches the prompt.
  const turn = record.kind && record.mammaCatTurn ? record.mammaCatTurn : DEFAULT_MAMMA_CAT_TURN[kind];
  const when = [
    Number.isInteger(record.gameDay) ? `Day ${record.gameDay}` : null,
    record.gameStateSnapshot?.timeOfDay,
  ].filter(Boolean).join(", ");
  return {
    timestamp: record.timestamp,
    speaker: record.speaker,
    gameDay: record.gameDay,
    kind,
    mammaCatTurn: when ? `[${when}] ${turn}` : turn,
    text: record.lines.join(" "),
  };
}

/** The scene at the moment of a stored exchange. Humans have no per-speaker trust. */
export interface NpcSceneSnapshot {
  timestamp: number;
  realTimestamp: number;
  gameDay: number;
  chapter: number;
  timeOfDay: string;
  hunger: number;
  thirst: number;
  energy: number;
  trustBefore?: number;
  trustAfter?: number;
}

/**
 * Every dialogue site persists through this: `lines` are exactly what the
 * player saw, `mammaCatTurn` a short game-authored fact about Mamma Cat.
 */
export function buildConversationRecord(
  scene: NpcSceneSnapshot,
  turn: { speaker: string; kind: ConversationKind; lines: string[]; mammaCatTurn: string; playerAction?: string },
): ConversationRecord {
  return {
    speaker: turn.speaker,
    kind: turn.kind,
    timestamp: scene.timestamp,
    realTimestamp: scene.realTimestamp,
    gameDay: scene.gameDay,
    chapter: scene.chapter,
    mammaCatTurn: turn.mammaCatTurn,
    lines: turn.lines,
    trustBefore: scene.trustBefore,
    trustAfter: scene.trustAfter,
    playerAction: turn.playerAction,
    gameStateSnapshot: {
      timeOfDay: scene.timeOfDay,
      hunger: scene.hunger,
      thirst: scene.thirst,
      energy: scene.energy,
    },
  };
}

/** Mamma Cat's side of an engaged cat talk: "Mamma Cat came over to talk. She was very hungry." */
export function talkMammaCatTurn(scene: Pick<NpcSceneSnapshot, "hunger" | "thirst" | "energy">): string {
  const condition = mammaCatCondition(scene.hunger, scene.thirst, scene.energy);
  return condition ? `Mamma Cat came over to talk. She was ${condition}.` : "Mamma Cat came over to talk.";
}

const PHASE_WORDS: Record<string, string> = {
  dawn: "at dawn",
  day: "during the day",
  evening: "in the evening",
  night: "at night",
};

/**
 * Scripted cat memories are milestones only (a first meeting, Tiger warming
 * up), in words the NPC can use and without script ids. Anything else → null.
 */
export function milestoneMemory(
  event: string | undefined,
  scene: Pick<NpcSceneSnapshot, "timestamp" | "gameDay" | "timeOfDay">,
): NewNpcMemory | null {
  const phase = PHASE_WORDS[scene.timeOfDay];
  const day = `day ${scene.gameDay}${phase ? `, ${phase}` : ""}`;
  const base = { kind: "event", source: "scripted", gameDay: scene.gameDay, timestamp: scene.timestamp } as const;
  if (event?.endsWith("_first")) {
    return { ...base, label: "first_meeting", value: `You first met Mamma Cat on ${day}.` };
  }
  if (event === "tiger_warmup") {
    return {
      ...base,
      label: "warmed_up",
      value: `On ${day}, you stopped hissing at Mamma Cat and told her about the food by the stone building.`,
    };
  }
  return null;
}
