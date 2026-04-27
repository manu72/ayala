import { describe, expect, it } from 'vitest'
import { calculateRelationshipStage } from '../../src/services/DialogueRelationship'

describe('calculateRelationshipStage', () => {
  it('uses first-conversation state as the stage-1 authority', () => {
    expect(calculateRelationshipStage({
      isFirstConversation: true,
      conversationCount: 20,
      trustWithSpeaker: 90,
    })).toBe(1)
  })

  it('keeps explicit returning conversations at least acquaintances', () => {
    expect(calculateRelationshipStage({
      isFirstConversation: false,
      conversationCount: 0,
      trustWithSpeaker: 0,
    })).toBe(2)
  })

  it('uses total conversation count and trust thresholds for established relationships', () => {
    expect(calculateRelationshipStage({
      isFirstConversation: false,
      conversationCount: 16,
      trustWithSpeaker: 60,
    })).toBe(4)
  })

  it('recognizes personal memories as relationship-forming context', () => {
    expect(calculateRelationshipStage({
      isFirstConversation: false,
      conversationCount: 1,
      trustWithSpeaker: 0,
      memories: [{ kind: 'preference' }],
    })).toBe(3)
  })
})
