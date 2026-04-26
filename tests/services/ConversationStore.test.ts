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
  addNpcMemory,
  getNpcMemories,
  pruneNpcMemories,
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

async function createLegacyV2MemoryStore(records: Array<Record<string, unknown>>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('ayala_conversations')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ayala_conversations', 2)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('conversations')) {
        const conversations = db.createObjectStore('conversations', {
          keyPath: 'id',
          autoIncrement: true,
        })
        conversations.createIndex('speaker', 'speaker', { unique: false })
        conversations.createIndex('timestamp', 'timestamp', { unique: false })
      }
      if (!db.objectStoreNames.contains('memories')) {
        const memories = db.createObjectStore('memories', {
          keyPath: 'id',
          autoIncrement: true,
        })
        memories.createIndex('npc', 'npc', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  const tx = db.transaction('memories', 'readwrite')
  const store = tx.objectStore('memories')
  for (const record of records) {
    store.add(record)
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

describe('ConversationStore — IndexedDB happy path', () => {
  // Capture the process-global IDB installed by fake-indexeddb/auto so that
  // swapping it for a fresh factory per-test does not leak into later
  // describe() blocks (notably the "silent fallback" suite).
  const originalIndexedDB = globalThis.indexedDB

  beforeEach(async () => {
    // Reset to a fresh in-memory DB between tests to avoid leakage across specs.
    globalThis.indexedDB = new IDBFactory()
    await clearAllConversations()
  })

  afterEach(async () => {
    await clearAllConversations()
    globalThis.indexedDB = originalIndexedDB
  })

  it('storeConversation persists a record retrievable via getRecentConversations', async () => {
    const rec = buildRecord({
      speaker: 'mamma',
      lines: ['First meeting'],
      mammaCatTurn: 'Mamma Cat pads close at dusk.',
    })
    await storeConversation(rec)
    const recent = await getRecentConversations('mamma')
    expect(recent).toHaveLength(1)
    expect(recent[0]).toMatchObject({
      speaker: 'mamma',
      lines: ['First meeting'],
      mammaCatTurn: 'Mamma Cat pads close at dusk.',
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

  it('getRecentConversations defaults to the most recent 20 when no limit is given', async () => {
    for (let i = 0; i < 22; i++) {
      await storeConversation(buildRecord({ speaker: 'mamma', timestamp: i, lines: [`L${i}`] }))
    }
    const defaultLimit = await getRecentConversations('mamma')
    expect(defaultLimit).toHaveLength(20)
    expect(defaultLimit[0]!.lines[0]).toBe('L2')
    expect(defaultLimit[defaultLimit.length - 1]!.lines[0]).toBe('L21')
  })

  it('prune keeps at most 100 records per speaker after many writes', async () => {
    for (let i = 0; i < 101; i++) {
      await storeConversation(buildRecord({ speaker: 'mamma', timestamp: i, lines: [`L${i}`] }))
    }
    expect(await getConversationCount('mamma')).toBe(100)
  })

  it('prune evicts the oldest by write order and keeps the newest record (ascending timestamps)', async () => {
    for (let i = 0; i < 101; i++) {
      await storeConversation(buildRecord({ speaker: 'mamma', timestamp: i, lines: [`L${i}`] }))
    }
    expect(await getConversationCount('mamma')).toBe(100)
    const all = await getRecentConversations('mamma', 1000)
    const lines = all.map((r) => r.lines[0])
    expect(lines).not.toContain('L0')
    expect(lines).toContain('L100')
  })

  // Adversarial: simulate a save-based scenario where game-clock `timestamp`
  // does NOT reflect write order (e.g. New Game+ resets gameTimeMs to 0 while
  // prior-run conversations with much higher timestamps still live in IDB).
  // Pruning by game-clock here would evict the NEWEST records; pruning by
  // insertion order (auto-increment `id`) must still drop the oldest writes.
  it('prune evicts the oldest WRITTEN record even when game-clock timestamps go backwards', async () => {
    await storeConversation(buildRecord({ speaker: 'mamma', timestamp: 10_000, lines: ['OLD_FROM_PRIOR_RUN'] }))
    for (let i = 0; i < 100; i++) {
      await storeConversation(buildRecord({ speaker: 'mamma', timestamp: i, lines: [`NEW_${i}`] }))
    }
    expect(await getConversationCount('mamma')).toBe(100)
    const all = await getRecentConversations('mamma', 1000)
    const lines = all.map((r) => r.lines[0])
    expect(lines).not.toContain('OLD_FROM_PRIOR_RUN')
    expect(lines).toContain('NEW_0')
    expect(lines).toContain('NEW_99')
  })

  it('getRecentConversations returns [] for an unknown speaker', async () => {
    await storeConversation(buildRecord({ speaker: 'mamma' }))
    expect(await getRecentConversations('nobody')).toEqual([])
  })

  it('clearAllConversations empties the store across all speakers', async () => {
    await storeConversation(buildRecord({ speaker: 'mamma' }))
    await storeConversation(buildRecord({ speaker: 'camille' }))
    await addNpcMemory('mamma', {
      kind: 'event',
      label: 'first_meeting',
      value: 'Met Mamma Cat on day 1 at day.',
      source: 'scripted',
      gameDay: 1,
    })
    await clearAllConversations()
    expect(await getConversationCount('mamma')).toBe(0)
    expect(await getConversationCount('camille')).toBe(0)
    expect(await getRecentConversations('mamma')).toEqual([])
    expect(await getNpcMemories('mamma')).toEqual([])
  })

  it('filters by speaker when multiple speakers share the store', async () => {
    await storeConversation(buildRecord({ speaker: 'mamma', lines: ['M1'] }))
    await storeConversation(buildRecord({ speaker: 'camille', lines: ['C1'] }))
    await storeConversation(buildRecord({ speaker: 'mamma', lines: ['M2'] }))
    const mammaOnly = await getRecentConversations('mamma')
    expect(mammaOnly.map((r) => r.lines[0])).toEqual(['M1', 'M2'])
  })

  it('stores validated per-NPC memories, deduplicates normalized values, and prunes by speaker', async () => {
    await addNpcMemory('Blacky', {
      kind: 'event',
      label: 'first_meeting',
      value: 'Met Mamma Cat on day 1 at dusk.',
      source: 'scripted',
      gameDay: 1,
    })
    await addNpcMemory('Blacky', {
      kind: 'event',
      label: 'first_meeting',
      value: '  Met Mamma Cat on day 1 at dusk.  ',
      source: 'ai',
      gameDay: 1,
    })
    await addNpcMemory('Tiger', {
      kind: 'preference',
      label: 'space',
      value: 'Mamma Cat keeps distance when Tiger warns her.',
      source: 'ai',
      gameDay: 2,
    })

    const blackyMemories = await getNpcMemories('Blacky')
    expect(blackyMemories).toHaveLength(1)
    expect(blackyMemories[0]).toMatchObject({
      npc: 'Blacky',
      kind: 'event',
      label: 'first_meeting',
      value: 'Met Mamma Cat on day 1 at dusk.',
      source: 'scripted',
    })
    expect(typeof blackyMemories[0]!.dedupeKey).toBe('string')
    expect(await getNpcMemories('Tiger')).toHaveLength(1)

    for (let i = 0; i < 25; i++) {
      await addNpcMemory('Blacky', {
        kind: 'event',
        label: `return_${i}`,
        value: `Return visit ${i}`,
        source: 'scripted',
        gameDay: i + 2,
      })
    }
    await pruneNpcMemories('Blacky', 20)
    const pruned = await getNpcMemories('Blacky', 100)
    expect(pruned).toHaveLength(20)
    expect(pruned.map((m) => m.value)).not.toContain('Met Mamma Cat on day 1 at dusk.')
    expect(pruned[pruned.length - 1]!.value).toBe('Return visit 24')
  })

  it('deduplicates concurrent memory writes with the unique dedupe key', async () => {
    await Promise.all(Array.from({ length: 8 }, () =>
      addNpcMemory('Blacky', {
        kind: 'event',
        label: 'first_meeting',
        value: '  Met Mamma Cat on day 1 at dusk.  ',
        source: 'ai',
        gameDay: 1,
      }),
    ))

    const blackyMemories = await getNpcMemories('Blacky')
    expect(blackyMemories).toHaveLength(1)
    expect(blackyMemories[0]).toMatchObject({
      npc: 'Blacky',
      kind: 'event',
      label: 'first_meeting',
      value: 'Met Mamma Cat on day 1 at dusk.',
    })
  })

  it('backfills dedupe keys when upgrading legacy memory rows', async () => {
    await createLegacyV2MemoryStore([
      {
        npc: 'Blacky',
        kind: 'event',
        label: 'first_meeting',
        value: 'Met Mamma Cat on day 1 at dusk.',
        source: 'scripted',
        createdAt: 1,
        gameDay: 1,
      },
    ])

    await addNpcMemory('Blacky', {
      kind: 'event',
      label: 'first_meeting',
      value: '  Met Mamma Cat on day 1 at dusk.  ',
      source: 'ai',
      gameDay: 1,
    })

    const blackyMemories = await getNpcMemories('Blacky')
    expect(blackyMemories).toHaveLength(1)
    expect(typeof blackyMemories[0]!.dedupeKey).toBe('string')
  })

  it('drops invalid memory writes without throwing', async () => {
    await addNpcMemory('Blacky', {
      kind: 'secret' as never,
      label: 'bad',
      value: 'Should not be stored',
      source: 'ai',
      gameDay: 1,
    })
    await addNpcMemory('Blacky', {
      kind: 'trait',
      label: 'blank',
      value: '   ',
      source: 'ai',
      gameDay: 1,
    })
    await addNpcMemory('Blacky', {
      kind: 'trait',
      label: 'control',
      value: 'Unsafe\u0000memory',
      source: 'ai',
      gameDay: 1,
    })

    expect(await getNpcMemories('Blacky')).toEqual([])
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

  it('getNpcMemories resolves to [] when IDB.open throws', async () => {
    await expect(getNpcMemories('mamma')).resolves.toEqual([])
  })

  it('clearAllConversations resolves without throwing when IDB.open throws', async () => {
    await expect(clearAllConversations()).resolves.toBeUndefined()
  })
})
