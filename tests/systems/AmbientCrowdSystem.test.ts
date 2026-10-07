import { describe, it, expect, vi } from 'vitest'

/**
 * Drives AmbientCrowdSystem against the shipped map with a hand-rolled scene
 * (no Phaser boot). Checks the safety contract — crowd people never touch the
 * player, registry, emotes-on-player or depth >= 4 — plus head-counts, night
 * emptying, the guard roster and cleanup.
 */
vi.mock('phaser', () => {
  class Vector2 {
    constructor(
      public x = 0,
      public y = 0,
    ) {}
    set(x: number, y: number): this {
      this.x = x
      this.y = y
      return this
    }
    normalize(): this {
      const m = Math.hypot(this.x, this.y)
      if (m > 0) {
        this.x /= m
        this.y /= m
      }
      return this
    }
    lerp(v: { x: number; y: number }, t: number): this {
      this.x += (v.x - this.x) * t
      this.y += (v.y - this.y) * t
      return this
    }
  }
  class ArcadeSprite {
    x: number
    y: number
    active = true
    visible = true
    destroyed = false
    vx = 0
    vy = 0
    body = {
      enable: true,
      setSize: () => {},
      setOffset: () => {},
      reset: (x: number, y: number) => {
        this.x = x
        this.y = y
      },
    }
    anims = { play: () => {}, stop: () => {} }
    constructor(
      public scene: unknown,
      x: number,
      y: number,
    ) {
      this.x = x
      this.y = y
    }
    setDepth(): this {
      return this
    }
    setScale(): this {
      return this
    }
    setOrigin(): this {
      return this
    }
    setCollideWorldBounds(): this {
      return this
    }
    setVelocity(x = 0, y = x): this {
      this.vx = x
      this.vy = y
      return this
    }
    setFrame(): this {
      return this
    }
    setActive(a: boolean): this {
      this.active = a
      return this
    }
    setVisible(v: boolean): this {
      this.visible = v
      return this
    }
    destroy(): void {
      this.destroyed = true
    }
  }
  class EventEmitter {
    on(): this {
      return this
    }
    emit(): boolean {
      return true
    }
  }
  return {
    default: {
      Physics: { Arcade: { Sprite: ArcadeSprite } },
      Events: { EventEmitter },
      Math: {
        Vector2,
        Distance: { Between: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1) },
        Between: (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1)),
      },
    },
  }
})

import map from '../../public/assets/tilemaps/atg.json'
import { readPlaces, placeNamed, placesOfType, type TiledObjectLike } from '../../src/utils/mapPlaces'
import { AmbientCrowdSystem } from '../../src/systems/AmbientCrowdSystem'
import { CROWD_ROLES, CROWD_TUNING } from '../../src/data/ambient-roles'
import type { TimeOfDay } from '../../src/systems/DayNightCycle'

// ── map collision ──
const m = map as unknown as {
  width: number
  height: number
  tilewidth: number
  tilesets: Array<{ firstgid: number; tiles?: Array<{ id: number; properties?: Array<{ name: string; value: unknown }> }> }>
  layers: Array<{ name: string; data?: number[]; objects?: TiledObjectLike[] }>
}
const colliding = new Set<number>()
const roadGids = new Set<number>()
for (const ts of m.tilesets) {
  for (const t of ts.tiles ?? []) {
    if ((t.properties ?? []).some((p) => p.name === 'collides' && p.value === true)) colliding.add(ts.firstgid + t.id)
    if ((t.properties ?? []).some((p) => p.name === 'road' && p.value === true)) roadGids.add(ts.firstgid + t.id)
  }
}
/** Extra ground cells (y * width + x) a test wants read as road. */
const testRoadCells = new Set<number>()
const fakeLayer = (name: string) => {
  const data = m.layers.find((l) => l.name === name)?.data ?? []
  return {
    tilemap: { heightInPixels: m.height * m.tilewidth },
    getTileAtWorldXY: (x: number, y: number) => {
      const tx = Math.floor(x / m.tilewidth)
      const ty = Math.floor(y / m.tilewidth)
      if (tx < 0 || ty < 0 || tx >= m.width || ty >= m.height) return null
      const k = ty * m.width + tx
      const road = name === 'ground' && (roadGids.has(data[k] ?? 0) || testRoadCells.has(k))
      return { collides: road || colliding.has(data[k] ?? 0), properties: road ? { road: true } : {} }
    },
  }
}
const groundData = m.layers.find((l) => l.name === 'ground')?.data ?? []
const objectsData = m.layers.find((l) => l.name === 'objects')?.data ?? []
const blockedAt = (x: number, y: number): boolean => {
  const k = Math.floor(y / m.tilewidth) * m.width + Math.floor(x / m.tilewidth)
  return colliding.has(groundData[k] ?? 0) || colliding.has(objectsData[k] ?? 0)
}
/** Well inside colliding tiles (a few px of corner-clipping on diagonal footways is tolerated). */
const deepInWall = (x: number, y: number): boolean =>
  blockedAt(x, y) && blockedAt(x - 4, y - 4) && blockedAt(x + 4, y - 4) && blockedAt(x - 4, y + 4) && blockedAt(x + 4, y + 4)
