import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * HumanNPC extends Phaser.Physics.Arcade.Sprite and uses a small subset of the
 * Phaser runtime: Math.Vector2, Math.Distance.Between, and scene-level
 * add.graphics + anims.exists. We hand-roll those rather than boot Phaser.
 *
 * Anim lookup (scene.anims.exists) always returns true, which short-circuits
 * createSpriteProfileAnimations in the constructor and lets anims.play remain
 * a simple spy that we can assert against.
 */
vi.mock('phaser', () => {
  class MockVector2 {
    x: number
    y: number
    constructor(x = 0, y = 0) {
      this.x = x
      this.y = y
    }
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
    copy(v: { x: number; y: number }): this {
      this.x = v.x
      this.y = v.y
      return this
    }
  }

  class MockBody {
    setSize = vi.fn()
    setOffset = vi.fn()
    setEnable = vi.fn()
    _sprite: MockSprite | null = null
    reset(x: number, y: number): void {
      if (this._sprite) {
        this._sprite.x = x
        this._sprite.y = y
        // Phaser Arcade body.reset() zeroes velocity/acceleration. Mirror that
        // so simulatePhysics() (which integrates the sprite's captured _vx/_vy)
        // does not carry stale motion across a reset.
        this._sprite._vx = 0
        this._sprite._vy = 0
      }
    }
  }

  class MockSprite {
    scene: unknown
    x: number
    y: number
    active = true
    visible = true
    alpha = 1
    body: MockBody | null
    texture: { key: string }
    anims = {
      play: vi.fn(),
      pause: vi.fn(),
    }

    constructor(scene: unknown, x: number, y: number, texture: string) {
      this.scene = scene
      this.x = x
      this.y = y
      this.texture = { key: texture }
      const body = new MockBody()
      body._sprite = this
      this.body = body
    }

    setDepth(_: number): this {
      return this
    }
    setCollideWorldBounds(_: boolean): this {
      return this
    }
    setScale(_: number): this {
      return this
    }
    setVisible(v: boolean): this {
      this.visible = v
      return this
    }
    setActive(a: boolean): this {
      this.active = a
      return this
    }
    // Capture velocity so tests can simulate physics steps. Real Phaser
    // integrates velocity * dt into position via Arcade physics; the mock
    // leaves that integration to the test (see simulatePhysics below).
    _vx = 0
    _vy = 0
    setVelocity(x = 0, y = 0): this {
      this._vx = x
      this._vy = y
      return this
    }
    setPosition(x: number, y: number): this {
      this.x = x
      this.y = y
      return this
    }
    setTint(_: number): this {
      return this
    }
    setAlpha(a: number): this {
      this.alpha = a
      return this
    }
  }

  return {
    default: {
      Physics: { Arcade: { Sprite: MockSprite } },
      Math: {
        Vector2: MockVector2,
        Distance: {
          Between: (ax: number, ay: number, bx: number, by: number) =>
            Math.hypot(bx - ax, by - ay),
        },
        Between: (min: number, max: number) => Math.floor((min + max) / 2),
      },
    },
  }
})

import { HumanNPC, type HumanConfig } from '../../src/sprites/HumanNPC'

interface GraphicsMock {
  fillStyle: ReturnType<typeof vi.fn>
  fillEllipse: ReturnType<typeof vi.fn>
  lineStyle: ReturnType<typeof vi.fn>
  strokeEllipse: ReturnType<typeof vi.fn>
  setPosition: ReturnType<typeof vi.fn>
  setDepth: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  destroyed: boolean
}

function makeGraphicsMock(): GraphicsMock {
  const g = {} as GraphicsMock
  g.destroyed = false
  g.fillStyle = vi.fn(() => g)
  g.fillEllipse = vi.fn(() => g)
  g.lineStyle = vi.fn(() => g)
  g.strokeEllipse = vi.fn(() => g)
  g.setPosition = vi.fn(() => g)
  g.setDepth = vi.fn(() => g)
  g.destroy = vi.fn(() => {
    g.destroyed = true
  })
  return g
}

