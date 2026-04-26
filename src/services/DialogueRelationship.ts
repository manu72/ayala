export type RelationshipStage = 1 | 2 | 3 | 4;

export const RELATIONSHIP_STAGE_4_MIN_TALKS = 16;
export const RELATIONSHIP_STAGE_4_MIN_TRUST = 60;
export const RELATIONSHIP_STAGE_3_MIN_TALKS = 6;
export const RELATIONSHIP_STAGE_3_MIN_TRUST = 25;
export const RELATIONSHIP_STAGE_2_MIN_TALKS = 1;
export const RELATIONSHIP_STAGE_2_MIN_TRUST = 5;

interface RelationshipMemorySignal {
  kind: string;
}

export interface RelationshipStageInput {
  isFirstConversation?: boolean;
  conversationCount: number;
  trustWithSpeaker: number;
  memories?: RelationshipMemorySignal[];
}

export function calculateRelationshipStage({
  isFirstConversation,
  conversationCount,
  trustWithSpeaker,
  memories = [],
}: RelationshipStageInput): RelationshipStage {
  if (isFirstConversation) return 1;

  const hasPersonalMemory = memories.some((memory) =>
    memory.kind === "identity" || memory.kind === "preference",
  );

  if (
    conversationCount >= RELATIONSHIP_STAGE_4_MIN_TALKS &&
    trustWithSpeaker >= RELATIONSHIP_STAGE_4_MIN_TRUST
  ) {
    return 4;
  }
  if (
    conversationCount >= RELATIONSHIP_STAGE_3_MIN_TALKS ||
    trustWithSpeaker >= RELATIONSHIP_STAGE_3_MIN_TRUST ||
    hasPersonalMemory
  ) {
    return 3;
  }
  if (
    conversationCount >= RELATIONSHIP_STAGE_2_MIN_TALKS ||
    trustWithSpeaker >= RELATIONSHIP_STAGE_2_MIN_TRUST
  ) {
    return 2;
  }

  return isFirstConversation === false ? 2 : 1;
}
