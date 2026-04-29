import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * FoodSourceManager depends on Phaser at runtime for:
 *   - Phaser.Math.Distance.Between (range checks)
 *   - Phaser.Math.Between            (bug-spawn scatter; not exercised here)
 * All scene.add.text / scene.tweens.add calls are exercised through a hand-rolled
 * scene mock, keeping tests in the project's node test environment.
 */
vi.mock('phaser', () => ({
  default: {
    Math: {
      Distance: {
        Between: (ax: number, ay: number, bx: number, by: number) =>
          Math.hypot(bx - ax, by - ay),
      },
      Between: (min: number, max: number) => Math.floor((min + max) / 2),
    },
  },
}))

import {
  FoodSourceManager,
  INTERACT_RANGE,
  SOURCE_DEFS,
  type SourceType,
} from '../../src/systems/FoodSource'
import { StatsSystem } from '../../src/systems/StatsSystem'

interface TextMock {
  active: boolean
  setOrigin: ReturnType<typeof vi.fn>
  setDepth: ReturnType<typeof vi.fn>
  setText: ReturnType<typeof vi.fn>
  setAlpha: ReturnType<typeof vi.fn>
  setPosition: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  /** Captured constructor args for targeted assertions. */
  args: { x: number; y: number; text: string }
  /** Latest alpha value passed to setAlpha — used by update() assertions. */
  lastAlpha: number
  /** Latest text value passed to setText — used by update() assertions. */
  lastText: string
}

interface TweenConfig {
  targets: unknown
  onComplete?: () => void
}

function makeText(x: number, y: number, text: string): TextMock {
  const t: TextMock = {
    active: true,
    args: { x, y, text },
    lastAlpha: 1,
    lastText: '',
    setOrigin: vi.fn(() => t),
    setDepth: vi.fn(() => t),
    setText: vi.fn((value: string) => {
      t.lastText = value
    }),
    setAlpha: vi.fn((value: number) => {
      t.lastAlpha = value
    }),
    setPosition: vi.fn(),
    destroy: vi.fn(() => {
      t.active = false
    }),
  }
  return t
}

function makeSceneHarness() {
  const texts: TextMock[] = []
  const tweens: TweenConfig[] = []
  const scene = {
    add: {
      text: vi.fn((x: number, y: number, text: string) => {
        const t = makeText(x, y, text)
        texts.push(t)
        return t
      }),
    },
    tweens: {
      add: vi.fn((cfg: TweenConfig) => {
        tweens.push(cfg)
        return {}
      }),
    },
  } as unknown as Phaser.Scene
  return { scene, texts, tweens }
}

/** Build a manager populated with the given sources, returning the harness + stats. */
function buildManager(sources: Array<[SourceType, number, number]>) {
  const harness = makeSceneHarness()
  const manager = new FoodSourceManager(harness.scene)
  for (const [type, x, y] of sources) {
    manager.addSource(type, x, y)
  }
  const stats = new StatsSystem()
  return { manager, stats, ...harness }
}

describe('FoodSourceManager.tryInteract — cooldown enforcement', () => {
  it('returns source identity on first use at now=0 (sources start immediately available)', () => {
    const { manager, stats } = buildManager([['fountain', 100, 100]])
    stats.thirst = 50
    expect(manager.tryInteract(100, 100, stats, 'day', 0)).toEqual({
      type: 'fountain',
      stat: 'thirst',
      x: 100,
      y: 100,
      actualRestored: 50,
    })
    expect(stats.thirst).toBe(100)
  })

  it('blocks re-use inside the cooldown window', () => {
    const { manager, stats } = buildManager([['fountain', 100, 100]])
    stats.thirst = 50
    manager.tryInteract(100, 100, stats, 'day', 0)
    stats.thirst = 50
    const cooldownMs = SOURCE_DEFS.fountain.cooldownMs
    expect(manager.tryInteract(100, 100, stats, 'day', cooldownMs - 1)).toBeNull()
    expect(stats.thirst).toBe(50)
  })

  it('allows re-use once the cooldown elapses', () => {
    const { manager, stats } = buildManager([['fountain', 100, 100]])
    stats.thirst = 50
    manager.tryInteract(100, 100, stats, 'day', 0)
    stats.thirst = 50
    expect(manager.tryInteract(100, 100, stats, 'day', SOURCE_DEFS.fountain.cooldownMs)).not.toBeNull()
    expect(stats.thirst).toBe(100)
  })
})

