import { describe, it, expect, beforeEach } from 'vitest'
import { TerritorySystem } from '../../src/systems/TerritorySystem'

describe('TerritorySystem', () => {
  let territory: TerritorySystem

  beforeEach(() => {
    territory = new TerritorySystem()
  })

  describe('initial state', () => {
    it('starts unclaimed', () => {
      expect(territory.isClaimed).toBe(false)
    })

    it('has claimedOnDay of 0', () => {
      expect(territory.claimedOnDay).toBe(0)
    })
  })

  describe('claim', () => {
    it('marks territory as claimed with the given day', () => {
      territory.claim(5)
      expect(territory.isClaimed).toBe(true)
      expect(territory.claimedOnDay).toBe(5)
    })
  })

  describe('toJSON / fromJSON', () => {
    it('round-trips correctly', () => {
      territory.claim(3)
      const json = territory.toJSON()

      const restored = new TerritorySystem()
      restored.fromJSON(json)
      expect(restored.isClaimed).toBe(true)
      expect(restored.claimedOnDay).toBe(3)
    })

    it('ignores non-boolean claimed', () => {
      const restored = new TerritorySystem()
      restored.fromJSON({ claimed: 'yes' as unknown as boolean, claimedOnDay: 2 })
      expect(restored.isClaimed).toBe(false)
    })

    it('ignores non-numeric claimedOnDay', () => {
      const restored = new TerritorySystem()
      restored.fromJSON({ claimed: true, claimedOnDay: 'bad' as unknown as number })
      expect(restored.isClaimed).toBe(true)
      expect(restored.claimedOnDay).toBe(0)
    })

    it('ignores Infinity for claimedOnDay', () => {
      const restored = new TerritorySystem()
      restored.fromJSON({ claimed: true, claimedOnDay: Infinity })
      expect(restored.isClaimed).toBe(true)
      expect(restored.claimedOnDay).toBe(0)
    })
  })
})