const places = readPlaces(m.layers.find((l) => l.name === 'places')?.objects ?? [])
const spawns = readPlaces(m.layers.find((l) => l.name === 'spawns')?.objects ?? [])

// ── fake scene ──
interface FakeSprite {
  x: number
  y: number
  visible: boolean
  active: boolean
  depth: number
  alpha: number
  destroyed: boolean
  [k: string]: unknown
}

function chain<T extends object>(target: T, names: string[]): T {
  for (const n of names) (target as Record<string, unknown>)[n] ??= () => target
  return target
}

function makeScene(view: { x: number; y: number; w: number; h: number }) {
  const sprites: FakeSprite[] = []
  const texts: Array<{ destroyed: boolean }> = []
  const colliders: Array<{ destroy: ReturnType<typeof vi.fn> }> = []
  const animKeys = new Set<string>()
  const worldView = {
    get x() {
      return view.x
    },
    get y() {
      return view.y
    },
    get right() {
      return view.x + view.w
    },
    get bottom() {
      return view.y + view.h
    },
    get centerX() {
      return view.x + view.w / 2
    },
    get centerY() {
      return view.y + view.h / 2
    },
  }
  const scene = {
    registry: { set: vi.fn(), get: vi.fn() },
    tweens: { add: vi.fn() },
    cameras: { main: { worldView } },
    anims: {
      exists: (k: string) => animKeys.has(k),
      create: (cfg: { key: string }) => animKeys.add(cfg.key),
      generateFrameNumbers: () => [],
    },
    physics: {
      add: {
        existing: () => {},
        collider: () => {
          const c = { destroy: vi.fn() }
          colliders.push(c)
          return c
        },
      },
    },
    add: {
      existing: () => {},
      sprite: (x: number, y: number) => {
        const s: FakeSprite = { x, y, visible: true, active: true, depth: 0, alpha: 1, destroyed: false, flipX: false }
        chain(s, ['setScale', 'setOrigin', 'setTint', 'setTexture', 'setCrop'])
        s.setVisible = (v: boolean) => ((s.visible = v), s)
        s.setActive = (a: boolean) => ((s.active = a), s)
        s.setDepth = (d: number) => ((s.depth = d), s)
        s.setAlpha = (a: number) => ((s.alpha = a), s)
        s.setFlipX = (f: boolean) => ((s.flipX = f), s)
        s.setPosition = (px: number, py: number) => ((s.x = px), (s.y = py), s)
        s.destroy = () => {
          s.destroyed = true
        }
        s.anims = { play: () => {}, stop: () => {} }
        sprites.push(s)
        return s
      },
      graphics: () => chain({}, ['setDepth', 'clear', 'fillStyle', 'fillRect', 'fillCircle', 'fillEllipse', 'destroy']),
      circle: () => chain({}, ['setDepth', 'destroy']),
      text: () => {
        const t = chain({ destroyed: false } as { destroyed: boolean }, ['setOrigin', 'setDepth', 'setPosition', 'setText', 'setColor'])
        ;(t as unknown as { destroy: () => void }).destroy = () => {
          t.destroyed = true
        }
        texts.push(t)
        return t
      },
    },
  }
  return { scene, sprites, texts, colliders }
}

