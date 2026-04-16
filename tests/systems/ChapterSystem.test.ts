import { describe, it, expect, beforeEach } from 'vitest'
import { ChapterSystem } from '../../src/systems/ChapterSystem'
import type { ChapterContext } from '../../src/systems/ChapterSystem'
import { TrustSystem } from '../../src/systems/TrustSystem'
import { TerritorySystem } from '../../src/systems/TerritorySystem'

/**
 * Minimal stub for Phaser.Data.DataManager — only get/set used by ChapterSystem.
 */
function createStubRegistry(): ChapterContext['registry'] {
  const store: Record<string, unknown> = {}
  return {
    get: (key: string) => store[key],
    set: (key: string, value: unknown) => { store[key] = value },
  } as unknown as ChapterContext['registry']
}

interface StubDayNight {
  dayCount: number;
}

function createContext(overrides: Partial<{
  globalTrust: number
  knownCats: string[]
  dayCount: number
  registryData: Record<string, unknown>
  territoryClaimed: boolean
}> = {}): ChapterContext {
  const trust = new TrustSystem()
  if (overrides.globalTrust) {
    trust.fromJSON({ global: overrides.globalTrust, cats: {} })
  }

  const territory = new TerritorySystem()
  if (overrides.territoryClaimed) territory.claim(1)

  const registry = createStubRegistry()
  if (overrides.registryData) {
    for (const [k, v] of Object.entries(overrides.registryData)) {
      registry.set(k, v)
    }
  }

  const dayNight: StubDayNight = { dayCount: overrides.dayCount ?? 1 }

  return {
    trust,
    dayNight: dayNight as unknown as ChapterContext['dayNight'],
    knownCats: new Set(overrides.knownCats ?? []),
    registry,
    territory,
  }
}

describe('ChapterSystem', () => {
  let chapters: ChapterSystem

  beforeEach(() => {
    chapters = new ChapterSystem()
  })

  describe('initial state', () => {
    it('starts at chapter 1', () => {
      expect(chapters.chapter).toBe(1)
    })

    it('has no pending narration', () => {
      expect(chapters.consumeNarration()).toBeNull()
    })
  })

  describe('getIntroNarration', () => {
    it('returns chapter 1 narration', () => {
      const narration = chapters.getIntroNarration()
      expect(narration.length).toBeGreaterThan(0)
      expect(narration[0]).toContain('car door')
    })
  })

  describe('restore', () => {
    it('restores to a valid chapter', () => {
      chapters.restore(3)
      expect(chapters.chapter).toBe(3)
    })

    it('clamps below 1 to 1', () => {
      chapters.restore(0)
      expect(chapters.chapter).toBe(1)
    })

    it('clamps above max to max (6)', () => {
      chapters.restore(99)
      expect(chapters.chapter).toBe(6)
    })

    it('handles NaN gracefully', () => {
      chapters.restore(NaN)
      expect(chapters.chapter).toBe(1)
    })

    it('handles fractional values by flooring', () => {
      chapters.restore(3.7)
      expect(chapters.chapter).toBe(3)
    })
  })

  describe('check — chapter 2 conditions', () => {
    it('does not advance without CH1_RESTED', () => {
      const ctx = createContext({ globalTrust: 30, knownCats: ['Blacky', 'Tiger'] })
      expect(chapters.check(ctx)).toBe(false)
      expect(chapters.chapter).toBe(1)
    })

    it('does not advance with low trust', () => {
      const ctx = createContext({
        globalTrust: 20,
        knownCats: ['Blacky', 'Tiger'],
        registryData: { CH1_RESTED: true },
      })
      expect(chapters.check(ctx)).toBe(false)
    })

    it('does not advance with fewer than 2 known cats', () => {
      const ctx = createContext({
        globalTrust: 30,
        knownCats: ['Blacky'],
        registryData: { CH1_RESTED: true },
      })
      expect(chapters.check(ctx)).toBe(false)
    })

    it('advances to chapter 2 when all conditions met', () => {
      const ctx = createContext({
        globalTrust: 25,
        knownCats: ['Blacky', 'Tiger'],
        registryData: { CH1_RESTED: true },
      })
      expect(chapters.check(ctx)).toBe(true)
      expect(chapters.chapter).toBe(2)
    })

    it('sets pending narration on advance', () => {
      const ctx = createContext({
        globalTrust: 25,
        knownCats: ['Blacky', 'Tiger'],
        registryData: { CH1_RESTED: true },
      })
      chapters.check(ctx)
      const narration = chapters.consumeNarration()
      expect(narration).not.toBeNull()
      expect(narration!.length).toBeGreaterThan(0)
    })

    it('sets CHAPTER in registry on advance', () => {
      const ctx = createContext({
        globalTrust: 25,
        knownCats: ['Blacky', 'Tiger'],
        registryData: { CH1_RESTED: true },
      })
      chapters.check(ctx)
      expect(ctx.registry.get('CHAPTER')).toBe(2)
    })
  })

  describe('check — chapter 3 conditions', () => {
    it('advances from 2 to 3 with trust >= 50, 4 cats, day >= 3', () => {
      chapters.restore(2)
      const ctx = createContext({
        globalTrust: 50,
        knownCats: ['Blacky', 'Tiger', 'Jayco', 'Fluffy'],
        dayCount: 3,
      })
      expect(chapters.check(ctx)).toBe(true)
      expect(chapters.chapter).toBe(3)
    })

    it('does not advance from 2 to 3 with day < 3', () => {
      chapters.restore(2)
      const ctx = createContext({
        globalTrust: 50,
        knownCats: ['Blacky', 'Tiger', 'Jayco', 'Fluffy'],
        dayCount: 2,
      })
      expect(chapters.check(ctx)).toBe(false)
    })
  })

  describe('check — chapter 4 conditions', () => {
    it('advances from 3 to 4 with trust >= 80 and VISITED_ZONE_6', () => {
      chapters.restore(3)
      const ctx = createContext({
        globalTrust: 80,
        registryData: { VISITED_ZONE_6: true },
      })
      expect(chapters.check(ctx)).toBe(true)
      expect(chapters.chapter).toBe(4)
    })
  })

  describe('check — chapter 5 conditions', () => {
    it('advances from 4 to 5 with trust >= 90, territory claimed, day >= 5', () => {
      chapters.restore(4)
      const ctx = createContext({
        globalTrust: 90,
        territoryClaimed: true,
        dayCount: 5,
      })
      expect(chapters.check(ctx)).toBe(true)
      expect(chapters.chapter).toBe(5)
    })
  })

  describe('check — chapter 6 conditions', () => {
    it('advances from 5 to 6 with ENCOUNTER_5_COMPLETE', () => {
      chapters.restore(5)
      const ctx = createContext({
        registryData: { ENCOUNTER_5_COMPLETE: true },
      })
      expect(chapters.check(ctx)).toBe(true)
      expect(chapters.chapter).toBe(6)
    })
  })

  describe('check — no advance past chapter 6', () => {
    it('returns false at max chapter', () => {
      chapters.restore(6)
      const ctx = createContext({ globalTrust: 100 })
      expect(chapters.check(ctx)).toBe(false)
    })
  })

  describe('consumeNarration', () => {
    it('returns null after consuming', () => {
      const ctx = createContext({
        globalTrust: 25,
        knownCats: ['Blacky', 'Tiger'],
        registryData: { CH1_RESTED: true },
      })
      chapters.check(ctx)
      chapters.consumeNarration()
      expect(chapters.consumeNarration()).toBeNull()
    })
  })
})
