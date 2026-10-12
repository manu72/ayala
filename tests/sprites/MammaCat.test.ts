import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * MammaCat's lock-in animation states (greeting / consuming / swiping) each
 * register a `once(ANIMATION_COMPLETE_KEY + anim)` listener; an orphaned one
 * leaves the state machine stuck and the player frozen. Hand-rolled Phaser
 * stand-ins with a context-aware emitter so listener counts are observable.
 */
vi.mock('phaser', () => {
  type Listener = { fn: () => void; ctx: unknown }
  class MockSprite {
    x: number
    y: number
    body = { setSize: vi.fn(), setOffset: vi.fn(), velocity: { normalize: () => ({ scale: vi.fn() }) } }
    anims = { play: vi.fn(), stop: vi.fn(), msPerFrame: 0 }
    listeners = new Map<string, Listener[]>()
    constructor(public scene: unknown, x: number, y: number) {
      this.x = x
      this.y = y
    }
    once(event: string, fn: () => void, ctx: unknown): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), { fn, ctx }])
      return this
    }
    off(event: string, fn: () => void, ctx: unknown): this {
      this.listeners.set(event, (this.listeners.get(event) ?? []).filter((l) => l.fn !== fn || l.ctx !== ctx))
      return this
    }
    emit(event: string): void {
      const ls = this.listeners.get(event) ?? []
      this.listeners.delete(event)
      for (const l of ls) l.fn.call(l.ctx)
    }
    listenerCount(event: string): number {
      return this.listeners.get(event)?.length ?? 0
    }
    setCollideWorldBounds = vi.fn(() => this)
    setDepth = vi.fn(() => this)
    setScale = vi.fn(() => this)
    setTexture = vi.fn(() => this)
    setAlpha = vi.fn(() => this)
    setVelocity = vi.fn(() => this)
    setVelocityX = vi.fn(() => this)
    setVelocityY = vi.fn(() => this)
    destroy = vi.fn()
  }
  const Phaser = {
    Physics: { Arcade: { Sprite: MockSprite } },
    Animations: { Events: { ANIMATION_COMPLETE_KEY: 'animationcomplete-' } },
    Input: { Keyboard: { KeyCodes: {} } },
  }
  return { default: Phaser, ...Phaser }
})

import { MammaCat } from '../../src/sprites/MammaCat'

type TestCat = MammaCat & { emit(e: string): void; listenerCount(e: string): number; anims: { play: ReturnType<typeof vi.fn> } }

const DONE = 'animationcomplete-'

function makeCat(): TestCat {
  const text = { setOrigin: () => text, setDepth: () => text, setPosition: () => text, setText: () => text, destroy: vi.fn() }
  const scene = {
    add: { existing: vi.fn(), text: () => text },
    physics: { add: { existing: vi.fn() } },
    anims: { exists: () => true, create: vi.fn(), generateFrameNumbers: vi.fn(() => []) },
    input: { keyboard: null },
    time: { now: 0, delayedCall: vi.fn() },
  }
  return new MammaCat(scene as never, 0, 0) as TestCat
}

describe('MammaCat paw swipe (ATG-008)', () => {
  let cat: TestCat
  beforeEach(() => {
    cat = makeCat()
  })

  it('plays the swipe once and returns to normal when it completes', () => {
    expect(cat.startSwipe()).toBe(true)
    expect(cat.playerState).toBe('swiping')
    expect(cat.anims.play).toHaveBeenLastCalledWith('mc-swipe-e', false)
    cat.emit(DONE + 'mc-swipe-e')
    expect(cat.playerState).toBe('normal')
  })

  it('cuts a greeting short without orphaning its completion listener', () => {
    cat.startGreeting()
    expect(cat.listenerCount(DONE + 'mc-greet-e')).toBe(1)
    expect(cat.startSwipe()).toBe(true)
    expect(cat.listenerCount(DONE + 'mc-greet-e')).toBe(0)
    cat.emit(DONE + 'mc-swipe-e')
    expect(cat.playerState).toBe('normal')
  })

  it('turns to swat the way a touch flick went', () => {
    cat.startSwipe('w')
    expect(cat.anims.play).toHaveBeenLastCalledWith('mc-swipe-w', false)
    cat.startSwipe()
    expect(cat.anims.play).toHaveBeenLastCalledWith('mc-swipe-w', false) // and keeps that facing
  })

  it('restarts on a re-press with exactly one completion listener', () => {
    cat.startSwipe()
    cat.startSwipe()
    cat.startSwipe()
    expect(cat.listenerCount(DONE + 'mc-swipe-e')).toBe(1)
    expect(cat.anims.play).toHaveBeenCalledTimes(3)
  })

  it('is refused while consuming or resting', () => {
    cat.startConsuming()
    expect(cat.startSwipe()).toBe(false)
    expect(cat.playerState).toBe('consuming')
    cat.emit(DONE + 'mc-drink-e')
    cat.enterRest()
    expect(cat.startSwipe()).toBe(false)
    expect(cat.playerState).toBe('resting')
  })

  it('locks out the other lock-in states while swiping', () => {
    cat.startSwipe()
    expect(cat.startGreeting()).toBe(false)
    expect(cat.startConsuming()).toBe(false)
    cat.enterRest()
    cat.enterCatloaf()
    expect(cat.playerState).toBe('swiping')
  })
})

describe('MammaCat holds still for a story shot (ATG-009)', () => {
  it('stops a walk or run in an idle pose: standing, or sitting if crouched', () => {
    const cat = makeCat()
    cat.isRunning = true
    cat.holdStill()
    expect(cat.isRunning).toBe(false)
    expect(cat.setVelocity).toHaveBeenLastCalledWith(0)
    expect(cat.setTexture).toHaveBeenCalled() // facing south: the stand frame

    cat.playerState = 'crouching'
    cat.holdStill()
    expect(cat.anims.play).toHaveBeenLastCalledWith(expect.stringMatching(/^mc-sit-idle-/), true)
  })

  it('leaves a pose that ends on its own (loaf, greeting) alone', () => {
    const cat = makeCat()
    cat.enterCatloaf()
    const setTexture = cat.setTexture as unknown as ReturnType<typeof vi.fn>
    const plays = cat.anims.play.mock.calls.length
    const textures = setTexture.mock.calls.length
    cat.holdStill()
    expect(cat.playerState).toBe('catloaf')
    expect(cat.anims.play).toHaveBeenCalledTimes(plays)
    expect(setTexture).toHaveBeenCalledTimes(textures) // no standing frame over the loaf
  })
})