const T = CROWD_TUNING
const restaurantRow = placeNamed(spawns, 'poi_dining')!
const spawnCat = placeNamed(spawns, 'spawn_mammacat')!

interface CrowdPerson {
  sprite: FakeSprite
  role: number
  x: number
  y: number
  visible: boolean
  shed: boolean
  intent: string
}
const activeOf = (crowd: AmbientCrowdSystem) => (crowd as unknown as { active: CrowdPerson[] }).active

function setup(at: { x: number; y: number }) {
  const view = { x: at.x - 163, y: at.y - 125, w: 326, h: 250 }
  const { scene, sprites, texts, colliders } = makeScene(view)
  const player = { x: at.x, y: at.y, isCrouching: false, body: { setVelocity: vi.fn() } }
  const emotes = { show: vi.fn() }
  const crowd = new AmbientCrowdSystem(scene as never, {
    places,
    spawns,
    player: player as never,
    groundLayer: fakeLayer('ground') as never,
    objectsLayer: fakeLayer('objects') as never,
    emotes: emotes as never,
  })
  const crowdSprites = sprites.slice(0, T.poolSize)
  const run = (seconds: number, phase: TimeOfDay, progress: number, each?: () => void) => {
    for (let i = 0; i < seconds * 60; i++) {
      crowd.update(1000 / 60, phase, progress)
      each?.()
    }
  }
  return { crowd, view, player, emotes, scene, crowdSprites, texts, colliders, run }
}

