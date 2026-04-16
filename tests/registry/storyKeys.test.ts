import { describe, it, expect, vi } from 'vitest'

import {
  StoryKeys,
  LEGACY_INTRO_SEEN_KEY,
  migrateLegacyIntroFlag,
  type StoryRegistry,
  type StoryStorage,
} from '../../src/registry/storyKeys'

/**
 * A minimal in-memory registry that records every set() for assertion
 * without pulling in Phaser.Data.DataManager.
 */
function makeRegistry(initial: Record<string, unknown> = {}): StoryRegistry & {
  setCalls: Array<{ key: string; value: unknown }>
  data: Map<string, unknown>
} {
  const data = new Map<string, unknown>(Object.entries(initial))
  const setCalls: Array<{ key: string; value: unknown }> = []
  return {
    data,
    setCalls,
    get(key: string) {
      return data.get(key)
    },
    set(key: string, value: unknown) {
      setCalls.push({ key, value })
      data.set(key, value)
      return this
    },
  }
}

function makeStorage(initial: Record<string, string> = {}): StoryStorage & {
  getItem: ReturnType<typeof vi.fn>
} {
  const store = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((k: string) => store.get(k) ?? null),
  }
}

describe('migrateLegacyIntroFlag', () => {
  it('sets registry INTRO_SEEN=true when legacy storage value is "1"', () => {
    const registry = makeRegistry()
    const storage = makeStorage({ [LEGACY_INTRO_SEEN_KEY]: '1' })
    migrateLegacyIntroFlag(registry, storage)
    expect(registry.data.get(StoryKeys.INTRO_SEEN)).toBe(true)
    expect(registry.setCalls).toEqual([{ key: StoryKeys.INTRO_SEEN, value: true }])
    expect(storage.getItem).toHaveBeenCalledWith(LEGACY_INTRO_SEEN_KEY)
  })

  it('is a no-op when the legacy key is absent', () => {
    const registry = makeRegistry()
    const storage = makeStorage()
    migrateLegacyIntroFlag(registry, storage)
    expect(registry.data.has(StoryKeys.INTRO_SEEN)).toBe(false)
    expect(registry.setCalls).toEqual([])
  })

  it('does not trust values other than "1" (e.g. "0", "true", empty string)', () => {
    for (const legacyValue of ['0', 'true', '', 'yes']) {
      const registry = makeRegistry()
      const storage = makeStorage({ [LEGACY_INTRO_SEEN_KEY]: legacyValue })
      migrateLegacyIntroFlag(registry, storage)
      expect(registry.data.has(StoryKeys.INTRO_SEEN)).toBe(false)
    }
  })

  it('is a no-op when storage is undefined (e.g. SSR / headless boot)', () => {
    const registry = makeRegistry()
    expect(() => migrateLegacyIntroFlag(registry, undefined)).not.toThrow()
    expect(registry.setCalls).toEqual([])
  })

  it('swallows errors from storage.getItem (private browsing / sandboxed contexts)', () => {
    const registry = makeRegistry()
    const storage: StoryStorage = {
      getItem: () => {
        throw new Error('SecurityError: storage is disabled')
      },
    }
    expect(() => migrateLegacyIntroFlag(registry, storage)).not.toThrow()
    expect(registry.setCalls).toEqual([])
  })

  it('does not overwrite an existing INTRO_SEEN=true registry value when legacy flag missing', () => {
    const registry = makeRegistry({ [StoryKeys.INTRO_SEEN]: true })
    const storage = makeStorage()
    migrateLegacyIntroFlag(registry, storage)
    expect(registry.data.get(StoryKeys.INTRO_SEEN)).toBe(true)
    // No redundant set call.
    expect(registry.setCalls).toEqual([])
  })

  it('is idempotent when called multiple times with the legacy flag present', () => {
    const registry = makeRegistry()
    const storage = makeStorage({ [LEGACY_INTRO_SEEN_KEY]: '1' })
    migrateLegacyIntroFlag(registry, storage)
    migrateLegacyIntroFlag(registry, storage)
    expect(registry.data.get(StoryKeys.INTRO_SEEN)).toBe(true)
    // Two boots → two (idempotent) writes; harmless, and we don't want to add
    // extra branching just to avoid the second set.
    expect(registry.setCalls).toHaveLength(2)
  })

  it('only touches INTRO_SEEN, not any other story key', () => {
    const registry = makeRegistry()
    const storage = makeStorage({ [LEGACY_INTRO_SEEN_KEY]: '1' })
    migrateLegacyIntroFlag(registry, storage)
    expect(registry.setCalls.map((c) => c.key)).toEqual([StoryKeys.INTRO_SEEN])
  })
})
