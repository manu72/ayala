import { describe, expect, it } from 'vitest'
import { buildDialogueRecencyContext } from '../../src/utils/dialogueRecency'
import type { ConversationRecord } from '../../src/services/ConversationStore'

function record(overrides: Partial<ConversationRecord>): ConversationRecord {
  return {
    speaker: 'Jayco Jr',
    timestamp: 1_000,
    realTimestamp: 1_000,
    gameDay: 1,
    lines: ['Hi.'],
    trustBefore: 0,
    trustAfter: 0,
    chapter: 1,
    ...overrides,
  }
}

describe('buildDialogueRecencyContext', () => {
  it('marks rapid same-NPC re-engagement as deliberate immediate continuity', () => {
    const context = buildDialogueRecencyContext({
      history: [
        record({ realTimestamp: 40_000, timestamp: 10_000 }),
        record({ realTimestamp: 55_000, timestamp: 20_000 }),
      ],
      nowRealTimestamp: 60_000,
      nowGameTimestamp: 30_000,
      currentGameDay: 1,
    })

    expect(context).toEqual({
      cadence: 'immediate_followup',
      lastTalkElapsedSeconds: 5,
      sameNpcTalksInRecentWindow: 2,
      recentWindowSeconds: 60,
    })
  })

  it('keeps same-day return context without treating every same-day talk as rapid', () => {
    const context = buildDialogueRecencyContext({
      history: [
        record({ realTimestamp: 10_000, timestamp: 10_000, gameDay: 3 }),
      ],
      nowRealTimestamp: 180_000,
      nowGameTimestamp: 180_000,
      currentGameDay: 3,
    })

    expect(context).toEqual({
      cadence: 'same_day_followup',
      lastTalkElapsedSeconds: 170,
      sameNpcTalksInRecentWindow: 0,
      recentWindowSeconds: 60,
    })
  })

  it('treats next-day conversations as later follow-ups even when wall-clock time is short', () => {
    const context = buildDialogueRecencyContext({
      history: [
        record({ realTimestamp: 55_000, timestamp: 20_000, gameDay: 1 }),
      ],
      nowRealTimestamp: 60_000,
      nowGameTimestamp: 30_000,
      currentGameDay: 2,
    })

    expect(context).toEqual({
      cadence: 'later_followup',
      lastTalkElapsedSeconds: 5,
      sameNpcTalksInRecentWindow: 0,
      recentWindowSeconds: 60,
    })
  })
})
