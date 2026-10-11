import type { ConversationRecord } from "../services/ConversationStore";

/** Game-clock ms; the clock stops while gameplay is paused or the app is closed. */
export const RECENT_DIALOGUE_WINDOW_MS = 60_000;

export type DialogueCadence =
  | "continuing_conversation"
  | "recent_return"
  | "same_day_return"
  | "previous_day_return"
  | "long_absence";

export interface DialogueRecencyContext {
  cadence: DialogueCadence;
}

/** Observed separation, independent of time spent talking or waiting beside the NPC. */
export interface DialogueSeparation {
  departedAt: { timestamp: number; gameDay: number };
  returnedAt?: { timestamp: number; gameDay: number };
}

function isGameMoment(value: unknown, nowGameTimestamp: number, currentGameDay: number): value is DialogueSeparation["departedAt"] {
  if (typeof value !== "object" || value === null) return false;
  const moment = value as Record<string, unknown>;
  return typeof moment.timestamp === "number" && Number.isFinite(moment.timestamp) &&
    moment.timestamp >= 0 && moment.timestamp <= nowGameTimestamp &&
    typeof moment.gameDay === "number" && Number.isInteger(moment.gameDay) &&
    moment.gameDay >= 1 && moment.gameDay <= currentGameDay;
}

/** Optional save data: malformed, legacy-missing, or future state cannot establish an absence. */
export function readDialogueSeparation(value: unknown, nowGameTimestamp: number, currentGameDay: number): DialogueSeparation | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const data = value as Record<string, unknown>;
  const departure = data.departedAt;
  const reunion = data.returnedAt;
  if (!isGameMoment(departure, nowGameTimestamp, currentGameDay)) return undefined;
  if (reunion === undefined) return { departedAt: departure };
  if (!isGameMoment(reunion, nowGameTimestamp, currentGameDay) ||
      reunion.timestamp < departure.timestamp || reunion.gameDay < departure.gameDay) return undefined;
  return { departedAt: departure, returnedAt: reunion };
}

interface DialogueRecencyInput {
  history: ConversationRecord[];
  nowGameTimestamp: number;
  currentGameDay: number;
  separation?: DialogueSeparation;
}

/** Ignore records ahead of a restored save, while retaining legacy rows without a wall clock. */
export function getDialogueHistoryAtTime(
  history: ConversationRecord[],
  nowGameTimestamp: number,
  currentGameDay: number,
): ConversationRecord[] {
  if (
    !Number.isFinite(nowGameTimestamp) || nowGameTimestamp < 0 ||
    !Number.isInteger(currentGameDay) || currentGameDay < 1
  ) return [];

  return history.filter(({ timestamp, gameDay }) =>
    Number.isFinite(timestamp) && timestamp >= 0 && timestamp <= nowGameTimestamp &&
    Number.isInteger(gameDay) && gameDay >= 1 && gameDay <= currentGameDay,
  );
}

export function buildDialogueRecencyContext({
  history,
  nowGameTimestamp,
  currentGameDay,
  separation,
}: DialogueRecencyInput): DialogueRecencyContext | undefined {
  const applicableHistory = getDialogueHistoryAtTime(history, nowGameTimestamp, currentGameDay);
  const lastConversation = applicableHistory[applicableHistory.length - 1];
  if (!lastConversation) return undefined;

  const observed = readDialogueSeparation(separation, nowGameTimestamp, currentGameDay);
  if (!observed) return { cadence: "continuing_conversation" };
  const departure = observed.departedAt;
  const reunion = observed.returnedAt ?? { timestamp: nowGameTimestamp, gameDay: currentGameDay };
  if (departure.timestamp < lastConversation.timestamp || departure.gameDay < lastConversation.gameDay) {
    return { cadence: "continuing_conversation" };
  }

  const elapsedGameMs = reunion.timestamp - departure.timestamp;
  const gameDaysApart = reunion.gameDay - departure.gameDay;

  // A long conversation, a pause, or crossing dawn beside an NPC is not an absence.
  // Check the brief-return window before day boundaries so stepping away at dawn
  // does not suddenly become a long separation.
  const cadence: DialogueCadence =
    elapsedGameMs === 0
      ? "continuing_conversation"
      : elapsedGameMs <= RECENT_DIALOGUE_WINDOW_MS
        ? "recent_return"
        : gameDaysApart >= 2
          ? "long_absence"
          : gameDaysApart === 1
            ? "previous_day_return"
            : "same_day_return";

  return { cadence };
}
