import { describe, it, expect, vi } from 'vitest'

/**
 * GuardNPC extends Phaser.Physics.Arcade.Sprite (via BaseNPC). We hand-roll the
 * small slice of Phaser it touches. Velocities are captured, not integrated:
 * tests move the guard/player explicitly.
 */
vi.mock('phaser', () => {
  class MockVector2 {
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

  class MockSprite {
    x: number
    y: number
    scene: unknown
    active = true
    visible = true
    frame = -1
    vx = 0
    vy = 0
    body = {
      setSize: vi.fn(),
      setOffset: vi.fn(),
      enable: true,
      reset: (x: number, y: number) => {
        this.x = x
        this.y = y
        this.vx = 0
        this.vy = 0
      },
    }
    anims = { play: vi.fn(), stop: vi.fn() }
    constructor(scene: unknown, x: number, y: number) {
      this.scene = scene
      this.x = x
      this.y = y
    }
    setDepth(): this {
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
    setFrame(f: number): this {
      this.frame = f
      return this
    }
    destroy(): void {}
  }

  return {
    default: {
      Physics: { Arcade: { Sprite: MockSprite } },
      Math: {
        Vector2: MockVector2,
        Distance: { Between: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1) },
        Between: (lo: number) => lo,
      },
    },
  }
})

import { GuardNPC, type GuardDisposition } from '../../src/sprites/GuardNPC'
import type { MammaCat } from '../../src/sprites/MammaCat'

interface FakePlayer {
  x: number
  y: number
  isCrouching: boolean
  body: { setVelocity: ReturnType<typeof vi.fn> }
}

function makeScene(underCanopy = false) {
  return {
    add: { existing: vi.fn() },
    physics: { add: { existing: vi.fn() } },
    anims: { exists: () => true },
    isUnderCanopy: () => underCanopy,
  }
}

function makeGuard(disposition?: GuardDisposition, opts: { underCanopy?: boolean; emotes?: { show: ReturnType<typeof vi.fn> } } = {}) {
  const scene = makeScene(opts.underCanopy)
  const guard = disposition
    ? new GuardNPC(scene as never, 0, 0, { disposition, emotes: opts.emotes as never })
    : new GuardNPC(scene as never, 0, 0)
  const player: FakePlayer = { x: 0, y: 0, isCrouching: false, body: { setVelocity: vi.fn() } }
  guard.setTarget(player as unknown as MammaCat)
  const g = guard as unknown as { vx: number; vy: number; x: number; y: number; frame: number }
  return { guard, player, g }
}

const speed = (g: { vx: number; vy: number }) => Math.hypot(g.vx, g.vy)

describe('GuardNPC hostile (default) — pinned original behaviour', () => {
  it('defaults to hostile', () => {
    expect(makeGuard().guard.disposition).toBe('hostile')
  })

  it('detects at 120 px and chases at 100 px/s', () => {
    const { guard, player, g } = makeGuard()
    player.x = 121
    guard.update(16)
    guard.update(16)
    expect(speed(g)).toBeCloseTo(30) // still patrolling

    player.x = 119
    guard.update(16) // patrol → chasing
    guard.update(16)
    expect(speed(g)).toBeCloseTo(100)
    expect(g.vx).toBeGreaterThan(0)
  })

  it('detects a crouching cat at 80 px in the open and 40 px under canopy', () => {
    for (const [underCanopy, range] of [
      [false, 80],
      [true, 40],
    ] as const) {
      const { guard, player, g } = makeGuard(undefined, { underCanopy })
      player.isCrouching = true
      player.x = range + 1
      guard.update(16)
      guard.update(16)
      expect(speed(g)).toBeCloseTo(30)
      player.x = range - 1
      guard.update(16)
      guard.update(16)
      expect(speed(g)).toBeCloseTo(100)
    }
  })

  it('shoves the cat at 300 px/s on contact (< 30 px), then walks home', () => {
    const { guard, player, g } = makeGuard()
    player.x = 100
    guard.update(16) // → chasing
    player.x = 29
    guard.update(16) // contact
    const [vx, vy] = player.body.setVelocity.mock.calls[0] as [number, number]
    expect(Math.hypot(vx, vy)).toBeCloseTo(300)
    g.x = 50
    guard.update(16) // returning at patrol speed toward home
    expect(speed(g)).toBeCloseTo(30)
    expect(g.vx).toBeLessThan(0)
  })

  it('gives up beyond the 250 px leash and re-patrols within 20 px of home', () => {
    const { guard, player, g } = makeGuard()
    player.x = 100
    guard.update(16) // chasing
    player.x = 400
    guard.update(16) // > 250 → returning
    g.x = 30
    guard.update(16)
    expect(g.vx).toBeLessThan(0) // heading home
    g.x = 10
    guard.update(16) // < 20 → patrol, stop
    expect(speed(g)).toBe(0)
  })
})

describe('GuardNPC passive / friendly — never chase, never touch the player', () => {
  for (const disposition of ['passive', 'friendly'] as const) {
    it(`${disposition}: ignores a cat right next to it`, () => {
      const emotes = { show: vi.fn() }
      const { guard, player, g } = makeGuard(disposition, { emotes })
      for (let i = 0; i < 400; i++) {
        player.x = g.x + 10
        player.y = g.y
        guard.update(16)
        expect(speed(g)).toBeLessThanOrEqual(30 + 1e-9)
      }
      expect(player.body.setVelocity).not.toHaveBeenCalled()
      for (const call of emotes.show.mock.calls) expect(call[1]).toBe(guard)
    })
  }

  it('friendly: stops and faces Mamma Cat once, with an emote on the GUARD', () => {
    const emotes = { show: vi.fn() }
    const { guard, player, g } = makeGuard('friendly', { emotes })
    player.x = 300
    guard.update(16)
    player.x = g.x + 50 // east, inside 64 px
    player.y = g.y
    guard.update(16)
    expect(speed(g)).toBe(0)
    expect(g.frame).toBe(6) // east-facing standing rotation
    expect(emotes.show).toHaveBeenCalledTimes(1)
    expect(emotes.show.mock.calls[0]![1]).toBe(guard)
    expect(['heart', 'curious']).toContain(emotes.show.mock.calls[0]![2])

    // Stays put for the 2.5 s notice window, without re-emoting.
    for (let i = 0; i < 150; i++) {
      guard.update(16)
      expect(speed(g)).toBe(0)
    }
    for (let i = 0; i < 20; i++) guard.update(16)
    expect(emotes.show).toHaveBeenCalledTimes(1)

    // Re-arms only after she has wandered off.
    player.x = g.x + 200
    guard.update(16)
    player.x = g.x - 40
    guard.update(16)
    expect(emotes.show).toHaveBeenCalledTimes(2)
    expect(g.frame).toBe(2) // west
  })

  it('passive: never emotes', () => {
    const emotes = { show: vi.fn() }
    const { guard, player, g } = makeGuard('passive', { emotes })
    player.x = g.x + 20
    for (let i = 0; i < 50; i++) guard.update(16)
    expect(emotes.show).not.toHaveBeenCalled()
  })

  it('resetToPost snaps a guard home and stops it', () => {
    const { guard, g } = makeGuard('hostile')
    g.x = 77
    g.y = -12
    guard.resetToPost()
    expect([g.x, g.y]).toEqual([0, 0])
    expect(speed(g)).toBe(0)
  })
})
