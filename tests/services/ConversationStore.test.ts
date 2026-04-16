import { describe, it, expect, beforeEach, afterEach } from 'vitest'
// fake-indexeddb/auto installs the IndexedDB polyfill onto globalThis before
// the store module loads, so the module-under-test uses a real (but in-memory)
// IDB implementation — no Phaser or browser required.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'

import {
  storeConversation,
  getRecentConversations,
  getConversationCount,
  clearAllConversations,
  type ConversationRecord,
} from '../../src/services/ConversationStore'

function buildRecord(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    speaker: 'mamma',
    timestamp: Date.now(),
    gameDay: 1,
    lines: ['Hello, little one.'],
    trustBefore: 0,
    trustAfter: 10,
    chapter: 1,
    ...overrides,
  }
}

describe('ConversationStore — IndexedDB happy path', () => {
  beforeEach(async () => {
    // Reset to a fresh in-memory DB between tests to avoid leakage across specs.
    globalThis.indexedDB = new IDBFactory()
    await clearAllConversations()
  })

  it('storeConversation persists a record retrievable via getRecentConversations', async () => {
    const rec = buildRecord({ speaker: 'mamma', lines: ['First meeting'] })
    await storeConversation(rec)
    const recent = await getRecentConversations('mamma')
    expect(recent).toHaveLength(1)
    expect(recent[0]).toMatchObject({
      speaker: 'mamma',
      lines: ['First meeting'],
      trustAfter: 10,
      chapter: 1,
    })
    // The store assigns an auto-increment id on write.
    expect(typeof recent[0]!.id).toBe('number')
  })

  it('getConversationCount counts only the requested speaker', async () => {
    await storeConversation(buildRecord({ speaker: 'mamma' }))
    await storeConversation(buildRecord({ speaker: 'mamma' }))
    await storeConversation(buildRecord({ speaker: 'camille' }))
    expect(await getConversationCount('mamma')).toBe(2)
    expect(await getConversationCount('camille')).toBe(1)
    expect(await getConversationCount('manu')).toBe(0)
  })

  it('getRecentConversations respects the limit and returns the most recent N in insertion order', async () => {
    for (let i = 0; i < 5; i++) {
      await storeConversation(buildRecord({ speaker: 'mamma', timestamp: i, lines: [`L${i}`] }))
    }
    const last3 = await getRecentConversations('mamma', 3)
    expect(last3.map((r) => r.lines[0])).toEqual(['L2', 'L3', 'L4'])
  })

  it('getRecentConversations defaults to the most recent 10 when no limit is given', async () => {
    for (let i = 0; i < 12; i++) {
      await storeConversation(buildRecord({ speaker: 'mamma', timestamp: i, lines: [`L${i}`] }))
    }
    const defaultLimit = await getRecentConversations('mamma')
    expect(defaultLimit).toHaveLength(10)
    expect(defaultLimit[0]!.lines[0]).toBe('L2')
    expect(defaultLimit[defaultLimit.length - 1]!.lines[0]).toBe('L11')
  })

  it('getRecentConversations returns [] for an unknown speaker', async () => {
    await storeConversation(buildRecord({ speaker: 'mamma' }))
    expect(await getRecentConversations('nobody')).toEqual([])
  })

  it('clearAllConversations empties the store across all speakers', async () => {
    await storeConversation(buildRecord({ speaker: 'mamma' }))
    await storeConversation(buildRecord({ speaker: 'camille' }))
    await clearAllConversations()
    expect(await getConversationCount('mamma')).toBe(0)
    expect(await getConversationCount('camille')).toBe(0)
    expect(await getRecentConversations('mamma')).toEqual([])
  })

  it('filters by speaker when multiple speakers share the store', async () => {
    await storeConversation(buildRecord({ speaker: 'mamma', lines: ['M1'] }))
    await storeConversation(buildRecord({ speaker: 'camille', lines: ['C1'] }))
    await storeConversation(buildRecord({ speaker: 'mamma', lines: ['M2'] }))
    const mammaOnly = await getRecentConversations('mamma')
    expect(mammaOnly.map((r) => r.lines[0])).toEqual(['M1', 'M2'])
  })
})

describe('ConversationStore — silent fallback when IndexedDB is unavailable', () => {
  const realIndexedDB = globalThis.indexedDB

  beforeEach(() => {
    // Simulate a hostile host: any call to indexedDB.open throws synchronously.
    // The store must catch this and degrade gracefully (no unhandled rejection,
    // no thrown error) because conversation history is non-critical to play.
    ;(globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = {
      open: () => {
        throw new Error('IndexedDB unavailable')
      },
    } as unknown as IDBFactory
  })

  afterEach(() => {
    globalThis.indexedDB = realIndexedDB
  })

  it('storeConversation resolves without throwing when IDB.open throws', async () => {
    await expect(storeConversation(buildRecord())).resolves.toBeUndefined()
  })

  it('getConversationCount resolves to 0 when IDB.open throws', async () => {
    await expect(getConversationCount('mamma')).resolves.toBe(0)
  })

  it('getRecentConversations resolves to [] when IDB.open throws', async () => {
    await expect(getRecentConversations('mamma')).resolves.toEqual([])
  })

  it('clearAllConversations resolves without throwing when IDB.open throws', async () => {
    await expect(clearAllConversations()).resolves.toBeUndefined()
  })
})
