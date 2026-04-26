import type { ConversationRecord } from "../services/ConversationStore";

export const RECENT_DIALOGUE_WINDOW_SECONDS = 60;
const IMMEDIATE_FOLLOWUP_SECONDS = 15;

export type DialogueCadence =
  | "immediate_followup"
  | "recent_followup"
  | "same_day_followup"
  | "later_followup";

export interface DialogueRecencyContext {
  cadence: DialogueCadence;
  lastTalkElapsedSeconds: number;
  sameNpcTalksInRecentWindow: number;
  recentWindowSeconds: number;
}

interface DialogueRecencyInput {
  history: ConversationRecord[];
  nowRealTimestamp: number;
  nowGameTimestamp: number;
  currentGameDay: number;
}

export function buildDialogueRecencyContext({
  history,
  nowRealTimestamp,
  nowGameTimestamp,
  currentGameDay,
}: DialogueRecencyInput): DialogueRecencyContext | undefined {
  const lastConversation = history[history.length - 1];
  if (!lastConversation) return undefined;

  const usingRealTime = typeof lastConversation.realTimestamp === "number";
  const now = usingRealTime ? nowRealTimestamp : nowGameTimestamp;
  const last = usingRealTime ? lastConversation.realTimestamp! : lastConversation.timestamp;
  const lastTalkElapsedSeconds = Math.max(0, Math.floor((now - last) / 1000));
  const recentWindowSeconds = RECENT_DIALOGUE_WINDOW_SECONDS;
  const sameNpcTalksInRecentWindow = history.filter((conversation) => {
    const then = usingRealTime ? conversation.realTimestamp : conversation.timestamp;
    return typeof then === "number" && now - then <= recentWindowSeconds * 1000;
  }).length;

  const cadence: DialogueCadence =
    lastTalkElapsedSeconds <= IMMEDIATE_FOLLOWUP_SECONDS
      ? "immediate_followup"
      : lastTalkElapsedSeconds <= recentWindowSeconds
        ? "recent_followup"
        : lastConversation.gameDay === currentGameDay
          ? "same_day_followup"
          : "later_followup";

  return {
    cadence,
    lastTalkElapsedSeconds,
    sameNpcTalksInRecentWindow,
    recentWindowSeconds,
  };
}
