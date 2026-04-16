import { describe, it, expect, beforeEach } from 'vitest'
import { StatsSystem } from '../../src/systems/StatsSystem'

describe('StatsSystem', () => {
  let stats: StatsSystem

  beforeEach(() => {
    stats = new StatsSystem()
  })

  describe('initial state', () => {
    it('starts with full stats', () => {
      expect(stats.hunger).toBe(100)
      expect(stats.thirst).toBe(100)
      expect(stats.energy).toBe(100)
    })

    it('is not collapsed', () => {
      expect(stats.collapsed).toBe(false)
    })
  })

  describe('speedMultiplier', () => {
    it('returns 1.0 at full stats', () => {
      expect(stats.speedMultiplier).toBe(1.0)
    })

    it('applies hunger < 30 penalty', () => {
      stats.hunger = 25
      expect(stats.speedMultiplier).toBe(0.8)
    })

    it('applies hunger < 10 penalty (stronger)', () => {
      stats.hunger = 5
      expect(stats.speedMultiplier).toBe(0.5)
    })

    it('applies thirst < 20 penalty', () => {
      stats.thirst = 15
      expect(stats.speedMultiplier).toBe(0.8)
    })

    it('applies energy < 20 penalty', () => {
      stats.energy = 10
      expect(stats.speedMultiplier).toBe(0.7)
    })

    it('cumulates multiple penalties', () => {
      stats.hunger = 5
      stats.thirst = 10
      stats.energy = 10
      // 0.5 * 0.8 * 0.7 = 0.28
      expect(stats.speedMultiplier).toBeCloseTo(0.28, 5)
    })

    it('floors at 0.25 when cumulative would go lower', () => {
      // At all-zero: 0.5 * 0.8 * 0.7 = 0.28, still above floor
      stats.hunger = 0
      stats.thirst = 0
      stats.energy = 0
      expect(stats.speedMultiplier).toBeCloseTo(0.28, 5)
      expect(stats.speedMultiplier).toBeGreaterThanOrEqual(0.25)
    })
  })

  describe('screenDarken', () => {
    it('is false at full stats', () => {
      expect(stats.screenDarken).toBe(false)
    })

    it('is true when hunger < 10', () => {
      stats.hunger = 5
      expect(stats.screenDarken).toBe(true)
    })

    it('is true when thirst < 10', () => {
      stats.thirst = 5
      expect(stats.screenDarken).toBe(true)
    })

    it('is false when stats are low but >= 10', () => {
      stats.hunger = 10
      stats.thirst = 10
      expect(stats.screenDarken).toBe(false)
    })
  })

  describe('canRun', () => {
    it('is true at full energy', () => {
      expect(stats.canRun).toBe(true)
    })

    it('is true at exactly 20 energy', () => {
      stats.energy = 20
      expect(stats.canRun).toBe(true)
    })

    it('is false below 20 energy', () => {
      stats.energy = 19
      expect(stats.canRun).toBe(false)
    })
  })

  describe('update — basic decay', () => {
    it('decays hunger and thirst when idle', () => {
      stats.update(10, false, false, false, false, false)
      // hunger: 100 - 0.05 * 10 = 99.5
      expect(stats.hunger).toBeCloseTo(99.5, 5)
      // thirst: 100 - 0.1 * 10 = 99.0
      expect(stats.thirst).toBeCloseTo(99.0, 5)
    })

    it('decays energy at rest rate when idle', () => {
      stats.update(10, false, false, false, false, false)
      // energy: 100 - 0.05 * 10 = 99.5
      expect(stats.energy).toBeCloseTo(99.5, 5)
    })

    it('decays energy faster when moving', () => {
      stats.update(10, true, false, false, false, false)
      // energy: 100 - 0.15 * 10 = 98.5
      expect(stats.energy).toBeCloseTo(98.5, 5)
    })

    it('decays energy fastest when running', () => {
      stats.update(10, true, true, false, false, false)
      // energy: 100 - 0.3 * 10 = 97.0
      expect(stats.energy).toBeCloseTo(97.0, 5)
    })

    it('does not update when collapsed', () => {
      stats.hunger = 0
      stats.thirst = 0
      stats.energy = 0
      // Force collapse
      stats.update(16, false, false, false, false, false)
      expect(stats.collapsed).toBe(true)

      const snapshotHunger = stats.hunger
      stats.update(10, false, false, false, false, false)
      expect(stats.hunger).toBe(snapshotHunger)
    })
  })

  describe('update — heat modifier', () => {
    it('increases decay by 1.5x during heat when not in shade', () => {
      stats.update(10, false, false, true, false, false)
      // hunger: 100 - 0.05 * 1.5 * 10 = 99.25
      expect(stats.hunger).toBeCloseTo(99.25, 5)
      // thirst: 100 - 0.1 * 1.5 * 10 = 98.5
      expect(stats.thirst).toBeCloseTo(98.5, 5)
    })

    it('negates heat modifier when in shade', () => {
      stats.update(10, false, false, true, true, false)
      // shade cancels heat: heatMod = 1.0
      expect(stats.hunger).toBeCloseTo(99.5, 5)
      expect(stats.thirst).toBeCloseTo(99.0, 5)
    })
  })

  describe('update — resting', () => {
    it('regenerates energy at open rate when resting outside', () => {
      stats.energy = 50
      stats.update(10, false, false, false, false, false, true)
      // energy: 50 + 0.5 * 10 = 55
      expect(stats.energy).toBeCloseTo(55, 5)
    })

    it('regenerates energy at shade rate when resting in shade', () => {
      stats.energy = 50
      stats.update(10, false, false, false, true, false, true)
      // energy: 50 + 1.0 * 10 = 60
      expect(stats.energy).toBeCloseTo(60, 5)
    })

    it('regenerates energy at safe rate when resting in shelter', () => {
      stats.energy = 50
      stats.update(10, false, false, false, false, true, true)
      // energy: 50 + 2.0 * 10 = 70
      expect(stats.energy).toBeCloseTo(70, 5)
    })

    it('reduces hunger/thirst decay to 10% while resting', () => {
      stats.update(100, false, false, false, false, false, true)
      // hunger: 100 - 0.05 * 0.1 * 100 = 99.5
      expect(stats.hunger).toBeCloseTo(99.5, 5)
      // thirst: 100 - 0.1 * 0.1 * 100 = 99.0
      expect(stats.thirst).toBeCloseTo(99.0, 5)
    })

    it('caps energy at 100', () => {
      stats.energy = 99
      stats.update(100, false, false, false, false, true, true)
      expect(stats.energy).toBe(100)
    })
  })

  describe('update — passive shade/shelter regen (idle, not resting)', () => {
    it('regens energy passively in shelter when idle', () => {
      stats.energy = 50
      stats.update(10, false, false, false, false, true)
      // Idle decay: 50 - 0.05*10 = 49.5, then shelter regen: 49.5 + 1.0*10 = 59.5
      expect(stats.energy).toBeCloseTo(59.5, 5)
    })

    it('regens energy passively in shade when idle', () => {
      stats.energy = 50
      stats.update(10, false, false, false, true, false)
      // Idle decay: 50 - 0.05*10 = 49.5, then shade regen: 49.5 + 0.5*10 = 54.5
      expect(stats.energy).toBeCloseTo(54.5, 5)
    })
  })

  describe('update — collapse', () => {
    it('does not collapse immediately at zero stats', () => {
      stats.hunger = 0
      stats.update(1, false, false, false, false, false)
      expect(stats.collapsed).toBe(false)
    })

    it('does not collapse just under 15s', () => {
      stats.hunger = 0
      stats.update(14.9, false, false, false, false, false)
      expect(stats.collapsed).toBe(false)
    })

    it('collapses at exactly 15s cumulative', () => {
      stats.hunger = 0
      stats.update(15, false, false, false, false, false)
      expect(stats.collapsed).toBe(true)
    })

    it('resets collapse timer when stats recover above zero', () => {
      stats.hunger = 0
      stats.update(10, false, false, false, false, false)
      // Restore hunger so no stat is at zero (thirst/energy still > 0)
      stats.restore('hunger', 50)
      stats.update(10, false, false, false, false, false)
      // 10s more at non-zero stats should not collapse
      expect(stats.collapsed).toBe(false)
    })

    it('does not collapse while resting even at zero stats', () => {
      stats.hunger = 0
      stats.update(20, false, false, false, false, false, true)
      expect(stats.collapsed).toBe(false)
    })
  })

  describe('restore', () => {
    it('adds to a stat and returns delta', () => {
      stats.hunger = 50
      const delta = stats.restore('hunger', 30)
      expect(stats.hunger).toBe(80)
      expect(delta).toBe(30)
    })

    it('clamps at 100 and returns actual delta', () => {
      stats.hunger = 90
      const delta = stats.restore('hunger', 20)
      expect(stats.hunger).toBe(100)
      expect(delta).toBe(10)
    })

    it('clamps at 0 for negative amounts', () => {
      stats.hunger = 5
      const delta = stats.restore('hunger', -10)
      expect(stats.hunger).toBe(0)
      expect(delta).toBe(-5)
    })
  })

  describe('resetCollapse', () => {
    it('clears collapsed state and raises minimum stats', () => {
      stats.hunger = 0
      stats.thirst = 0
      stats.energy = 0
      stats.update(16, false, false, false, false, false)
      expect(stats.collapsed).toBe(true)

      stats.resetCollapse()
      expect(stats.collapsed).toBe(false)
      expect(stats.energy).toBe(30)
      expect(stats.hunger).toBe(15)
      expect(stats.thirst).toBe(15)
    })

    it('does not lower stats that are already above minimums', () => {
      // Force collapse, then set stats to desired values before resetting
      stats.hunger = 0
      stats.update(16, false, false, false, false, false)
      expect(stats.collapsed).toBe(true)

      // Manually set stats above the reset minimums
      stats.thirst = 50
      stats.energy = 80

      stats.resetCollapse()
      expect(stats.thirst).toBe(50)
      expect(stats.energy).toBe(80)
    })
  })

  describe('toJSON / fromJSON', () => {
    it('round-trips correctly', () => {
      stats.hunger = 42
      stats.thirst = 73
      stats.energy = 15
      const json = stats.toJSON()

      const restored = new StatsSystem()
      restored.fromJSON(json)
      expect(restored.hunger).toBe(42)
      expect(restored.thirst).toBe(73)
      expect(restored.energy).toBe(15)
    })

    it('clears collapse state on restore', () => {
      stats.hunger = 0
      stats.update(16, false, false, false, false, false)
      expect(stats.collapsed).toBe(true)

      stats.fromJSON({ hunger: 50, thirst: 50, energy: 50 })
      expect(stats.collapsed).toBe(false)
    })

    it('clamps out-of-range values', () => {
      stats.fromJSON({ hunger: 150, thirst: -20, energy: 50 })
      expect(stats.hunger).toBe(100)
      expect(stats.thirst).toBe(0)
      expect(stats.energy).toBe(50)
    })

    it('falls back to 100 for non-finite values', () => {
      stats.fromJSON({ hunger: NaN, thirst: Infinity, energy: 50 })
      expect(stats.hunger).toBe(100)
      expect(stats.thirst).toBe(100)
      expect(stats.energy).toBe(50)
    })
  })
})