describe('FoodSourceManager.tryInteract — range gating', () => {
  it('returns false when no sources have been registered', () => {
    const { manager, stats } = buildManager([])
    expect(manager.tryInteract(0, 0, stats, 'day', 0)).toBeNull()
  })

  it('returns false when the only source sits outside INTERACT_RANGE', () => {
    const { manager, stats } = buildManager([['fountain', 200, 200]])
    // Per-axis offset of INTERACT_RANGE → Euclidean dist = INTERACT_RANGE × √2
    // (~1.41 × range), safely outside for any value of the constant.
    const axisOffset = INTERACT_RANGE
    expect(
      manager.tryInteract(200 - axisOffset, 200 - axisOffset, stats, 'day', 0),
    ).toBeNull()
  })

  it('returns true on the near side of INTERACT_RANGE', () => {
    const { manager, stats } = buildManager([['fountain', 100, 100]])
    // Per-axis offset of INTERACT_RANGE/2 → Euclidean dist ≈ 0.71 × INTERACT_RANGE,
    // safely inside for any value of the constant.
    const axisOffset = Math.floor(INTERACT_RANGE / 2)
    expect(
      manager.tryInteract(100 - axisOffset, 100 - axisOffset, stats, 'day', 0),
    ).not.toBeNull()
  })

  it('picks the nearest in-range source when multiple are in range', () => {
    const { manager, stats } = buildManager([
      ['fountain', 100, 100],     // dist 0 from (100,100)
      ['water_bowl', 110, 100],   // dist 10 from (100,100)
    ])
    stats.thirst = 0
    expect(manager.tryInteract(100, 100, stats, 'day', 0)?.type).toBe('fountain')
    // fountain restores 50; water_bowl restores 30 — restored value proves which was picked.
    expect(stats.thirst).toBe(50)
  })
})

describe('FoodSourceManager.tryInteract — activePhases gating', () => {
  // Tuple order matches the title placeholders: "<type> is <expected> during phase=<phase>".
  it.each<[SourceType, boolean, Parameters<FoodSourceManager['tryInteract']>[3]]>([
    ['feeding_station', true, 'dawn'],
    ['feeding_station', false, 'day'],
    ['feeding_station', true, 'evening'],
    ['feeding_station', false, 'night'],
    ['restaurant_scraps', true, 'evening'],
    ['restaurant_scraps', false, 'day'],
    ['restaurant_scraps', false, 'dawn'],
    ['restaurant_scraps', false, 'night'],
  ])('%s is %s during phase=%s', (type, expected, phase) => {
    const { manager, stats } = buildManager([[type, 100, 100]])
    expect(Boolean(manager.tryInteract(100, 100, stats, phase, 0))).toBe(expected)
  })

  it('fountain and water_bowl are available across all phases', () => {
    for (const type of ['fountain', 'water_bowl'] as const) {
      for (const phase of ['dawn', 'day', 'evening', 'night'] as const) {
        const { manager, stats } = buildManager([[type, 100, 100]])
        expect(manager.tryInteract(100, 100, stats, phase, 0)).not.toBeNull()
      }
    }
  })
})

describe('FoodSourceManager.tryInteract — safe_sleep is skipped', () => {
  it.each(['dawn', 'day', 'evening', 'night'] as const)(
    'safe_sleep is never used through tryInteract at phase=%s, even at zero distance',
    (phase) => {
      const { manager, stats } = buildManager([['safe_sleep', 100, 100]])
      const before = stats.energy
      expect(manager.tryInteract(100, 100, stats, phase, 0)).toBeNull()
      expect(stats.energy).toBe(before)
    },
  )

  it('falls through safe_sleep to use a different in-range source', () => {
    const { manager, stats } = buildManager([
      ['safe_sleep', 100, 100],
      ['fountain', 110, 100],
    ])
    stats.thirst = 60
    expect(manager.tryInteract(100, 100, stats, 'day', 0)?.type).toBe('fountain')
    expect(stats.thirst).toBe(100) // fountain: +50, clamped at 100
  })
})

describe('FoodSourceManager.tryInteract — stat routing', () => {
  it('feeding_station restores hunger', () => {
    const { manager, stats } = buildManager([['feeding_station', 100, 100]])
    stats.hunger = 30
    expect(manager.tryInteract(100, 100, stats, 'dawn', 0)?.type).toBe('feeding_station')
    expect(stats.hunger).toBe(70) // +40
  })

  it('bugs restore hunger by a small amount', () => {
    const { manager, stats } = buildManager([['bugs', 100, 100]])
    stats.hunger = 50
    expect(manager.tryInteract(100, 100, stats, 'day', 0)?.type).toBe('bugs')
    expect(stats.hunger).toBe(55) // +5
  })
})

