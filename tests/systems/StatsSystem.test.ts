import { describe, it, expect, beforeEach } from 'vitest'
import {
  StatsSystem,
  COLLAPSE_THRESHOLD_MS,
  STATS_DECAY,
  STATS_HEAT_MULTIPLIER,
  STATS_RESET_MIN_ENERGY,
  STATS_RESET_MIN_HUNGER,
  STATS_RESET_MIN_THIRST,
  STATS_REST_DECAY_MULTIPLIER,
  STATS_REST_RATE_OPEN,
  STATS_REST_RATE_SAFE,
  STATS_REST_RATE_SHADE,
  STATS_SHADE_ENERGY_REGEN,
  STATS_SHELTER_ENERGY_REGEN,
  STATS_SPEED_PENALTY,
} from '../../src/systems/StatsSystem'

/**
 * Seconds just above the collapse threshold. Kept in test code (not in the
 * module under test) so tests fail loudly if COLLAPSE_THRESHOLD_MS ever
 * changes in a way that invalidates their intent.
 */
const COLLAPSE_DELTA_SEC = COLLAPSE_THRESHOLD_MS / 1000 + 1

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
      expect(stats.speedMultiplier).toBe(STATS_SPEED_PENALTY.hunger30)
    })

    it('applies hunger < 10 penalty (stronger)', () => {
      stats.hunger = 5
      expect(stats.speedMultiplier).toBe(STATS_SPEED_PENALTY.hunger10)
    })

    it('applies thirst < 20 penalty', () => {
      stats.thirst = 15
      expect(stats.speedMultiplier).toBe(STATS_SPEED_PENALTY.thirst20)
    })

    it('applies energy < 20 penalty', () => {
      stats.energy = 10
      expect(stats.speedMultiplier).toBe(STATS_SPEED_PENALTY.energy20)
    })

    it('cumulates multiple penalties', () => {
      // hunger30 × thirst20 × energy20 = 0.18 > minMultiplier so this asserts
      // multiplication, not only the floor (hunger10 × thirst20 × energy20 = 0.09 would floor).
      stats.hunger = 25
      stats.thirst = 10
      stats.energy = 10
      const raw =
        STATS_SPEED_PENALTY.hunger30 *
        STATS_SPEED_PENALTY.thirst20 *
        STATS_SPEED_PENALTY.energy20
      expect(raw).toBeGreaterThan(STATS_SPEED_PENALTY.minMultiplier)
      const expected = Math.max(STATS_SPEED_PENALTY.minMultiplier, raw)
      expect(stats.speedMultiplier).toBeCloseTo(expected, 5)
    })

    it('floors at minMultiplier when stacked penalties would be lower', () => {
      stats.hunger = 0
      stats.thirst = 0
      stats.energy = 0
      const raw =
        STATS_SPEED_PENALTY.hunger10 *
        STATS_SPEED_PENALTY.thirst20 *
        STATS_SPEED_PENALTY.energy20
      const expected = Math.max(STATS_SPEED_PENALTY.minMultiplier, raw)
      expect(stats.speedMultiplier).toBeCloseTo(expected, 5)
      expect(stats.speedMultiplier).toBeGreaterThanOrEqual(STATS_SPEED_PENALTY.minMultiplier)
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
      const deltaSec = 10
      stats.update(deltaSec, false, false, false, false, false)
      expect(stats.hunger).toBeCloseTo(100 - STATS_DECAY.hunger * deltaSec, 5)
      expect(stats.thirst).toBeCloseTo(100 - STATS_DECAY.thirst * deltaSec, 5)
    })

    it('decays energy at rest rate when idle', () => {
      const deltaSec = 10
      stats.update(deltaSec, false, false, false, false, false)
      expect(stats.energy).toBeCloseTo(100 - STATS_DECAY.energyRest * deltaSec, 5)
    })

    it('decays energy faster when moving', () => {
      const deltaSec = 10
      stats.update(deltaSec, true, false, false, false, false)
      expect(stats.energy).toBeCloseTo(100 - STATS_DECAY.energyMoving * deltaSec, 5)
    })

    it('decays energy fastest when running', () => {
      const deltaSec = 10
      stats.update(deltaSec, true, true, false, false, false)
      expect(stats.energy).toBeCloseTo(100 - STATS_DECAY.energyRunning * deltaSec, 5)
    })

    it('does not update when collapsed', () => {
      stats.hunger = 0
      stats.thirst = 0
      stats.energy = 0
      stats.update(COLLAPSE_DELTA_SEC, false, false, false, false, false)
      expect(stats.collapsed).toBe(true)

      const snapshotHunger = stats.hunger
      stats.update(10, false, false, false, false, false)
      expect(stats.hunger).toBe(snapshotHunger)
    })
  })

  describe('update — heat modifier', () => {
    it('increases decay by heat multiplier during heat when not in shade', () => {
      const deltaSec = 10
      stats.update(deltaSec, false, false, true, false, false)
      expect(stats.hunger).toBeCloseTo(
        100 - STATS_DECAY.hunger * STATS_HEAT_MULTIPLIER * deltaSec,
        5,
      )
      expect(stats.thirst).toBeCloseTo(
        100 - STATS_DECAY.thirst * STATS_HEAT_MULTIPLIER * deltaSec,
        5,
      )
    })

    it('negates heat modifier when in shade', () => {
      const deltaSec = 10
      stats.update(deltaSec, false, false, true, true, false)
      expect(stats.hunger).toBeCloseTo(100 - STATS_DECAY.hunger * deltaSec, 5)
      expect(stats.thirst).toBeCloseTo(100 - STATS_DECAY.thirst * deltaSec, 5)
    })
  })

  describe('update — resting', () => {
    it('regenerates energy at open rate when resting outside', () => {
      const deltaSec = 10
      const start = 50
      stats.energy = start
      stats.update(deltaSec, false, false, false, false, false, true)
      expect(stats.energy).toBeCloseTo(start + STATS_REST_RATE_OPEN * deltaSec, 5)
    })

    it('regenerates energy at shade rate when resting in shade', () => {
      const deltaSec = 10
      const start = 50
      stats.energy = start
      stats.update(deltaSec, false, false, false, true, false, true)
      expect(stats.energy).toBeCloseTo(start + STATS_REST_RATE_SHADE * deltaSec, 5)
    })

    it('regenerates energy at safe rate when resting in shelter', () => {
      const deltaSec = 10
      const start = 50
      stats.energy = start
      stats.update(deltaSec, false, false, false, false, true, true)
      expect(stats.energy).toBeCloseTo(start + STATS_REST_RATE_SAFE * deltaSec, 5)
    })

    it('reduces hunger/thirst decay while resting', () => {
      const deltaSec = 100
      stats.update(deltaSec, false, false, false, false, false, true)
      expect(stats.hunger).toBeCloseTo(
        100 - STATS_DECAY.hunger * STATS_REST_DECAY_MULTIPLIER * deltaSec,
        5,
      )
      expect(stats.thirst).toBeCloseTo(
        100 - STATS_DECAY.thirst * STATS_REST_DECAY_MULTIPLIER * deltaSec,
        5,
      )
    })

    it('caps energy at 100', () => {
      stats.energy = 99
      stats.update(100, false, false, false, false, true, true)
      expect(stats.energy).toBe(100)
    })
  })

  describe('update — passive shade/shelter regen (idle, not resting)', () => {
    it('regens energy passively in shelter when idle', () => {
      const deltaSec = 10
      const start = 50
      stats.energy = start
      stats.update(deltaSec, false, false, false, false, true)
      const afterDecay = start - STATS_DECAY.energyRest * deltaSec
      expect(stats.energy).toBeCloseTo(afterDecay + STATS_SHELTER_ENERGY_REGEN * deltaSec, 5)
    })

    it('regens energy passively in shade when idle', () => {
      const deltaSec = 10
      const start = 50
      stats.energy = start
      stats.update(deltaSec, false, false, false, true, false)
      const afterDecay = start - STATS_DECAY.energyRest * deltaSec
      expect(stats.energy).toBeCloseTo(afterDecay + STATS_SHADE_ENERGY_REGEN * deltaSec, 5)
    })
  })

  describe('update — collapse', () => {
    it('does not collapse immediately at zero stats', () => {
      stats.hunger = 0
      stats.update(1, false, false, false, false, false)
      expect(stats.collapsed).toBe(false)
    })

    it('does not collapse just under the grace period', () => {
      stats.hunger = 0
      stats.update(COLLAPSE_THRESHOLD_MS / 1000 - 0.1, false, false, false, false, false)
      expect(stats.collapsed).toBe(false)
    })

    it('collapses once cumulative time crosses the grace period', () => {
      stats.hunger = 0
      stats.update(COLLAPSE_DELTA_SEC, false, false, false, false, false)
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
      stats.update(COLLAPSE_DELTA_SEC, false, false, false, false, false)
      expect(stats.collapsed).toBe(true)

      stats.resetCollapse()
      expect(stats.collapsed).toBe(false)
      expect(stats.energy).toBe(STATS_RESET_MIN_ENERGY)
      expect(stats.hunger).toBe(STATS_RESET_MIN_HUNGER)
      expect(stats.thirst).toBe(STATS_RESET_MIN_THIRST)
    })

    it('does not lower stats that are already above minimums', () => {
      stats.hunger = 0
      stats.update(COLLAPSE_DELTA_SEC, false, false, false, false, false)
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
      stats.update(COLLAPSE_DELTA_SEC, false, false, false, false, false)
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
