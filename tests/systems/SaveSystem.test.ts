import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isValidSave, SaveSystem } from '../../src/systems/SaveSystem'
import { DEFAULT_RUN_SCORE_STATE } from '../../src/systems/ScoringSystem'
import { StoryKeys } from '../../src/registry/storyKeys'

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

  it('accepts v2 saves with lives and run score state', () => {
    expect(
      isValidSave(
        validSaveData({
          version: 2,
          lives: 2,
          runScore: DEFAULT_RUN_SCORE_STATE,
        }),
      ),
    ).toBe(true)
  })

  it.each([
    ['above max', 4],
    ['negative', -1],
    ['fractional', 2.5],
    ['non-numeric', '3'],
  ])('rejects v2 save with %s lives', (_caseName, lives) => {
    expect(
      isValidSave(
        validSaveData({
          version: 2,
          lives,
          runScore: DEFAULT_RUN_SCORE_STATE,
        }),
      ),
    ).toBe(false)
  })

  it('rejects v2 save with malformed run score state', () => {
    expect(
      isValidSave(
        validSaveData({
          version: 2,
          lives: 3,
          runScore: { ...DEFAULT_RUN_SCORE_STATE, visitedCells: 'bad' },
        }),
      ),
    ).toBe(false)
    expect(
      isValidSave(
        validSaveData({
          version: 2,
          lives: 3,
          runScore: { ...DEFAULT_RUN_SCORE_STATE, catEngagements: -1 },
        }),
      ),
    ).toBe(false)
    expect(
      isValidSave(
        validSaveData({
          version: 2,
          lives: 3,
          runScore: { ...DEFAULT_RUN_SCORE_STATE, foodSourcesDiscovered: [42] },
        }),
      ),
    ).toBe(false)
  })

  it('rejects future version', () => {
    expect(isValidSave(validSaveData({ version: 3 }))).toBe(false)
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

  it('rejects when playerPosition object is absent', () => {
    const data = validSaveData()
    delete (data as Record<string, unknown>).playerPosition
    expect(isValidSave(data)).toBe(false)
  })

  it('rejects when playerPosition omits x', () => {
    expect(isValidSave(validSaveData({ playerPosition: { y: 200 } }))).toBe(false)
  })

  it('rejects when playerPosition omits y', () => {
    expect(isValidSave(validSaveData({ playerPosition: { x: 100 } }))).toBe(false)
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

  it('rejects non-finite gameTimeMs', () => {
    expect(isValidSave(validSaveData({ gameTimeMs: NaN }))).toBe(false)
    expect(isValidSave(validSaveData({ gameTimeMs: Infinity }))).toBe(false)
  })

  it('rejects non-finite playerPosition coordinates', () => {
    expect(isValidSave(validSaveData({ playerPosition: { x: NaN, y: 0 } }))).toBe(false)
    expect(isValidSave(validSaveData({ playerPosition: { x: 0, y: Infinity } }))).toBe(false)
  })

  it('rejects non-finite stats values', () => {
    expect(isValidSave(validSaveData({ stats: { hunger: NaN, thirst: 50, energy: 50 } }))).toBe(false)
    expect(isValidSave(validSaveData({ stats: { hunger: 50, thirst: 50, energy: Infinity } }))).toBe(false)
  })

  it('rejects sourceStates entry with non-finite coordinates or lastUsedAt', () => {
    expect(
      isValidSave(
        validSaveData({
          sourceStates: [{ type: 'fountain', x: NaN, y: 1, lastUsedAt: 0 }],
        }),
      ),
    ).toBe(false)
    expect(
      isValidSave(
        validSaveData({
          sourceStates: [{ type: 'fountain', x: 1, y: 1, lastUsedAt: Infinity }],
        }),
      ),
    ).toBe(false)
  })
})

describe('SaveSystem.save / load / hasSave / clear', () => {
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key in store ? store[key]! : null),
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubRegistry(data: Record<string, unknown>) {
    return {
      get: (key: string) => data[key],
    } as unknown as Phaser.Data.DataManager
  }

  it('round-trips INTRO_SEEN in tracked variables', () => {
    const registry = stubRegistry({ INTRO_SEEN: true })
    expect(
      SaveSystem.save(
        1,
        2,
        { hunger: 50, thirst: 50, energy: 50 },
        'day',
        1,
        registry,
        undefined,
        { global: 0, cats: {} },
        { claimed: false, claimedOnDay: 0 },
      ),
    ).toBe(true)
    const loaded = SaveSystem.load()
    expect(loaded?.variables.INTRO_SEEN).toBe(true)
  })

  it('round-trips the pending snatched-this-night scoring flag', () => {
    const registry = stubRegistry({ [StoryKeys.SNATCHED_THIS_NIGHT]: true })
    expect(
      SaveSystem.save(
        1,
        2,
        { hunger: 50, thirst: 50, energy: 50 },
        'night',
        1,
        registry,
        undefined,
        { global: 0, cats: {} },
        { claimed: false, claimedOnDay: 0 },
      ),
    ).toBe(true)

    expect(SaveSystem.load()?.variables[StoryKeys.SNATCHED_THIS_NIGHT]).toBe(true)
  })

  // Regression: Fluffy's "Manu visited" awareness reads from the
  // MANU_VISITED_FLUFFY_DAY registry key. The whole feature collapses
  // silently if the key falls out of TRACKED_KEYS — Fluffy's prompt
  // would forget Manu's last visit on every save/load — so lock the
  // round-trip here.
  it('round-trips MANU_VISITED_FLUFFY_DAY in tracked variables', () => {
    const registry = stubRegistry({ [StoryKeys.MANU_VISITED_FLUFFY_DAY]: 6 })
    expect(
      SaveSystem.save(
        1,
        2,
        { hunger: 50, thirst: 50, energy: 50 },
        'evening',
        1,
        registry,
        undefined,
        { global: 0, cats: {} },
        { claimed: false, claimedOnDay: 0 },
      ),
    ).toBe(true)

    expect(SaveSystem.load()?.variables[StoryKeys.MANU_VISITED_FLUFFY_DAY]).toBe(6)
  })

  it('round-trips core fields and tracked variables', () => {
    const stats = { hunger: 70, thirst: 65, energy: 80 }
    const registry = stubRegistry({ CHAPTER: 3, MET_BLACKY: true })
    const trust = { global: 40, cats: { Blacky: 25 } }
    const territory = { claimed: true, claimedOnDay: 4 }

    expect(
      SaveSystem.save(100, 200, stats, 'evening', 500_000, registry, undefined, trust, territory),
    ).toBe(true)

    const loaded = SaveSystem.load()
    expect(loaded).not.toBeNull()
    expect(loaded!.playerPosition).toEqual({ x: 100, y: 200 })
    expect(loaded!.stats).toEqual(stats)
    expect(loaded!.timeOfDay).toBe('evening')
    expect(loaded!.gameTimeMs).toBe(500_000)
    expect(loaded!.variables.CHAPTER).toBe(3)
    expect(loaded!.variables.MET_BLACKY).toBe(true)
    expect(loaded!.trust).toEqual(trust)
    expect(loaded!.territory).toEqual(territory)
  })

  it('round-trips lives and run score state', () => {
    const runScore = {
      ...DEFAULT_RUN_SCORE_STATE,
      catEngagements: 2,
      visitedCells: [3, 9],
      foodSourcesDiscovered: ['fountain:10:20'],
    }

    expect(
      SaveSystem.save(
        100,
        200,
        { hunger: 70, thirst: 65, energy: 80 },
        'evening',
        500_000,
        stubRegistry({}),
        undefined,
        { global: 0, cats: {} },
        { claimed: false, claimedOnDay: 0 },
        2,
        runScore,
      ),
    ).toBe(true)

    const loaded = SaveSystem.load()
    expect(loaded?.version).toBe(2)
    expect(loaded?.lives).toBe(2)
    expect(loaded?.runScore).toEqual(runScore)
  })

  it('migrates v1 saves with default lives and empty run score', () => {
    store['ayala_save'] = JSON.stringify(validSaveData({ version: 1 }))

    const loaded = SaveSystem.load()

    expect(loaded?.version).toBe(2)
    expect(loaded?.lives).toBe(3)
    expect(loaded?.runScore).toEqual(DEFAULT_RUN_SCORE_STATE)
  })

  it('migrates v1 saves with a fresh run score object instead of the shared default', () => {
    store['ayala_save'] = JSON.stringify(validSaveData({ version: 1 }))

    const loaded = SaveSystem.load()
    expect(loaded).not.toBeNull()

    try {
      loaded!.runScore.visitedCells.push(12)
      loaded!.runScore.dumpedPetsComforted.push(1)
      loaded!.runScore.foodSourcesDiscovered.push('fountain:10:20')

      expect(DEFAULT_RUN_SCORE_STATE.visitedCells).toEqual([])
      expect(DEFAULT_RUN_SCORE_STATE.dumpedPetsComforted).toEqual([])
      expect(DEFAULT_RUN_SCORE_STATE.foodSourcesDiscovered).toEqual([])

      store['ayala_save'] = JSON.stringify(validSaveData({ version: 1 }))
      const migratedAgain = SaveSystem.load()
      expect(migratedAgain?.runScore).toEqual(DEFAULT_RUN_SCORE_STATE)
    } finally {
      DEFAULT_RUN_SCORE_STATE.visitedCells.length = 0
      DEFAULT_RUN_SCORE_STATE.dumpedPetsComforted.length = 0
      DEFAULT_RUN_SCORE_STATE.foodSourcesDiscovered.length = 0
    }
  })

  it('hasSave is false before save and true after', () => {
    expect(SaveSystem.hasSave()).toBe(false)
    SaveSystem.save(0, 0, { hunger: 1, thirst: 1, energy: 1 }, 'dawn', 0, stubRegistry({}))
    expect(SaveSystem.hasSave()).toBe(true)
  })

  it('clear removes persisted data', () => {
    SaveSystem.save(1, 2, { hunger: 50, thirst: 50, energy: 50 }, 'day', 1, stubRegistry({}))
    expect(SaveSystem.hasSave()).toBe(true)
    SaveSystem.clear()
    expect(SaveSystem.hasSave()).toBe(false)
    expect(SaveSystem.load()).toBeNull()
  })

  it('load returns null for invalid JSON', () => {
    store['ayala_save'] = '{ not json'
    expect(SaveSystem.load()).toBeNull()
  })

  it('load returns null when validation fails', () => {
    store['ayala_save'] = JSON.stringify({ version: 1, incomplete: true })
    expect(SaveSystem.load()).toBeNull()
  })

  it('save returns false when setItem throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: vi.fn(),
    })
    const ok = SaveSystem.save(0, 0, { hunger: 1, thirst: 1, energy: 1 }, 'dawn', 0, stubRegistry({}))
    expect(ok).toBe(false)
  })
})
