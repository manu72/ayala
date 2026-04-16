import { describe, it, expect, beforeEach } from 'vitest'
import { TrustSystem } from '../../src/systems/TrustSystem'

describe('TrustSystem', () => {
  let trust: TrustSystem

  beforeEach(() => {
    trust = new TrustSystem()
  })

  describe('initial state', () => {
    it('starts with zero global trust', () => {
      expect(trust.global).toBe(0)
    })

    it('returns zero for unknown cat', () => {
      expect(trust.getCatTrust('Blacky')).toBe(0)
    })
  })

  describe('firstConversation', () => {
    it('awards 5 global and 10 cat trust', () => {
      trust.firstConversation('Tiger')
      expect(trust.global).toBe(5)
      expect(trust.getCatTrust('Tiger')).toBe(10)
    })
  })

  describe('returnConversation', () => {
    it('awards 2 global and 5 cat trust', () => {
      trust.returnConversation('Blacky')
      expect(trust.global).toBe(2)
      expect(trust.getCatTrust('Blacky')).toBe(5)
    })
  })

  describe('proximityTick', () => {
    it('does not award at timestamp 0 (default cooldown is 0, so 0-0 < interval)', () => {
      trust.proximityTick('Jayco', 0)
      expect(trust.global).toBe(0)
    })

    it('awards trust on first tick with sufficient timestamp', () => {
      trust.proximityTick('Jayco', 30_000)
      expect(trust.global).toBe(1)
      expect(trust.getCatTrust('Jayco')).toBe(2)
    })

    it('throttles within 30s cooldown', () => {
      trust.proximityTick('Jayco', 30_000)
      trust.proximityTick('Jayco', 45_000)
      expect(trust.global).toBe(1)
      expect(trust.getCatTrust('Jayco')).toBe(2)
    })

    it('awards again after cooldown expires', () => {
      trust.proximityTick('Jayco', 30_000)
      trust.proximityTick('Jayco', 60_000)
      expect(trust.global).toBe(2)
      expect(trust.getCatTrust('Jayco')).toBe(4)
    })

    it('tracks cooldowns independently per cat', () => {
      trust.proximityTick('Jayco', 30_000)
      trust.proximityTick('Tiger', 30_000)
      expect(trust.global).toBe(2)
      expect(trust.getCatTrust('Jayco')).toBe(2)
      expect(trust.getCatTrust('Tiger')).toBe(2)
    })
  })

  describe('seenEating', () => {
    it('awards 1 global trust', () => {
      trust.seenEating()
      expect(trust.global).toBe(1)
    })
  })

  describe('survivedDay', () => {
    it('awards 3 global trust', () => {
      trust.survivedDay()
      expect(trust.global).toBe(3)
    })
  })

  describe('clamping at MAX_TRUST (100)', () => {
    it('caps global trust at 100', () => {
      for (let i = 0; i < 50; i++) trust.survivedDay()
      expect(trust.global).toBe(100)
    })

    it('caps per-cat trust at 100', () => {
      for (let i = 0; i < 20; i++) trust.firstConversation('Blacky')
      expect(trust.getCatTrust('Blacky')).toBe(100)
    })
  })

  describe('toJSON / fromJSON', () => {
    it('round-trips correctly', () => {
      trust.firstConversation('Tiger')
      trust.survivedDay()
      const json = trust.toJSON()

      const restored = new TrustSystem()
      restored.fromJSON(json)
      expect(restored.global).toBe(8)
      expect(restored.getCatTrust('Tiger')).toBe(10)
    })

    it('clamps out-of-range values on restore', () => {
      trust.fromJSON({ global: 150, cats: { Tiger: -10, Blacky: 200 } })
      expect(trust.global).toBe(100)
      expect(trust.getCatTrust('Tiger')).toBe(0)
      expect(trust.getCatTrust('Blacky')).toBe(100)
    })

    it('handles missing cats gracefully', () => {
      trust.fromJSON({ global: 50, cats: {} })
      expect(trust.global).toBe(50)
      expect(trust.getCatTrust('Tiger')).toBe(0)
    })

    it('handles non-numeric cat values', () => {
      trust.fromJSON({ global: 10, cats: { Tiger: 'bad' as unknown as number } })
      expect(trust.getCatTrust('Tiger')).toBe(0)
    })

    it('handles NaN/Infinity for global', () => {
      trust.fromJSON({ global: NaN, cats: {} })
      expect(trust.global).toBe(0)
    })
  })
})
