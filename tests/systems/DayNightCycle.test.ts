import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('phaser', () => {
  class MockEventEmitter {
    private readonly handlers: Record<string, Array<(...args: unknown[]) => void>> = {}
    on(event: string, fn: (...args: unknown[]) => void): this {
      (this.handlers[event] ??= []).push(fn)
      return this
    }
    emit(event: string, ...args: unknown[]): boolean {
      for (const fn of this.handlers[event] ?? []) fn(...args)
      return true
    }
  }
  return {
    default: {
      Events: {
        EventEmitter: MockEventEmitter,
      },
      GameObjects: {},
    },
  }
})

import {
  DayNightCycle,
  DAY_NIGHT_FULL_CYCLE_MS,
  DAY_NIGHT_PHASES,
} from '../../src/systems/DayNightCycle'

const DAWN_MS = DAY_NIGHT_PHASES.dawn.durationMs
const DAY_MS = DAY_NIGHT_PHASES.day.durationMs
const EVENING_MS = DAY_NIGHT_PHASES.evening.durationMs
const NIGHT_MS = DAY_NIGHT_PHASES.night.durationMs

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
      expect(cycle.phaseProgress).toBe(0)
    })

    it('sets phaseTimer near end of night within cycle', () => {
      const gameTimeMs = DAY_NIGHT_FULL_CYCLE_MS - 5000
      const cycle = new DayNightCycle(scene as never)
      cycle.restore('night', gameTimeMs)
      expect(cycle.currentPhase).toBe('night')
      expect(cycle.phaseProgress).toBeCloseTo((NIGHT_MS - 5000) / NIGHT_MS, 5)
    })

    it('restore clears in-progress visual transition; phase advances on next update', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.update(DAWN_MS + 1000)
      expect(cycle.currentPhase).toBe('day')
      expect(cycle.isTransitioning).toBe(true)

      cycle.restore('evening', 200_000)
      expect(cycle.isTransitioning).toBe(false)
      expect(cycle.currentPhase).toBe('evening')

      cycle.update(EVENING_MS)
      expect(cycle.currentPhase).toBe('night')
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
      cycle.restore('dawn', DAY_NIGHT_FULL_CYCLE_MS)
      expect(cycle.dayCount).toBe(2)
    })

    it('reflects gameTimeMs after update', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.restore('dawn', 0)
      cycle.update(DAY_NIGHT_FULL_CYCLE_MS)
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

  describe('snapVisualToPhase', () => {
    it('sets phase and overlay immediately without transition flag', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.snapVisualToPhase('night')
      expect(cycle.currentPhase).toBe('night')
      expect(cycle.isTransitioning).toBe(false)
    })
  })

  describe('transitionVisualToPhase', () => {
    it('sets logical phase immediately and marks transition active', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.snapVisualToPhase('night')
      cycle.transitionVisualToPhase('dawn', 5000)
      expect(cycle.currentPhase).toBe('dawn')
      expect(cycle.isTransitioning).toBe(true)
    })

    it('lerps overlay from current colour/alpha to the target phase over the given duration', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.snapVisualToPhase('night')
      const nightCfg = DAY_NIGHT_PHASES.night
      expect(overlay.fillColor).toBe(nightCfg.color)
      expect(overlay.fillAlpha).toBeCloseTo(nightCfg.alpha, 5)

      cycle.transitionVisualToPhase('dawn', 5000)

      // Halfway through the transition the overlay should not yet match the target.
      cycle.update(2500)
      expect(cycle.isTransitioning).toBe(true)
      const targetAlpha = DAY_NIGHT_PHASES.dawn.alpha
      expect(overlay.fillAlpha).not.toBeCloseTo(targetAlpha, 5)

      // After the full duration the overlay should land on the target phase
      // and the transition flag should clear.
      cycle.update(2500)
      expect(cycle.isTransitioning).toBe(false)
      expect(overlay.fillColor).toBe(DAY_NIGHT_PHASES.dawn.color)
      expect(overlay.fillAlpha).toBeCloseTo(DAY_NIGHT_PHASES.dawn.alpha, 5)
    })

    it('does not interfere with the default transition duration for natural phase cycling', () => {
      const cycle = new DayNightCycle(scene as never)
      cycle.restore('dawn', 0)
      cycle.transitionVisualToPhase('night', 100)
      cycle.update(100)
      expect(cycle.isTransitioning).toBe(false)

      // Subsequent natural phase cycle should still use the default
      // TRANSITION_MS (8000), not the 100ms override from the previous call.
      cycle.restore('dawn', DAWN_MS - 1)
      cycle.update(2)
      expect(cycle.currentPhase).toBe('day')
      expect(cycle.isTransitioning).toBe(true)
      cycle.update(100)
      expect(cycle.isTransitioning).toBe(true)
    })
  })
})
