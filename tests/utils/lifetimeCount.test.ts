import { describe, it, expect } from 'vitest'
import { readLifetimeCount } from '../../src/utils/lifetimeCount'

/**
 * Build a minimal registry stub that answers `get(key)` with a preset value.
 * Mirrors the shape of `Phaser.Data.DataManager.get` without booting Phaser.
 */
function registryWith(entries: Record<string, unknown>): { registry: { get(key: string): unknown } } {
  return {
    registry: {
      get: (key: string) => entries[key],
    },
  }
}

describe('readLifetimeCount', () => {
  it('returns 0 when the source is undefined', () => {
    expect(readLifetimeCount(undefined, 'COLLAPSE_COUNT')).toBe(0)
  })

  it('returns 0 when the key is missing from the registry', () => {
    expect(readLifetimeCount(registryWith({}), 'COLLAPSE_COUNT')).toBe(0)
  })

  it('returns 0 when the stored value is not a number', () => {
    expect(readLifetimeCount(registryWith({ COLLAPSE_COUNT: '3' }), 'COLLAPSE_COUNT')).toBe(0)
    expect(readLifetimeCount(registryWith({ COLLAPSE_COUNT: true }), 'COLLAPSE_COUNT')).toBe(0)
    expect(readLifetimeCount(registryWith({ COLLAPSE_COUNT: null }), 'COLLAPSE_COUNT')).toBe(0)
    expect(readLifetimeCount(registryWith({ COLLAPSE_COUNT: {} }), 'COLLAPSE_COUNT')).toBe(0)
  })

  it('returns 0 for non-finite numbers (NaN, +/-Infinity)', () => {
    expect(readLifetimeCount(registryWith({ K: Number.NaN }), 'K')).toBe(0)
    expect(readLifetimeCount(registryWith({ K: Number.POSITIVE_INFINITY }), 'K')).toBe(0)
    expect(readLifetimeCount(registryWith({ K: Number.NEGATIVE_INFINITY }), 'K')).toBe(0)
  })

  it('returns 0 for zero and negative counts (the UI suppresses empty rows)', () => {
    expect(readLifetimeCount(registryWith({ K: 0 }), 'K')).toBe(0)
    expect(readLifetimeCount(registryWith({ K: -1 }), 'K')).toBe(0)
    expect(readLifetimeCount(registryWith({ K: -999 }), 'K')).toBe(0)
  })

  it('returns whole positive integers unchanged', () => {
    expect(readLifetimeCount(registryWith({ K: 1 }), 'K')).toBe(1)
    expect(readLifetimeCount(registryWith({ K: 42 }), 'K')).toBe(42)
  })

  it('floors fractional values (counters are always whole-number increments)', () => {
    expect(readLifetimeCount(registryWith({ K: 1.9 }), 'K')).toBe(1)
    expect(readLifetimeCount(registryWith({ K: 3.0001 }), 'K')).toBe(3)
  })

  it('keys are looked up independently', () => {
    const src = registryWith({ A: 2, B: 5 })
    expect(readLifetimeCount(src, 'A')).toBe(2)
    expect(readLifetimeCount(src, 'B')).toBe(5)
    expect(readLifetimeCount(src, 'C')).toBe(0)
  })
})