describe('AmbientCrowdSystem', () => {
  it('fills toward the lunch head-count around the camera without ever touching the player', () => {
    const { crowd, view, player, emotes, scene, crowdSprites, run } = setup(restaurantRow)
    let maxPop = 0
    run(20, 'day', 0.35, () => {
      maxPop = Math.max(maxPop, crowd.population)
      for (const s of crowdSprites) {
        if (!s.visible) continue
        // Visible only in/near the camera view.
        expect(s.x).toBeGreaterThan(view.x - 60)
        expect(s.x).toBeLessThan(view.x + view.w + 60)
        expect(s.y).toBeGreaterThan(view.y - 60)
        expect(s.y).toBeLessThan(view.y + view.h + 60)
      }
      for (const p of activeOf(crowd)) {
        if (!p.visible) continue
        // Under the canopy (10) and the cars (4); y-sorted against Mamma Cat (feet = player.y here).
        expect(p.sprite.depth).toBeGreaterThanOrEqual(2.5)
        expect(p.sprite.depth).toBeLessThan(3.99)
        expect(p.sprite.depth < 3, `person at y=${p.y}, cat at y=${player.y}`).toBe(p.y < player.y)
        // 4-direction art is never mirrored (a mirrored east walk is someone walking backwards)
        if (!(p as unknown as { look: { sideView: boolean } }).look.sideView) expect(p.sprite.flipX).toBe(false)
      }
    })
    expect(maxPop).toBeLessThanOrEqual(60)
    expect(crowd.population).toBeGreaterThanOrEqual(40)
    expect(player.body.setVelocity).not.toHaveBeenCalled()
    for (const call of emotes.show.mock.calls) expect(call[1]).not.toBe(player)
    expect(scene.registry.set).not.toHaveBeenCalled()
  })

  it('never double-books a seat or leaks pooled people across slot changes', () => {
    const { crowd, run } = setup(restaurantRow)
    const internals = crowd as unknown as {
      anchors: Map<string, Array<{ seats: unknown[]; used: number }>>
      counts: number[]
      free: unknown[]
    }
    const anchors = internals.anchors
    const books = () => {
      expect(internals.free.length + crowd.population).toBe(T.poolSize)
      expect(internals.counts.reduce((a, b) => a + b, 0)).toBe(crowd.population)
      internals.counts.forEach((n, role) => expect(n).toBe(activeOf(crowd).filter((p) => p.role === role).length))
    }
    run(10, 'day', 0.1, books)
    run(10, 'evening', 0.5, books)
    run(10, 'night', 0.5, books)
    run(20, 'day', 0.35, () => {
      books()
      const seen = new Set<unknown>()
      for (const list of anchors.values()) {
        for (const a of list) {
          const taken = a.seats.filter(Boolean)
          expect(a.used).toBe(taken.length)
          for (const p of taken) {
            expect(seen.has(p)).toBe(false)
            seen.add(p)
          }
        }
      }
    })
  })

  it('empties to the night shift once people can slip away unseen', () => {
    const { crowd, run } = setup(restaurantRow)
    run(15, 'day', 0.35)
    expect(crowd.population).toBeGreaterThan(30)
    run(60, 'night', 0.2)
    expect(crowd.population).toBeLessThanOrEqual(4)
  })

  it('keeps per-frame cost small at the lunch peak', () => {
    const { crowd, run } = setup(restaurantRow)
    run(15, 'day', 0.35)
    const t0 = performance.now()
    for (let i = 0; i < 600; i++) crowd.update(1000 / 60, 'day', 0.35)
    expect((performance.now() - t0) / 600).toBeLessThan(1)
  })

  it('posts extra guards: one hostile with a threat label, a 4-guard night shift, swaps only off-screen', () => {
    const { crowd, view, run, texts } = setup(spawnCat)
    const guards = crowd.extraGuards as unknown as Array<{ disposition: string; visible: boolean; active: boolean; x: number; y: number }>
    expect(guards.length).toBeGreaterThan(0)
    expect(guards.length + 1).toBeLessThanOrEqual(12)
    expect(guards.filter((g) => g.disposition === 'hostile')).toHaveLength(1)
    // The hostile one never guards a resource Mamma Cat needs (GameScene's food/water and shelter POIs).
    const hostile = guards.find((g) => g.disposition === 'hostile')!
    const resources = spawns.filter((s) =>
      /^poi_(feeding_station|fountain|water_bowl|starbucks|restaurant_scraps|shops_supermarket|pyramid_steps|safe_sleep|covered_area|escalator|library)/.test(s.name),
    )
    expect(resources.length).toBeGreaterThanOrEqual(15)
    for (const r of resources) {
      expect(Math.hypot(r.x - hostile.x, r.y - hostile.y), r.name).toBeGreaterThanOrEqual(T.hostileResourceDist)
    }
    for (const name of ['spawn_mammacat', 'spawn_guard']) {
      const s = placeNamed(spawns, name)!
      expect(Math.hypot(s.x - hostile.x, s.y - hostile.y), name).toBeGreaterThanOrEqual(T.hostileMinDist)
    }

    run(1, 'day', 0.1)
    const inView = (g: { x: number; y: number }) =>
      g.x > view.x - 96 && g.x < view.x + view.w + 96 && g.y > view.y - 96 && g.y < view.y + view.h + 96
    for (const g of guards) expect(g.visible).toBe(!inView(g)) // on duty unless the post is on screen
    expect(texts.filter((t) => !t.destroyed)).toHaveLength(2) // hostile guard: icon + label

    // Move the camera to a corner with no posts, then go to night.
    view.x = 0
    view.y = 0
    run(1, 'night', 0.5)
    expect(guards.filter((g) => g.visible)).toHaveLength(T.nightGuards)
    expect(guards.find((g) => g.disposition === 'hostile')?.visible).toBe(false)
    expect(texts.filter((t) => !t.destroyed)).toHaveLength(0)
  })

  it('destroy() releases sprites, guards and their colliders', () => {
    const { crowd, crowdSprites, colliders, run } = setup(restaurantRow)
    run(2, 'day', 0.35)
    const guards = crowd.extraGuards as unknown as Array<{ destroyed: boolean }>
    crowd.destroy()
    expect(crowdSprites.every((s) => s.destroyed)).toBe(true)
    expect(guards.every((g) => g.destroyed)).toBe(true)
    expect(colliders.length).toBeGreaterThan(0)
    for (const c of colliders) expect(c.destroy).toHaveBeenCalled()
  })

  it('places anchors only where a clear hop from the walkways exists', () => {
    const { crowd } = setup(restaurantRow)
    const anchors = (crowd as unknown as { anchors: Map<string, unknown[]> }).anchors
    for (const type of ['bench', 'dining', 'picnic', 'smoking', 'selfie']) {
      const usable = anchors.get(type)?.length ?? 0
      expect(usable, type).toBeGreaterThan(0)
      expect(usable, type).toBeLessThanOrEqual(placesOfType(places, type).length)
    }
  })

  it('only appears and vanishes off-screen (fades out at an exit that is in view)', () => {
    let fades = 0
    for (const exit of placesOfType(places, 'exit')) {
      const { crowdSprites, view, run } = setup(exit)
      const prev = crowdSprites.map(() => ({ visible: false, x: 0, y: 0, alpha: 1 }))
      const deepInView = (x: number, y: number) =>
        x > view.x + 20 && x < view.x + view.w - 20 && y > view.y + 20 && y < view.y + view.h - 20
      let popIn = 0
      let popOut = 0
      const track = () =>
        crowdSprites.forEach((s, i) => {
          const was = prev[i]!
          if (s.visible && !was.visible && deepInView(s.x, s.y)) popIn++
          if (!s.visible && was.visible && deepInView(was.x, was.y) && was.alpha >= 0.99) popOut++
          if (s.visible && s.alpha < 1 && was.alpha >= 1) fades++
          prev[i] = { visible: s.visible, x: s.x, y: s.y, alpha: s.alpha }
        })
      run(40, 'day', 0.35, track) // lunch
      run(40, 'night', 0.2, track) // most of the crowd walks out, many through this exit
      expect(popIn, exit.name).toBe(0)
      expect(popOut, exit.name).toBe(0)
    }
    expect(fades).toBeGreaterThan(0) // on-screen exits really were used
  })

  it('keeps everyone on walkable ground (never on roads or inside buildings)', () => {
    for (const at of [spawnCat, restaurantRow, placeNamed(places, 'exit_makati_crossing')!]) {
      const { crowd, run } = setup(at)
      let checked = 0
      run(45, 'day', 0.35, () => {
        for (const p of activeOf(crowd)) {
          checked++
          expect(deepInWall(p.x, p.y), `${Math.round(p.x)},${Math.round(p.y)}`).toBe(false)
        }
      })
      expect(checked).toBeGreaterThan(10_000)
    }
  })

  it('sheds only the surplus when a slot ends, never the whole table', () => {
    const { crowd, view, run } = setup(restaurantRow)
    run(25, 'day', 0.35) // lunch
    // Put the whole park on screen: nobody can be removed unseen and nobody new can spawn,
    // so every surplus person must be shed visibly (walk out), one at a time.
    Object.assign(view, { x: -50_000, y: -50_000, w: 100_000, h: 100_000 })
    run(0.1, 'day', 0.6) // → day slot
    const targets = (crowd as unknown as { targets: number[] }).targets
    const surplus = targets.map((t, i) =>
      Math.max(0, activeOf(crowd).filter((p) => p.role === i && p.intent !== 'leave' && !p.shed).length - t),
    )
    const shedCount = targets.map(() => 0)
    const wasShed = new Map<CrowdPerson, boolean>()
    run(15, 'day', 0.6, () => {
      for (const p of activeOf(crowd)) {
        if (p.shed && !wasShed.get(p)) shedCount[p.role]!++
        wasShed.set(p, p.shed)
      }
    })
    expect(surplus.reduce((a, b) => a + b, 0)).toBeGreaterThan(5)
    shedCount.forEach((n, i) => expect(n, `role ${i}`).toBeLessThanOrEqual(surplus[i]!))
  })

  it('people eating may toss a lingering Mamma Cat a capped number of morsels she can eat', () => {
    let seed = 12345
    const seeded = vi.spyOn(Math, 'random').mockImplementation(() => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000))
    const { crowd, player, emotes, run } = setup(restaurantRow)
    run(40, 'day', 0.35) // lunch: diners settle at the tables
    seeded.mockRestore()
    const internals = crowd as unknown as {
      active: Array<CrowdPerson & { mode: string; treatRolled: boolean }>
      treats: Array<{ x: number; y: number }>
      treatsToday: number
    }
    const diners = internals.active.filter((p) => p.mode === 'still' && p.visible && ['diner', 'lunch_eater', 'picnicker'].includes(CROWD_ROLES[p.role]?.id ?? ''))
    expect(diners.length).toBeGreaterThan(0)
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0) // every roll succeeds
    const lingerByEach = () => {
      for (const d of diners) {
        player.x = d.x + 20
        player.y = d.y + 10
        run(T.treatLingerMs / 1000 + 0.5, 'day', 0.36)
      }
    }
    let afterCap = -1
    try {
      lingerByEach()
      // the daily cap holds even when the same people are asked again
      internals.treatsToday = T.treatsPerDay
      const dropped = internals.treats.length
      for (const p of internals.active) p.treatRolled = false
      lingerByEach()
      afterCap = internals.treats.length - dropped
    } finally {
      rnd.mockRestore()
    }
    expect(afterCap).toBeLessThanOrEqual(0)
    expect(internals.treatsToday).toBe(T.treatsPerDay)
    expect(internals.treats.length).toBeGreaterThan(0)
    expect(emotes.show).toHaveBeenCalled()
    for (const call of emotes.show.mock.calls) expect(call[1]).not.toBe(player) // reactions go over the people, never the cat
    const stats = { restore: vi.fn(() => T.treatHunger) }
    const t = internals.treats[0]!
    const before = internals.treats.length
    expect(crowd.tryEatTreat(t.x + 200, t.y, stats as never)).toBe(0) // out of reach
    expect(crowd.tryEatTreat(t.x + 5, t.y, stats as never)).toBe(T.treatHunger)
    expect(stats.restore).toHaveBeenCalledWith('hunger', T.treatHunger)
    expect(internals.treats.length).toBe(before - 1)
  })

  it('never tosses a morsel while Mamma Cat is standing on a road', () => {
    let seed = 12345
    const seeded = vi.spyOn(Math, 'random').mockImplementation(() => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000))
    const { crowd, player, run } = setup(restaurantRow)
    run(40, 'day', 0.35)
    seeded.mockRestore()
    const internals = crowd as unknown as {
      active: Array<CrowdPerson & { mode: string; treatRolled: boolean }>
      treats: unknown[]
    }
    const diner = internals.active.find((p) => p.mode === 'still' && p.visible && ['diner', 'lunch_eater', 'picnicker'].includes(CROWD_ROLES[p.role]?.id ?? ''))
    expect(diner).toBeDefined()
    player.x = diner!.x + 20
    player.y = diner!.y + 10
    const cell = Math.floor(player.y / m.tilewidth) * m.width + Math.floor(player.x / m.tilewidth)
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0) // every roll would succeed
    try {
      testRoadCells.add(cell)
      run(T.treatLingerMs / 1000 + 0.5, 'day', 0.36)
      expect(internals.treats).toHaveLength(0)
      expect(diner!.treatRolled).toBe(false) // still owed: she can come back to the pavement
      testRoadCells.delete(cell)
      run(T.treatLingerMs / 1000 + 0.5, 'day', 0.36)
      expect(internals.treats.length).toBeGreaterThan(0)
    } finally {
      testRoadCells.clear()
      rnd.mockRestore()
    }
  })

  it('survives a map with no places at all', () => {
    const { scene } = makeScene({ x: 0, y: 0, w: 326, h: 250 })
    const player = { x: 100, y: 100, isCrouching: false, body: { setVelocity: vi.fn() } }
    const crowd = new AmbientCrowdSystem(scene as never, {
      places: [],
      spawns: [],
      player: player as never,
      groundLayer: null,
      objectsLayer: null,
      emotes: { show: vi.fn() } as never,
    })
    for (let i = 0; i < 120; i++) crowd.update(1000 / 60, 'day', 0.35)
    expect(crowd.population).toBe(0)
    expect(crowd.extraGuards).toHaveLength(0)
    crowd.destroy()
  })
})
