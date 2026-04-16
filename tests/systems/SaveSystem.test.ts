import { describe, it, expect } from 'vitest'
import { isValidSave } from '../../src/systems/SaveSystem'

function validSaveData(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    playerPosition: { x: 100, y: 200 },
    stats: { hunger: 80, thirst: 60, energy: 90 },
    timeOfDay: 'day',
    gameTimeMs: 120000,
    variables: {},
    ...overrides,
  }
}

describe('isValidSave', () => {
  it('accepts a minimal valid save', () => {
    expect(isValidSave(validSaveData())).toBe(true)
  })

  it('accepts all four time-of-day phases', () => {
    for (const phase of ['dawn', 'day', 'evening', 'night']) {
      expect(isValidSave(validSaveData({ timeOfDay: phase }))).toBe(true)
    }
  })

  it('accepts valid sourceStates', () => {
    const data = validSaveData({
      sourceStates: [
        { type: 'feeding_station', x: 10, y: 20, lastUsedAt: 5000 },
        { type: 'fountain', x: 30, y: 40, lastUsedAt: 6000 },
        { type: 'water_bowl', x: 50, y: 60, lastUsedAt: 7000 },
        { type: 'restaurant_scraps', x: 70, y: 80, lastUsedAt: 8000 },
        { type: 'bugs', x: 90, y: 100, lastUsedAt: 9000 },
        { type: 'safe_sleep', x: 110, y: 120, lastUsedAt: 10000 },
      ],
    })
    expect(isValidSave(data)).toBe(true)
  })

  it('accepts save without sourceStates (optional field)', () => {
    const data = validSaveData()
    delete (data as Record<string, unknown>).sourceStates
    expect(isValidSave(data)).toBe(true)
  })

  // --- Rejection cases ---

  it('rejects null', () => {
    expect(isValidSave(null)).toBe(false)
  })

  it('rejects non-object', () => {
    expect(isValidSave('not an object')).toBe(false)
    expect(isValidSave(42)).toBe(false)
  })

  it('rejects missing version', () => {
    const data = validSaveData()
    delete (data as Record<string, unknown>).version
    expect(isValidSave(data)).toBe(false)
  })

  it('rejects future version', () => {
    expect(isValidSave(validSaveData({ version: 2 }))).toBe(false)
  })

  it('rejects invalid timeOfDay', () => {
    expect(isValidSave(validSaveData({ timeOfDay: 'midnight' }))).toBe(false)
  })

  it('rejects non-string timeOfDay', () => {
    expect(isValidSave(validSaveData({ timeOfDay: 42 }))).toBe(false)
  })

  it('rejects missing gameTimeMs', () => {
    const data = validSaveData()
    delete (data as Record<string, unknown>).gameTimeMs
    expect(isValidSave(data)).toBe(false)
  })

  it('rejects missing playerPosition', () => {
    const data = validSaveData()
    delete (data as Record<string, unknown>).playerPosition
    expect(isValidSave(data)).toBe(false)
  })

  it('rejects playerPosition with non-numeric x', () => {
    expect(isValidSave(validSaveData({ playerPosition: { x: 'a', y: 1 } }))).toBe(false)
  })

  it('rejects missing stats', () => {
    const data = validSaveData()
    delete (data as Record<string, unknown>).stats
    expect(isValidSave(data)).toBe(false)
  })

  it('rejects stats missing a field', () => {
    expect(isValidSave(validSaveData({ stats: { hunger: 50, thirst: 50 } }))).toBe(false)
  })

  it('rejects non-array sourceStates', () => {
    expect(isValidSave(validSaveData({ sourceStates: 'bad' }))).toBe(false)
  })

  it('rejects sourceStates entry with invalid type', () => {
    const data = validSaveData({
      sourceStates: [{ type: 'unknown_source', x: 1, y: 2, lastUsedAt: 0 }],
    })
    expect(isValidSave(data)).toBe(false)
  })

  it('rejects sourceStates entry missing coordinates', () => {
    const data = validSaveData({
      sourceStates: [{ type: 'fountain', lastUsedAt: 0 }],
    })
    expect(isValidSave(data)).toBe(false)
  })

  it('rejects sourceStates entry with null element', () => {
    const data = validSaveData({ sourceStates: [null] })
    expect(isValidSave(data)).toBe(false)
  })
})
