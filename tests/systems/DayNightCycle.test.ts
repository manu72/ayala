import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

/** Matches PHASES in DayNightCycle.ts */
const DAWN_MS = 90_000
const DAY_MS = 120_000
const EVENING_MS = 90_000
const NIGHT_MS = 90_000
const FULL_CYCLE_MS = DAWN_MS + DAY_MS + EVENING_MS + NIGHT_MS

function createOverlayMock() {
  let fillColor = 0
  let fillAlpha = 0
  return {
    get fillColor() {
      return fillColor
    },
    get fillAlpha() {
      return fillAlpha
    },
    setFillStyle(color: number, alpha: number) {
      fillColor = color
      fillAlpha = alpha
    },
    setScrollFactor: vi.fn(),
    setDepth: vi.fn(),
  }
}

function createSceneMock(overlay: ReturnType<typeof createOverlayMock>) {
  return {
    cameras: { main: { width: 800, height: 600 } },
    add: {
      rectangle: vi.fn(() => overlay),
    },
  }
}

vi.mock('phaser', () => {
  return {
    default: {
      Events: {
        EventEmitter,
      },
      GameObjects: {},
    },
  }
})

const { DayNightCycle } = await import('../../src/systems/DayNightCycle')

describe('DayNightCycle', () => {
  let overlay: ReturnType<typeof createOverlayMock>
  let scene: ReturnType<typeof createSceneMock>

  beforeEach(() => {
    overlay = createOverlayMock()
    scene = createSceneMock(overlay)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('restore', () => {
    it('sets phaseTimer from gameTimeMs within day phase', () => {
      const gameTimeMs = DAWN_MS + 10_000
      const cycle = new DayNightCycle(scene as never)
      cycle.restore('day', gameTimeMs)
      expect(cycle.currentPhase).toBe('day')
      expect(cycle.phaseProgress).toBeCloseTo(10_000 / DAY_MS, 5)
      expect(cycle.totalGameTimeMs).toBe(gameTimeMs)
    })

    it('sets phaseTimer at start of dawn (offset 0)', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.restore('dawn', 0)
      expect(cycle.currentPhase).toBe('dawn')
      expect(cycle.phaseTimer).toBe(0)
    })

    it('sets phaseTimer near end of night within cycle', () => {
      const gameTimeMs = FULL_CYCLE_MS - 5000
      const cycle = new DayNightCycle(scene as never)
      cycle.restore('night', gameTimeMs)
      expect(cycle.currentPhase).toBe('night')
      expect(cycle.phaseProgress).toBeCloseTo((NIGHT_MS - 5000) / NIGHT_MS, 5)
    })

    it('clears transitioning flag', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.update(DAY_MS + 1000)
      cycle.restore('evening', 200_000)
      expect(cycle.currentPhase).toBe('evening')
    })
  })

  describe('dayCount', () => {
    it('is 1 at game start', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.restore('dawn', 0)
      expect(cycle.dayCount).toBe(1)
    })

    it('increments after one full cycle', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.restore('dawn', FULL_CYCLE_MS)
      expect(cycle.dayCount).toBe(2)
    })

    it('reflects gameTimeMs after update', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.restore('dawn', 0)
      cycle.update(FULL_CYCLE_MS)
      expect(cycle.dayCount).toBe(2)
    })
  })

  describe('isHeatActive', () => {
    it('is true only during day phase', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.restore('day', DAWN_MS)
      expect(cycle.isHeatActive).toBe(true)
      cycle.restore('night', 0)
      expect(cycle.isHeatActive).toBe(false)
    })
  })

  describe('clockText', () => {
    it('includes phase label and day count', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.restore('evening', 0)
      expect(cycle.clockText).toBe('Evening  Day 1')
    })
  })

  describe('update — phase advancement', () => {
    it('advances dawn to day when phase duration elapses', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.restore('dawn', 0)
      cycle.update(DAWN_MS)
      expect(cycle.currentPhase).toBe('day')
    })

    it('carries remainder into next phase', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.restore('dawn', 0)
      const extra = 5000
      cycle.update(DAWN_MS + extra)
      expect(cycle.currentPhase).toBe('day')
      expect(cycle.phaseProgress).toBeCloseTo(extra / DAY_MS, 5)
    })
  })

  describe('newDay event', () => {
    it('emits when transitioning night to dawn', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.restore('night', DAWN_MS + DAY_MS + EVENING_MS)
      const spy = vi.fn()
      cycle.on('newDay', spy)
      cycle.update(NIGHT_MS)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(cycle.dayCount)
      expect(cycle.currentPhase).toBe('dawn')
    })

    it('does not emit when advancing within the same calendar day cycle before night→dawn', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.restore('dawn', 0)
      const spy = vi.fn()
      cycle.on('newDay', spy)
      cycle.update(DAWN_MS)
      expect(spy).not.toHaveBeenCalled()
    })
  })
})