function makeScene() {
  const graphicsInstances: GraphicsMock[] = []
  const physicsCalls: Array<{ method: 'existing'; obj: unknown }> = []
  return {
    graphicsInstances,
    physicsCalls,
    scene: {
      add: {
        existing: vi.fn(),
        graphics: vi.fn(() => {
          const g = makeGraphicsMock()
          graphicsInstances.push(g)
          return g
        }),
      },
      physics: {
        add: {
          existing: vi.fn((obj: unknown) => {
            physicsCalls.push({ method: 'existing', obj })
          }),
        },
      },
      anims: {
        // Every anim key "exists" so createSpriteProfileAnimations is a no-op
        // and the constructor stays fast and side-effect-free.
        exists: vi.fn(() => true),
        create: vi.fn(),
        generateFrameNumbers: vi.fn(() => []),
      },
    } as unknown as Phaser.Scene,
  }
}

/**
 * Advance a HumanNPC by `delta` ms and integrate its captured velocity into
 * position (mimicking Phaser Arcade physics so exit-seeking can converge).
 */
function simulatePhysics(npc: HumanNPC, delta: number): void {
  npc.update(delta)
  // Velocity is captured by the MockSprite.setVelocity override in the mock.
  const sprite = npc as unknown as { _vx?: number; _vy?: number }
  const vx = sprite._vx ?? 0
  const vy = sprite._vy ?? 0
  npc.x += (vx * delta) / 1000
  npc.y += (vy * delta) / 1000
}

