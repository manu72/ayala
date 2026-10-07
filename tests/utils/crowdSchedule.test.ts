import { describe, it, expect } from 'vitest'
import map from '../../public/assets/tilemaps/atg.json'
import { readPlaces, placesOfType, placeNamed, type TiledObjectLike } from '../../src/utils/mapPlaces'
import {
  clockHour,
  crowdSlot,
  fillTargets,
  mostOverTarget,
  nightShift,
  pickWeightedDeficit,
  planGuards,
  CROWD_SLOTS,
  type GuardPost,
} from '../../src/utils/crowdSchedule'
import { CROWD_ROLES, CROWD_TUNING } from '../../src/data/ambient-roles'

describe('clockHour', () => {
  it('interpolates inside a phase', () => {
    expect(clockHour(6, 10, 0)).toBe(6)
    expect(clockHour(6, 10, 0.5)).toBe(8)
    expect(clockHour(10, 17, 1)).toBe(17)
  })

  it('wraps through midnight for the night phase', () => {
    expect(clockHour(21, 6, 0.5)).toBeCloseTo(1.5)
    expect(clockHour(21, 6, 0)).toBe(21)
  })

  it('clamps progress', () => {
    expect(clockHour(6, 10, -1)).toBe(6)
    expect(clockHour(6, 10, 3)).toBe(10)
  })
})

describe('crowdSlot', () => {
  it('carves the lunch rush out of the day phase only', () => {
    expect(crowdSlot('day', 10.5)).toBe('day')
    expect(crowdSlot('day', 11.5)).toBe('lunch')
    expect(crowdSlot('day', 13.49)).toBe('lunch')
    expect(crowdSlot('day', 13.5)).toBe('day')
    expect(crowdSlot('dawn', 12)).toBe('dawn')
    expect(crowdSlot('evening', 18)).toBe('evening')
    expect(crowdSlot('night', 2)).toBe('night')
  })

  it('maps lunch to a stretch of the day phase (10:00-17:00)', () => {
    expect(crowdSlot('day', clockHour(10, 17, 0.2))).toBe('day')
    expect(crowdSlot('day', clockHour(10, 17, 0.3))).toBe('lunch')
    expect(crowdSlot('day', clockHour(10, 17, 0.49))).toBe('lunch')
    expect(crowdSlot('day', clockHour(10, 17, 0.55))).toBe('day')
  })
})

