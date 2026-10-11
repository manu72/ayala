import { describe, expect, it } from 'vitest'
import { buildDialogueRecencyContext, getDialogueHistoryAtTime, RECENT_DIALOGUE_WINDOW_MS } from '../../src/utils/dialogueRecency'
import type { ConversationRecord } from '../../src/services/ConversationStore'

function record(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
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
  it('has no recency on first contact', () => {
    expect(buildDialogueRecencyContext({ history: [], nowGameTimestamp: 1_000, currentGameDay: 1 })).toBeUndefined()
  })

  it('continues the same encounter even when the game has crossed multiple dawns', () => {
    expect(buildDialogueRecencyContext({
      history: [record()], nowGameTimestamp: 2_600_000, currentGameDay: 4,
    })).toEqual({ cadence: 'continuing_conversation' })
  })

  it.each([undefined, 0, 9_000_000, Number.NaN])('ignores wall-clock metadata (%s) when game time has not advanced', (realTimestamp) => {
    expect(buildDialogueRecencyContext({
      history: [record({ realTimestamp })], nowGameTimestamp: 1_000, currentGameDay: 1,
      separation: { departedAt: { timestamp: 1_000, gameDay: 1 } },
    })).toEqual({ cadence: 'continuing_conversation' })
  })

  it('uses game time even when a legacy row has no realTimestamp', () => {
    expect(buildDialogueRecencyContext({
      history: [record({ realTimestamp: undefined })],
      nowGameTimestamp: 1_001 + RECENT_DIALOGUE_WINDOW_MS, currentGameDay: 1,
      separation: { departedAt: { timestamp: 1_000, gameDay: 1 } },
    })).toEqual({ cadence: 'same_day_return' })
  })

  it('keeps a return at the brief-separation boundary as continuity', () => {
    expect(buildDialogueRecencyContext({
      history: [record()], nowGameTimestamp: 1_000 + RECENT_DIALOGUE_WINDOW_MS, currentGameDay: 1,
      separation: { departedAt: { timestamp: 1_000, gameDay: 1 } },
    })).toEqual({ cadence: 'recent_return' })
  })

  it('does not turn a brief separation across dawn into a long absence', () => {
    expect(buildDialogueRecencyContext({
      history: [record({ timestamp: 839_000 })], nowGameTimestamp: 841_000, currentGameDay: 2,
      separation: { departedAt: { timestamp: 839_000, gameDay: 1 } },
    })).toEqual({ cadence: 'recent_return' })
  })

  it('recognises a meaningful separation into the following game day', () => {
    expect(buildDialogueRecencyContext({
      history: [record({ realTimestamp: 9_000_000 })], nowGameTimestamp: 900_000, currentGameDay: 2,
      separation: { departedAt: { timestamp: 1_000, gameDay: 1 } },
    })).toEqual({ cadence: 'previous_day_return' })
  })

  it('recognises a separation across several game days', () => {
    expect(buildDialogueRecencyContext({
      history: [record()], nowGameTimestamp: 2_600_000, currentGameDay: 4,
      separation: { departedAt: { timestamp: 1_000, gameDay: 1 } },
    })).toEqual({ cadence: 'long_absence' })
  })

  it('does not count time spent beside an NPC before a brief departure as absence', () => {
    expect(buildDialogueRecencyContext({
      history: [record()], nowGameTimestamp: 2_605_000, currentGameDay: 4,
      separation: { departedAt: { timestamp: 2_600_000, gameDay: 4 } },
    })).toEqual({ cadence: 'recent_return' })
  })

  it('stops counting absence upon returning, even if the player waits before talking', () => {
    expect(buildDialogueRecencyContext({
      history: [record()], nowGameTimestamp: 2_600_000, currentGameDay: 4,
      separation: {
        departedAt: { timestamp: 1_000, gameDay: 1 },
        returnedAt: { timestamp: 2_000, gameDay: 1 },
      },
    })).toEqual({ cadence: 'recent_return' })
  })

  it('ignores a future row and uses the last applicable exchange after a save rollback', () => {
    expect(buildDialogueRecencyContext({
      history: [record(), record({ timestamp: 500_000, gameDay: 2 })],
      nowGameTimestamp: 90_000, currentGameDay: 1,
      separation: { departedAt: { timestamp: 1_000, gameDay: 1 } },
    })).toEqual({ cadence: 'same_day_return' })
  })

  it('does not invent recency when all history is ahead of the restored save', () => {
    expect(buildDialogueRecencyContext({
      history: [record({ timestamp: 500_000 })], nowGameTimestamp: 90_000, currentGameDay: 1,
    })).toBeUndefined()
  })

  it.each([
    { departedAt: { timestamp: 900_000, gameDay: 2 } },
    { departedAt: { timestamp: Number.NaN, gameDay: 1 } },
    { departedAt: { timestamp: 1_000, gameDay: 1 }, returnedAt: { timestamp: 500, gameDay: 1 } },
    { departedAt: { timestamp: 1_000, gameDay: 1 }, returnedAt: { timestamp: 10_000, gameDay: 2 } },
  ])('does not turn invalid or future separation data into an absence', (separation) => {
    expect(buildDialogueRecencyContext({
      history: [record()], nowGameTimestamp: 90_000, currentGameDay: 1, separation,
    })).toEqual({ cadence: 'continuing_conversation' })
  })
})

describe('getDialogueHistoryAtTime', () => {
  it('keeps insertion order and excludes malformed or future timestamps and days', () => {
    const earlier = record({ timestamp: 10_000, lines: ['Earlier.'] })
    const latest = record({ timestamp: 5_000, realTimestamp: undefined, lines: ['Latest write.'] })
    expect(getDialogueHistoryAtTime([
      earlier,
      record({ timestamp: -1 }), record({ timestamp: Number.NaN }), record({ timestamp: Number.POSITIVE_INFINITY }),
      record({ timestamp: 90_001 }), record({ gameDay: 2 }), record({ gameDay: 0 }), record({ gameDay: 1.5 }),
      latest,
    ], 90_000, 1)).toEqual([earlier, latest])
  })

  it.each([[-1, 1], [Number.NaN, 1], [Number.POSITIVE_INFINITY, 1], [90_000, 0], [90_000, 1.5]])(
    'returns no history for invalid game time (%s, %s)', (timestamp, day) => {
      expect(getDialogueHistoryAtTime([record()], timestamp, day)).toEqual([])
    },
  )
})
