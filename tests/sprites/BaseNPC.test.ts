import { describe, it, expect, vi } from 'vitest'

/**
 * BaseNPC extends Phaser.Physics.Arcade.Sprite. We only exercise static helpers,
 * but the module still loads the parent class — mock Phaser before importing BaseNPC.
 */
vi.mock('phaser', () => ({
  default: {
    Physics: {
      Arcade: {
        Sprite: class MockSprite {},
      },
    },
  },
}))

import { BaseNPC } from '../../src/sprites/BaseNPC'

describe('BaseNPC.directionFromComponents', () => {
  it('returns "left" for negative dx with larger abs than dy', () => {
    expect(BaseNPC.directionFromComponents(-5, 2)).toBe('left')
  })

  it('returns "right" for positive dx with larger abs than dy', () => {
    expect(BaseNPC.directionFromComponents(5, -2)).toBe('right')
  })

  it('returns "up" for negative dy with larger abs than dx', () => {
    expect(BaseNPC.directionFromComponents(1, -5)).toBe('up')
  })

  it('returns "down" for positive dy with larger abs than dx', () => {
    expect(BaseNPC.directionFromComponents(1, 5)).toBe('down')
  })

  it('returns "down" when dx === 0 and dy > 0', () => {
    expect(BaseNPC.directionFromComponents(0, 1)).toBe('down')
  })

  it('returns "up" when dx === 0 and dy < 0', () => {
    expect(BaseNPC.directionFromComponents(0, -1)).toBe('up')
  })

  it('prefers vertical when abs values are equal', () => {
    // When abs(dx) === abs(dy), the condition `abs(dx) > abs(dy)` is false,
    // so we fall through to the vertical branch
    expect(BaseNPC.directionFromComponents(5, 5)).toBe('down')
    expect(BaseNPC.directionFromComponents(-5, -5)).toBe('up')
  })

  it('returns "down" for zero vector', () => {
    // dy < 0 is false for 0, so returns "down"
    expect(BaseNPC.directionFromComponents(0, 0)).toBe('down')
  })
})

describe('BaseNPC.rowFrames', () => {
  it('calculates frames for row 0 in 8-column sheet', () => {
    expect(BaseNPC.rowFrames(0, 8)).toEqual({ start: 0, end: 7 })
  })

  it('calculates frames for row 2 in 8-column sheet', () => {
    expect(BaseNPC.rowFrames(2, 8)).toEqual({ start: 16, end: 23 })
  })

  it('uses custom frameCount when provided', () => {
    expect(BaseNPC.rowFrames(1, 8, 4)).toEqual({ start: 8, end: 11 })
  })

  it('handles row 0 with 4 columns', () => {
    expect(BaseNPC.rowFrames(0, 4)).toEqual({ start: 0, end: 3 })
  })

  it('handles single-frame row', () => {
    expect(BaseNPC.rowFrames(5, 8, 1)).toEqual({ start: 40, end: 40 })
  })
})
