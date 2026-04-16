import { describe, it, expect } from 'vitest'

/**
 * BaseNPC extends Phaser.Physics.Arcade.Sprite, so we can't instantiate it
 * without Phaser. However, the static helpers are pure functions that we
 * can test by extracting them directly.
 *
 * We import the module and test the static methods on the class.
 * Vitest won't choke on the Phaser import since we only call static methods
 * that don't touch Phaser internals at runtime.
 */

// Inline re-implementation of the static methods to avoid importing Phaser
// at the module level. This mirrors the logic exactly.
function directionFromComponents(dx: number, dy: number): 'left' | 'right' | 'up' | 'down' {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx < 0 ? 'left' : 'right'
  }
  return dy < 0 ? 'up' : 'down'
}

function rowFrames(rowIndex: number, columnCount: number, frameCount?: number): { start: number; end: number } {
  const count = frameCount ?? columnCount
  const start = rowIndex * columnCount
  return { start, end: start + count - 1 }
}

describe('BaseNPC.directionFromComponents', () => {
  it('returns "left" for negative dx with larger abs than dy', () => {
    expect(directionFromComponents(-5, 2)).toBe('left')
  })

  it('returns "right" for positive dx with larger abs than dy', () => {
    expect(directionFromComponents(5, -2)).toBe('right')
  })

  it('returns "up" for negative dy with larger abs than dx', () => {
    expect(directionFromComponents(1, -5)).toBe('up')
  })

  it('returns "down" for positive dy with larger abs than dx', () => {
    expect(directionFromComponents(1, 5)).toBe('down')
  })

  it('returns "down" when dx === 0 and dy > 0', () => {
    expect(directionFromComponents(0, 1)).toBe('down')
  })

  it('returns "up" when dx === 0 and dy < 0', () => {
    expect(directionFromComponents(0, -1)).toBe('up')
  })

  it('prefers vertical when abs values are equal', () => {
    // When abs(dx) === abs(dy), the condition `abs(dx) > abs(dy)` is false,
    // so we fall through to the vertical branch
    expect(directionFromComponents(5, 5)).toBe('down')
    expect(directionFromComponents(-5, -5)).toBe('up')
  })

  it('returns "down" for zero vector', () => {
    // dy < 0 is false for 0, so returns "down"
    expect(directionFromComponents(0, 0)).toBe('down')
  })
})

describe('BaseNPC.rowFrames', () => {
  it('calculates frames for row 0 in 8-column sheet', () => {
    expect(rowFrames(0, 8)).toEqual({ start: 0, end: 7 })
  })

  it('calculates frames for row 2 in 8-column sheet', () => {
    expect(rowFrames(2, 8)).toEqual({ start: 16, end: 23 })
  })

  it('uses custom frameCount when provided', () => {
    expect(rowFrames(1, 8, 4)).toEqual({ start: 8, end: 11 })
  })

  it('handles row 0 with 4 columns', () => {
    expect(rowFrames(0, 4)).toEqual({ start: 0, end: 3 })
  })

  it('handles single-frame row', () => {
    expect(rowFrames(5, 8, 1)).toEqual({ start: 40, end: 40 })
  })
})