describe('FoodSourceManager.update — marker visibility', () => {
  it('marks phase-inactive sources dimmed with "inactive" label', () => {
    const { manager, texts } = buildManager([['feeding_station', 100, 100]])
    const marker = texts[0]!
    const label = texts[1]!
    manager.update('night', 0)
    expect(marker.lastAlpha).toBe(0.3)
    expect(label.lastText).toBe('inactive')
  })

  it('shows countdown label and dims marker while cooling down', () => {
    const { manager, stats, texts } = buildManager([['fountain', 100, 100]])
    manager.tryInteract(100, 100, stats, 'day', 0)
    const marker = texts[0]!
    const label = texts[1]!
    const cooldownMs = SOURCE_DEFS.fountain.cooldownMs
    const elapsedMs = Math.floor(cooldownMs / 3)
    manager.update('day', elapsedMs)
    expect(marker.lastAlpha).toBe(0.5)
    const remainingSec = Math.ceil((cooldownMs - elapsedMs) / 1000)
    expect(label.lastText).toBe(`${remainingSec}s`)
  })

  it('marks available sources full-alpha with an empty label', () => {
    const { manager, texts } = buildManager([['fountain', 100, 100]])
    const marker = texts[0]!
    const label = texts[1]!
    manager.update('day', 0)
    expect(marker.lastAlpha).toBe(1)
    expect(label.lastText).toBe('')
  })
})

describe('FoodSourceManager — getSourceStates / restoreFromStates round-trip', () => {
  it('preserves type and position across a save/restore cycle', () => {
    const { manager } = buildManager([
      ['feeding_station', 100, 200],
      ['fountain', 300, 400],
      ['water_bowl', 500, 600],
    ])

    const saved = manager.getSourceStates()
    expect(saved).toHaveLength(3)

    manager.restoreFromStates(saved)

    const reloaded = manager.getSourceStates()
    // Ignore lastUsedAt (intentionally reset on restore; verified below).
    expect(reloaded.map(({ type, x, y }) => ({ type, x, y }))).toEqual(
      saved.map(({ type, x, y }) => ({ type, x, y })),
    )
  })

  it('destroys previous marker + status-label game objects on restore', () => {
    const { manager, texts } = buildManager([
      ['fountain', 100, 100],
      ['water_bowl', 200, 200],
    ])

    // Snapshot the original 4 text objects (2 per source: marker + statusLabel).
    const originals = texts.slice(0, 4)
    expect(originals.every((t) => t.active)).toBe(true)

    manager.restoreFromStates(manager.getSourceStates())

    for (const t of originals) {
      expect(t.destroy).toHaveBeenCalledTimes(1)
      expect(t.active).toBe(false)
    }
  })

  it('resets cooldowns to available after restore (documented contract)', () => {
    // Use the fountain immediately so its saved lastUsedAt reflects recent use.
    const { manager, stats } = buildManager([['fountain', 100, 100]])
    stats.thirst = 50
    manager.tryInteract(100, 100, stats, 'day', 0)

    const saved = manager.getSourceStates()
    expect(saved[0]!.lastUsedAt).toBe(0)

    manager.restoreFromStates(saved)

    // Post-restore: tryInteract at now=0 should succeed even though the saved
    // lastUsedAt was "now" — restoration intentionally resets cooldowns.
    stats.thirst = 50
    expect(manager.tryInteract(100, 100, stats, 'day', 0)).not.toBeNull()
    expect(stats.thirst).toBe(100)
  })

  it('getSourceStates is empty after restoring from an empty array', () => {
    const { manager } = buildManager([['fountain', 100, 100]])
    manager.restoreFromStates([])
    expect(manager.getSourceStates()).toEqual([])
  })

  it('round-trip survives through an intermediate JSON stringify (save-file shape)', () => {
    const { manager } = buildManager([
      ['feeding_station', 10, 20],
      ['bugs', 30, 40],
      ['safe_sleep', 50, 60],
    ])

    const saved = manager.getSourceStates()
    const rehydrated = JSON.parse(JSON.stringify(saved)) as typeof saved

    manager.restoreFromStates(rehydrated)

    expect(manager.getSourceStates().map(({ type, x, y }) => ({ type, x, y }))).toEqual([
      { type: 'feeding_station', x: 10, y: 20 },
      { type: 'bugs', x: 30, y: 40 },
      { type: 'safe_sleep', x: 50, y: 60 },
    ])
  })
})

describe('FoodSourceManager — addSource initial availability', () => {
  it('sets lastUsedAt to -cooldownMs so the first tryInteract at now=0 succeeds', () => {
    const { manager } = buildManager([['fountain', 0, 0]])
    const [state] = manager.getSourceStates()
    expect(state!.lastUsedAt).toBe(-SOURCE_DEFS.fountain.cooldownMs)
  })
})

/**
 * Housekeeping: ensure the mocked scene isn't leaking between tests.
 */
describe('FoodSourceManager — harness sanity', () => {
  let manager: FoodSourceManager
  let stats: StatsSystem
  let tweens: TweenConfig[]

  beforeEach(() => {
    ;({ manager, stats, tweens } = buildManager([['fountain', 0, 0]]))
  })

  it('starts with a fresh empty tween list and schedules a floating-text tween on interaction', () => {
    stats.thirst = 0
    expect(tweens).toHaveLength(0)
    manager.tryInteract(0, 0, stats, 'day', 0)
    expect(stats.thirst).toBe(50)
    // Each successful interaction schedules exactly one floating-text tween.
    expect(tweens).toHaveLength(1)
  })
})
