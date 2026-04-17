import { describe, it, expect } from 'vitest'
import { computeBackgroundSpawnCount, decrementColonyTotal } from '../../src/utils/colonySpawn'

/**
 * `COLONY_COUNT` is the total colony population (named + Mamma + background).
 * The visible background roster is `clamp(total - namedAndMamma, 0, cap)`.
 *
 * Project defaults at time of writing: namedAndMamma=9, cap=12, initial=42.
 * Tests use those values unless exploring edges.
 */

describe('computeBackgroundSpawnCount', () => {
  it('fresh game: total 42 → cap kicks in at 12', () => {
    expect(computeBackgroundSpawnCount(42, 9, 12)).toBe(12)
  })

  it('healthy colony still above cap: total 30 → capped at 12', () => {
    expect(computeBackgroundSpawnCount(30, 9, 12)).toBe(12)
  })

  it('boundary — total equal to namedAndMamma + cap: exactly cap', () => {
    expect(computeBackgroundSpawnCount(21, 9, 12)).toBe(12)
  })

  it('just below cap boundary: total 20 → 11', () => {
    expect(computeBackgroundSpawnCount(20, 9, 12)).toBe(11)
  })

  it('total at floor: no background cats visible', () => {
    expect(computeBackgroundSpawnCount(9, 9, 12)).toBe(0)
  })

  it('total below floor (defensive): clamps to 0', () => {
    expect(computeBackgroundSpawnCount(5, 9, 12)).toBe(0)
  })

  it('non-finite inputs return 0 rather than NaN', () => {
    expect(computeBackgroundSpawnCount(Number.NaN, 9, 12)).toBe(0)
    expect(computeBackgroundSpawnCount(42, Number.NaN, 12)).toBe(0)
    expect(computeBackgroundSpawnCount(42, 9, Number.NaN)).toBe(0)
    expect(computeBackgroundSpawnCount(42, 9, Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('zero or negative cap returns 0 (no visible cats)', () => {
    expect(computeBackgroundSpawnCount(42, 9, 0)).toBe(0)
    expect(computeBackgroundSpawnCount(42, 9, -5)).toBe(0)
  })

  it('fractional inputs are floored (counters are whole-number)', () => {
    expect(computeBackgroundSpawnCount(20.9, 9, 12)).toBe(11)
    expect(computeBackgroundSpawnCount(20, 8.7, 12)).toBe(12)
  })
})

describe('decrementColonyTotal', () => {
  it('decrements a healthy count by 1', () => {
    expect(decrementColonyTotal(42, 9)).toBe(41)
  })

  it('clamps at floor — cannot drop below named+Mamma', () => {
    expect(decrementColonyTotal(9, 9)).toBe(9)
    expect(decrementColonyTotal(10, 9)).toBe(9)
  })

  it('defensive on corrupt / missing current value — treats as floor', () => {
    expect(decrementColonyTotal(Number.NaN, 9)).toBe(9)
    expect(decrementColonyTotal(Number.POSITIVE_INFINITY, 9)).toBe(9)
  })

  it('floors fractional currents before decrementing', () => {
    expect(decrementColonyTotal(42.7, 9)).toBe(41)
  })

  it('non-finite floor is treated as 0', () => {
    expect(decrementColonyTotal(5, Number.NaN)).toBe(4)
    expect(decrementColonyTotal(0, Number.NaN)).toBe(0)
  })
})