/** Build a HumanNPC with sensible defaults overridable per test. */
function makeHuman(overrides: Partial<HumanConfig> & { type: HumanConfig['type'] }) {
  const harness = makeScene()
  const cfg: HumanConfig = {
    type: overrides.type,
    path: overrides.path ?? [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    speed: overrides.speed ?? 50,
    activePhases: overrides.activePhases ?? ['dawn', 'evening'],
    lingerSec: overrides.lingerSec,
    lingerWaypointIndex: overrides.lingerWaypointIndex,
    exitAfterLinger: overrides.exitAfterLinger,
    identityName: overrides.identityName,
  }
  const npc = new HumanNPC(harness.scene, cfg)
  return { npc, ...harness }
}

// ──────────────────────────────────────────────────────────────
// H3: Manu greeting cadence
// ──────────────────────────────────────────────────────────────

describe('HumanNPC.shouldDeferManuGreet — cadence', () => {
  it('returns false (no defer) for every non-Manu type', () => {
    for (const type of ['feeder', 'camille', 'kish', 'jogger', 'dogwalker'] as const) {
      const { npc } = makeHuman({ type })
      for (let i = 0; i < 6; i++) {
        expect(npc.shouldDeferManuGreet()).toBe(false)
      }
    }
  })

  it('for Manu: defers 2 of every 3 consecutive calls', () => {
    const { npc } = makeHuman({ type: 'manu' })
    const results: boolean[] = []
    for (let i = 0; i < 9; i++) {
      results.push(npc.shouldDeferManuGreet())
    }
    // Every third call (indices 2, 5, 8) should greet (false = do not defer).
    expect(results).toEqual([true, true, false, true, true, false, true, true, false])
  })

  it('for Manu: cadence persists across path waypoints until the path loops', () => {
    // Two-waypoint path, feeder-style linger not applicable (manu is not feeder)
    const { npc } = makeHuman({
      type: 'manu',
      path: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    })
    npc.setPhase('dawn') // activate
    // First two calls defer.
    expect(npc.shouldDeferManuGreet()).toBe(true)
    expect(npc.shouldDeferManuGreet()).toBe(true)
    // Advance to next waypoint (10, 0).
    npc.x = 10
    npc.y = 0
    npc.update(16)
    // Wrap back to start of path (triggers manuGreetWave reset in advanceWaypoint).
    npc.x = 0
    npc.y = 0
    npc.update(16)
    // After the wrap, cadence is reset: the very next call defers again
    // (wave 1 of 3), NOT greets (would need wave 3).
    expect(npc.shouldDeferManuGreet()).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────
// H2: Feeder linger state machine
// ──────────────────────────────────────────────────────────────

describe('HumanNPC — feeder linger state machine', () => {
  function makeFeeder(opts: {
    lingerSec?: number
    exitAfterLinger?: boolean
    lingerWaypointIndex?: number
    path?: Array<{ x: number; y: number }>
  } = {}) {
    return makeHuman({
      type: 'feeder',
      path: opts.path ?? [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
      lingerSec: opts.lingerSec ?? 2,
      lingerWaypointIndex: opts.lingerWaypointIndex ?? 1,
      exitAfterLinger: opts.exitAfterLinger,
    })
  }

  function teleport(npc: HumanNPC, x: number, y: number) {
    npc.x = x
    npc.y = y
  }

  it('enters lingering on arrival at the linger waypoint: stops, idles, creates a feeding bowl prop once', () => {
    const { npc, scene, graphicsInstances } = makeFeeder()
    npc.setPhase('dawn')

    // Arrive at waypoint (200, 0).
    teleport(npc, 200, 0)
    const setVelocity = vi.spyOn(npc, 'setVelocity')
    npc.update(16)

    expect(setVelocity).toHaveBeenCalledWith(0)
    expect((scene.add.graphics as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
    expect(graphicsInstances).toHaveLength(1)
    const bowl = graphicsInstances[0]!
    // Bowl is positioned on the sprite and has a non-zero depth for layering.
    expect(bowl.setPosition).toHaveBeenCalledWith(200, 0)
    expect(bowl.setDepth).toHaveBeenCalled()
    expect(npc.anims.play).toHaveBeenCalledWith('feeder-idle', true)
  })

  it('does not create a second prop while already lingering', () => {
    const { npc, scene } = makeFeeder({ lingerSec: 5 })
    npc.setPhase('dawn')
    teleport(npc, 200, 0)
    npc.update(16) // enters linger
    npc.update(16) // still lingering
    npc.update(16) // still lingering
    expect(scene.add.graphics).toHaveBeenCalledTimes(1)
  })

  it('follows the sprite with the bowl prop while lingering (setPosition per frame)', () => {
    const { npc, graphicsInstances } = makeFeeder({ lingerSec: 5 })
    npc.setPhase('dawn')
    teleport(npc, 200, 0)
    npc.update(16) // enters linger; setPosition called once on creation
    const bowl = graphicsInstances[0]!
    const callsAfterEnter = bowl.setPosition.mock.calls.length

    // While lingering, each update() should reposition the bowl on the sprite.
    npc.update(16)
    npc.update(16)
    expect(bowl.setPosition.mock.calls.length).toBeGreaterThan(callsAfterEnter)
  })

  it('destroys the bowl prop and advances when the linger timer expires', () => {
    // Path of 3 waypoints, linger at index 1; after linger the NPC should
    // resume walking toward waypoint 2 (so we do NOT trigger path-loop/exit paths).
    const { npc, graphicsInstances } = makeFeeder({
      lingerSec: 1, // 1s
      lingerWaypointIndex: 1,
      path: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 400, y: 0 },
      ],
    })
    npc.setPhase('dawn')
    teleport(npc, 200, 0)
    npc.update(16) // enters linger
    const bowl = graphicsInstances[0]!
    expect(bowl.destroyed).toBe(false)

    // Elapse slightly past 1000ms so lingerTimer hits 0.
    npc.update(500)
    expect(bowl.destroyed).toBe(false)
    npc.update(501)

    expect(bowl.destroyed).toBe(true)
    // After linger ends the NPC resumes movement — next update() heads to waypoint 2.
    // Observable: setVelocity is called with non-zero components.
    const setVel = vi.spyOn(npc, 'setVelocity')
    npc.update(16)
    // At least one call with a non-zero component (moving toward next waypoint).
    const movingCall = setVel.mock.calls.find(
      ([vx, vy]) => (vx ?? 0) !== 0 || (vy ?? 0) !== 0,
    )
    expect(movingCall).toBeDefined()
  })

  it('with exitAfterLinger: triggers exit (not path loop) when linger ends at the path tail', () => {
    // Path whose linger waypoint IS the last waypoint; exitAfterLinger promotes
    // "end of path" into "start exiting to nearest park exit".
    const { npc, graphicsInstances } = makeFeeder({
      lingerSec: 1,
      lingerWaypointIndex: 1,
      exitAfterLinger: true,
      path: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
    })
    npc.setPhase('dawn')
    teleport(npc, 200, 0)
    npc.update(16)
    npc.update(1001)

    // Bowl is cleaned up and NPC is in exiting state.
    expect(graphicsInstances[0]!.destroyed).toBe(true)
    // On the next update(), the NPC should move toward a park exit (non-zero velocity).
    const setVel = vi.spyOn(npc, 'setVelocity')
    npc.update(16)
    const moving = setVel.mock.calls.some(
      ([vx, vy]) => (vx ?? 0) !== 0 || (vy ?? 0) !== 0,
    )
    expect(moving).toBe(true)
    // Exits are far from (200, 0); after many updates the NPC should eventually
    // become invisible + inactive when it reaches the exit point.
  })

  it('destroys a lingering prop on phase-out deactivation', () => {
    const { npc, graphicsInstances } = makeFeeder({ lingerSec: 10 })
    npc.setPhase('dawn')
    teleport(npc, 200, 0)
    npc.update(16)
    const bowl = graphicsInstances[0]!
    expect(bowl.destroyed).toBe(false)

    // Leaving the active phase starts exiting (not immediate deactivate).
    npc.setPhase('night')
    // Walk the NPC to a park exit at 200ms steps (see note above on overshoot).
    for (let i = 0; i < 2000 && !bowl.destroyed; i++) {
      simulatePhysics(npc, 200)
    }
    expect(bowl.destroyed).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────
// setPhase activation / exit transitions
// ──────────────────────────────────────────────────────────────

describe('HumanNPC.setPhase — activation / exit transitions', () => {
  it('becomes visible + active when entering an active phase from inactive', () => {
    const { npc } = makeHuman({ type: 'jogger', activePhases: ['day'] })
    expect(npc.visible).toBe(false)
    expect(npc.active).toBe(false)
    npc.setPhase('day')
    expect(npc.visible).toBe(true)
    expect(npc.active).toBe(true)
  })

  it('stays hidden + inactive when entering a non-active phase', () => {
    const { npc } = makeHuman({ type: 'jogger', activePhases: ['day'] })
    npc.setPhase('night')
    expect(npc.visible).toBe(false)
    expect(npc.active).toBe(false)
  })

  it('same active phase twice is idempotent (no re-activation)', () => {
    const { npc } = makeHuman({ type: 'jogger', activePhases: ['day'] })
    npc.setPhase('day')
    // activate() teleports the NPC to path[0] via body.reset(). Spy on reset
    // rather than setVelocity (which activate does not call) so we actually
    // observe re-activation if it were (incorrectly) triggered again.
    const body = (npc as unknown as { body: { reset: (x: number, y: number) => void } }).body
    const resetSpy = vi.spyOn(body, 'reset')
    const xBefore = npc.x
    const yBefore = npc.y
    npc.setPhase('day')
    expect(resetSpy).not.toHaveBeenCalled()
    expect(npc.x).toBe(xBefore)
    expect(npc.y).toBe(yBefore)
  })

  it('starts exiting (not immediate deactivate) when leaving the active phase', () => {
    const { npc } = makeHuman({ type: 'jogger', activePhases: ['day'] })
    npc.setPhase('day')
    expect(npc.visible).toBe(true)
    npc.setPhase('night')
    // Still visible while walking to a park exit.
    expect(npc.visible).toBe(true)
    expect(npc.active).toBe(true)
  })

  it('re-entering the active phase while still exiting does not re-activate', () => {
    const { npc } = makeHuman({ type: 'jogger', activePhases: ['day'] })
    npc.setPhase('day')
    npc.setPhase('night') // begins exiting
    const x0 = npc.x
    const y0 = npc.y
    npc.setPhase('day') // should be a no-op while exiting
    // Still visible (because exiting keeps us visible), but body is unchanged —
    // we did NOT re-teleport back to path[0].
    expect(npc.x).toBe(x0)
    expect(npc.y).toBe(y0)
  })

  it('eventually deactivates once the NPC reaches a park exit', () => {
    const { npc } = makeHuman({ type: 'jogger', activePhases: ['day'] })
    npc.setPhase('day')
    npc.setPhase('night')
    // Walk the NPC to a park exit by integrating velocity each 200ms step.
    // Exit threshold is 24px; at speed * 1.2 = 60 px/s and 200ms steps the
    // per-step displacement is ~12px, small enough to cross the threshold
    // without overshoot oscillation around the target.
    for (let i = 0; i < 2000 && npc.active; i++) {
      simulatePhysics(npc, 200)
    }
    expect(npc.active).toBe(false)
    expect(npc.visible).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────
// Greeting helpers + isCatPerson
// ──────────────────────────────────────────────────────────────

describe('HumanNPC — greeting helpers', () => {
  let cat: object

  beforeEach(() => {
    cat = { marker: 'cat' }
  })

  it('hasGreeted / markGreeted track identity per target', () => {
    const { npc } = makeHuman({ type: 'feeder' })
    const other = { marker: 'other' }
    expect(npc.hasGreeted(cat)).toBe(false)
    npc.markGreeted(cat)
    expect(npc.hasGreeted(cat)).toBe(true)
    expect(npc.hasGreeted(other)).toBe(false)
  })

  it('resetGreeted clears the greeted set', () => {
    const { npc } = makeHuman({ type: 'feeder' })
    npc.markGreeted(cat)
    expect(npc.hasGreeted(cat)).toBe(true)
    npc.resetGreeted()
    expect(npc.hasGreeted(cat)).toBe(false)
  })

  it.each<[HumanConfig['type'], number]>([
    ['camille', 6000],
    ['kish', 3000],
    ['feeder', 4000],
    ['manu', 4000],
  ])('startGreeting sets %s-specific duration (%dms) and clears on update', (type, duration) => {
    const { npc } = makeHuman({ type })
    npc.setPhase('dawn')
    npc.startGreeting(npc.x + 10, npc.y)
    expect(npc.isGreeting).toBe(true)
    // Just before duration expires, still greeting.
    npc.update(duration - 1)
    expect(npc.isGreeting).toBe(true)
    // At/past duration, greeting clears.
    npc.update(2)
    expect(npc.isGreeting).toBe(false)
  })

  it('isCatPerson is true for feeder/camille/manu/kish and false for jogger/dogwalker', () => {
    for (const type of ['feeder', 'camille', 'manu', 'kish'] as const) {
      expect(makeHuman({ type }).npc.isCatPerson).toBe(true)
    }
    for (const type of ['jogger', 'dogwalker'] as const) {
      expect(makeHuman({ type }).npc.isCatPerson).toBe(false)
    }
  })
})

// ──────────────────────────────────────────────────────────────
// glanceAt throttling
// ──────────────────────────────────────────────────────────────

describe('HumanNPC.glanceAt — throttling', () => {
  it('ignores a second glance while the glance timer is still active', () => {
    const { npc } = makeHuman({ type: 'jogger', activePhases: ['day'] })
    npc.setPhase('day')
    npc.glanceAt(npc.x + 10, npc.y)
    const playsAfterFirst = (npc.anims.play as ReturnType<typeof vi.fn>).mock.calls.length
    npc.glanceAt(npc.x + 10, npc.y) // should be a no-op
    expect((npc.anims.play as ReturnType<typeof vi.fn>).mock.calls.length).toBe(playsAfterFirst)
  })

  it('allows a new glance once the previous glance timer has elapsed', () => {
    const { npc } = makeHuman({ type: 'jogger', activePhases: ['day'] })
    npc.setPhase('day')
    npc.glanceAt(npc.x + 10, npc.y)
    // 1500ms glance window; advance past it.
    npc.update(1501)
    const playsAfterFirstExpire = (npc.anims.play as ReturnType<typeof vi.fn>).mock.calls.length
    npc.glanceAt(npc.x + 10, npc.y)
    expect((npc.anims.play as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
      playsAfterFirstExpire,
    )
  })
})

// ──────────────────────────────────────────────────────────────
// Persona identity wiring
// ──────────────────────────────────────────────────────────────

describe('HumanNPC.identityName — persona wiring', () => {
  it('defaults named types to their canonical persona key', () => {
    const cases: Array<[HumanConfig['type'], string]> = [
      ['camille', 'Camille'],
      ['manu', 'Manu'],
      ['kish', 'Kish'],
    ]
    for (const [type, expected] of cases) {
      const { npc } = makeHuman({ type })
      expect(npc.identityName).toBe(expected)
    }
  })

  it('leaves anonymous types null by default (feeders, joggers, dogwalkers)', () => {
    for (const type of ['feeder', 'jogger', 'jogger_male', 'dogwalker'] as const) {
      const { npc } = makeHuman({ type })
      expect(npc.identityName).toBeNull()
    }
  })

  it('honours explicit identityName override (feeders opted in by name)', () => {
    const { npc: rose } = makeHuman({ type: 'feeder', identityName: 'Rose' })
    const { npc: ben } = makeHuman({ type: 'feeder', identityName: 'Ben' })
    expect(rose.identityName).toBe('Rose')
    expect(ben.identityName).toBe('Ben')
  })
})