describe('crowd head-count targets', () => {
  const total = (slot: (typeof CROWD_SLOTS)[number]): number =>
    fillTargets(CROWD_ROLES, slot, 1, []).reduce((a, b) => a + b, 0)

  it('matches the design populations (dawn 12, day 45, lunch 60, evening 45, night 4)', () => {
    expect(total('dawn')).toBe(12)
    expect(total('day')).toBe(45)
    expect(total('lunch')).toBe(60)
    expect(total('evening')).toBe(45)
    expect(total('night')).toBe(4)
  })

  it('fits in the sprite pool at the busiest slot', () => {
    const busiest = Math.max(...CROWD_SLOTS.map(total))
    expect(Math.round(busiest * CROWD_TUNING.densityScale)).toBeLessThan(CROWD_TUNING.poolSize)
  })

  it('scales with the density knob and reuses the buffer', () => {
    const out: number[] = []
    const same = fillTargets(CROWD_ROLES, 'lunch', 0.5, out)
    expect(same).toBe(out)
    expect(out).toHaveLength(CROWD_ROLES.length)
    expect(out.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(27)
    expect(out.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(33)
  })
})

describe('pickWeightedDeficit / mostOverTarget', () => {
  it('returns -1 when every role is at or above target', () => {
    expect(pickWeightedDeficit([2, 3], [2, 1], 0.5)).toBe(-1)
  })

  it('picks roles in proportion to their deficit', () => {
    const counts = [0, 3, 0]
    const targets = [1, 3, 3] // deficits 1, 0, 3
    expect(pickWeightedDeficit(counts, targets, 0)).toBe(0)
    expect(pickWeightedDeficit(counts, targets, 0.24)).toBe(0)
    expect(pickWeightedDeficit(counts, targets, 0.26)).toBe(2)
    expect(pickWeightedDeficit(counts, targets, 0.999)).toBe(2)
  })

  it('finds the largest surplus', () => {
    expect(mostOverTarget([5, 9, 1], [5, 4, 3])).toBe(1)
    expect(mostOverTarget([1, 1], [1, 2])).toBe(-1)
  })
})

describe('planGuards', () => {
  const posts: GuardPost[] = [
    { name: 'near_spawn', x: 100, y: 0 },
    { name: 'a', x: 1000, y: 0 },
    { name: 'b', x: 2000, y: 0 },
    { name: 'pref', x: 3000, y: 0 },
    { name: 'c', x: 4000, y: 0 },
    { name: 'd', x: 5000, y: 0 },
    { name: 'next_to_old_guard', x: 6050, y: 0 },
  ]
  const base = {
    exclude: [{ x: 6000, y: 0, r: 400 }],
    hostileKeepout: [
      { x: 0, y: 0, r: 600 },
      { x: 6000, y: 0, r: 600 },
    ],
    hostilePreference: ['pref'],
    maxGuards: 10,
    friendlyEvery: 3,
  }

  it('posts exactly one hostile guard, at the preferred post clear of the keep-outs', () => {
    const plan = planGuards(posts, base)
    const hostile = plan.filter((g) => g.disposition === 'hostile')
    expect(hostile).toHaveLength(1)
    expect(hostile[0]!.post.name).toBe('pref')
  })

  it('never makes a guard near the player spawn hostile, even if preferred', () => {
    const plan = planGuards(posts, { ...base, hostilePreference: ['near_spawn'] })
    const hostile = plan.filter((g) => g.disposition === 'hostile')
    expect(hostile).toHaveLength(1)
    expect(hostile[0]!.post.name).toBe('a') // first clear post
  })

  it('skips excluded posts and caps the roster', () => {
    expect(planGuards(posts, base).map((g) => g.post.name)).not.toContain('next_to_old_guard')
    expect(planGuards(posts, { ...base, maxGuards: 3 })).toHaveLength(3)
  })

  it('makes most calm guards passive and every third one friendly', () => {
    const plan = planGuards(posts, base)
    const calm = plan.filter((g) => g.disposition !== 'hostile').map((g) => g.disposition)
    expect(calm).toEqual(['passive', 'friendly', 'passive', 'passive', 'friendly'])
  })

  it('has no hostile guard when every post is inside a keep-out', () => {
    const plan = planGuards(posts, { ...base, hostileKeepout: [{ x: 0, y: 0, r: 1e6 }] })
    expect(plan.some((g) => g.disposition === 'hostile')).toBe(false)
  })
})

describe('nightShift', () => {
  it('keeps N calm guards, alternating friendly and passive, and sends hostile guards home', () => {
    const roster = ['passive', 'hostile', 'friendly', 'passive', 'friendly', 'passive'] as const
    const night = nightShift(roster, 4)
    expect(night.filter(Boolean)).toHaveLength(4)
    expect(night[1]).toBe(false)
    expect(night).toEqual([true, false, true, true, true, false])
  })

  it('copes with fewer calm guards than requested', () => {
    expect(nightShift(['hostile', 'passive'], 4)).toEqual([false, true])
  })
})

describe('guard plan on the shipped map', () => {
  const layers = (map as unknown as { layers: Array<{ name: string; objects?: TiledObjectLike[] }> }).layers
  const places = readPlaces(layers.find((l) => l.name === 'places')?.objects ?? [])
  const spawns = readPlaces(layers.find((l) => l.name === 'spawns')?.objects ?? [])
  const spawn = placeNamed(spawns, 'spawn_mammacat')
  const oldGuard = placeNamed(spawns, 'spawn_guard')
  const posts = placesOfType(places, 'guard_post').map((p) => ({ name: p.name, x: p.x, y: p.y }))

  it('puts the single extra hostile guard at least 600 px from Mamma Cat and the restaurant guard', () => {
    expect(spawn && oldGuard && posts.length > 0).toBeTruthy()
    const T = CROWD_TUNING
    const plan = planGuards(posts, {
      exclude: [{ x: oldGuard!.x, y: oldGuard!.y, r: T.guardSpacing }],
      hostileKeepout: [
        { x: spawn!.x, y: spawn!.y, r: T.hostileMinDist },
        { x: oldGuard!.x, y: oldGuard!.y, r: T.hostileMinDist },
      ],
      hostilePreference: T.hostilePreference,
      maxGuards: T.maxGuards,
      friendlyEvery: T.guardFriendlyEvery,
    })
    const hostile = plan.filter((g) => g.disposition === 'hostile')
    expect(hostile).toHaveLength(1)
    const h = hostile[0]!.post
    expect(Math.hypot(h.x - spawn!.x, h.y - spawn!.y)).toBeGreaterThanOrEqual(600)
    expect(Math.hypot(h.x - oldGuard!.x, h.y - oldGuard!.y)).toBeGreaterThanOrEqual(600)
    expect(plan.length + 1).toBeLessThanOrEqual(12) // + GameScene's restaurant guard
    expect(plan.filter((g) => g.disposition === 'friendly').length).toBeGreaterThanOrEqual(2)
  })
})
