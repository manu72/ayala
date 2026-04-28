import { describe, it, expect, vi } from 'vitest'

/**
 * profileForType and createSpriteProfileAnimations live in SpriteProfiles, which
 * imports BaseNPC → Phaser. Mock Phaser before loading the module under test.
 */
vi.mock('phaser', () => ({
  default: {
    Physics: { Arcade: { Sprite: class {} } },
  },
}))

import { BaseNPC } from '../../src/sprites/BaseNPC'

const { profileForType, createSpriteProfileAnimations } = await import('../../src/sprites/SpriteProfiles')

/** Minimal anim config captured from scene.anims.create (Phaser-compatible shape). */
interface CapturedAnim {
  key: string
  frames: Array<{ key: string; frame: number }>
  frameRate: number
  repeat: number
}

function buildAnimScene() {
  const store = new Map<string, CapturedAnim>()

  const generateFrameNumbersImpl = (textureKey: string | number, cfg: { start: number; end: number }) => {
    const tex = String(textureKey)
    const frames: Array<{ key: string; frame: number }> = []
    for (let i = cfg.start; i <= cfg.end; i++) frames.push({ key: tex, frame: i })
    return frames
  }
  const generateFrameNumbers = vi.fn(generateFrameNumbersImpl)

  const scene = {
    anims: {
      exists: (k: string) => store.has(k),
      create: (config: CapturedAnim) => {
        store.set(config.key, config)
      },
      generateFrameNumbers,
    },
  } as unknown as Phaser.Scene

  return { scene, store, generateFrameNumbers }
}

function framesForRow(profileKey: string, row: number, cols: number, count: number) {
  const { start, end } = BaseNPC.rowFrames(row, cols, count)
  return Array.from({ length: end - start + 1 }, (_, i) => ({
    key: profileKey,
    frame: start + i,
  }))
}

describe('profileForType', () => {
  const expectedKeys: Record<string, string> = {
    jogger: 'jogger',
    feeder: 'feeder',
    ben: 'ben',
    dogwalker: 'dogwalker',
    camille: 'camille',
    manu: 'manu',
    kish: 'kish',
  }

  for (const [type, expectedKey] of Object.entries(expectedKeys)) {
    it(`returns profile with key "${expectedKey}" for type "${type}"`, () => {
      const profile = profileForType(type as Parameters<typeof profileForType>[0])
      expect(profile.key).toBe(expectedKey)
    })
  }

  it('throws for unhandled HumanType (exhaustive switch)', () => {
    expect(() =>
      profileForType('unknown' as Parameters<typeof profileForType>[0]),
    ).toThrow(/Unhandled HumanType: unknown/)
  })

  it('all profiles have required shape fields', () => {
    const types = ['jogger', 'feeder', 'ben', 'dogwalker', 'camille', 'manu', 'kish'] as const
    for (const type of types) {
      const profile = profileForType(type)
      expect(typeof profile.key).toBe('string')
      expect(typeof profile.cols).toBe('number')
      expect(typeof profile.frameW).toBe('number')
      expect(typeof profile.frameH).toBe('number')
      expect(typeof profile.bodyW).toBe('number')
      expect(typeof profile.bodyH).toBe('number')
      expect(profile.anims).toBeDefined()
      expect(profile.anims.walkDown).toBeDefined()
      expect(profile.anims.walkLeft).toBeDefined()
      expect(profile.anims.walkRight).toBeDefined()
      expect(profile.anims.walkUp).toBeDefined()
      expect(profile.anims.idle).toBeDefined()
    }
  })

  it('ben uses dedicated stand, walk, and crouch sheets', () => {
    const profile = profileForType('ben')
    expect(profile.key).toBe('ben')
    expect(profile.cols).toBe(8)
    expect(profile.frameW).toBe(68)
    expect(profile.frameH).toBe(68)
    expect(profile.scale).toBe(0.7)
    expect(profile.directionalKeys).toMatchObject({
      walkDown: 'ben_walk_s',
      walkLeft: 'ben_walk_w',
      walkRight: 'ben_walk_e',
      walkUp: 'ben_walk_n',
      idle: 'ben_stand',
      crouchLeft: 'ben_crouch_w',
      crouchRight: 'ben_crouch_e',
    })
    expect(profile.anims).toMatchObject({
      walkDown: { row: 0, count: 4 },
      walkLeft: { row: 0, count: 4 },
      walkRight: { row: 0, count: 4 },
      walkUp: { row: 0, count: 4 },
      idle: { row: 0, count: 8 },
      crouchLeft: { row: 0, count: 5 },
      crouchRight: { row: 0, count: 5 },
    })
  })

  it('camille and manu have crouch animations', () => {
    for (const type of ['camille', 'manu'] as const) {
      const profile = profileForType(type)
      expect(profile.anims.crouchLeft).toBeDefined()
      expect(profile.anims.crouchRight).toBeDefined()
      expect(profile.directionalKeys?.crouchLeft).toBeDefined()
      expect(profile.directionalKeys?.crouchRight).toBeDefined()
    }
  })

  it('kish does not have crouch animations', () => {
    const profile = profileForType('kish')
    expect(profile.anims.crouchLeft).toBeUndefined()
    expect(profile.anims.crouchRight).toBeUndefined()
  })

  it('profiles with directionalKeys have the required direction textures', () => {
    const types = ['dogwalker', 'feeder', 'ben', 'camille', 'manu', 'kish'] as const
    for (const type of types) {
      const profile = profileForType(type)
      expect(profile.directionalKeys).toBeDefined()
      const dk = profile.directionalKeys!
      expect(typeof dk.walkDown).toBe('string')
      expect(typeof dk.walkLeft).toBe('string')
      expect(typeof dk.walkRight).toBe('string')
      expect(typeof dk.walkUp).toBe('string')
    }
  })

  it('jogger uses row-based (no directionalKeys)', () => {
    const profile = profileForType('jogger')
    expect(profile.directionalKeys).toBeUndefined()
  })
})

describe('createSpriteProfileAnimations', () => {
  it('row-based (jogger): registers walk + idle keys and row-derived frame ranges', () => {
    const { scene, store } = buildAnimScene()
    const profile = profileForType('jogger')
    createSpriteProfileAnimations(scene, profile)

    const cols = profile.cols
    const a = profile.anims

    expect(new Set(store.keys())).toEqual(
      new Set([
        'jogger-walk-down',
        'jogger-walk-left',
        'jogger-walk-right',
        'jogger-walk-up',
        'jogger-idle',
      ]),
    )

    expect(store.get('jogger-walk-down')?.frames).toEqual(framesForRow('jogger', a.walkDown.row, cols, a.walkDown.count))
    expect(store.get('jogger-walk-left')?.frames).toEqual(framesForRow('jogger', a.walkLeft.row, cols, a.walkLeft.count))
    expect(store.get('jogger-walk-right')?.frames).toEqual(framesForRow('jogger', a.walkRight.row, cols, a.walkRight.count))
    expect(store.get('jogger-walk-up')?.frames).toEqual(framesForRow('jogger', a.walkUp.row, cols, a.walkUp.count))
    expect(store.get('jogger-idle')?.frames).toEqual(framesForRow('jogger', a.idle.row, cols, a.idle.count))

    for (const k of ['jogger-walk-down', 'jogger-walk-left', 'jogger-walk-right', 'jogger-walk-up'] as const) {
      expect(store.get(k)?.frameRate).toBe(6)
      expect(store.get(k)?.repeat).toBe(-1)
    }
    expect(store.get('jogger-idle')?.frameRate).toBe(3)
    expect(store.get('jogger-idle')?.repeat).toBe(-1)
  })

  it('directional (dogwalker): registers keys per directionalKeys and idle', () => {
    const { scene, store } = buildAnimScene()
    const profile = profileForType('dogwalker')
    const dk = profile.directionalKeys!
    createSpriteProfileAnimations(scene, profile)

    expect(new Set(store.keys())).toEqual(
      new Set([
        'dogwalker-walk-down',
        'dogwalker-walk-left',
        'dogwalker-walk-right',
        'dogwalker-walk-up',
        'dogwalker-idle',
      ]),
    )

    const walkFrames = (tex: string, count: number) =>
      Array.from({ length: count }, (_, i) => ({ key: tex, frame: i }))

    expect(store.get('dogwalker-walk-down')?.frames).toEqual(walkFrames(dk.walkDown, profile.anims.walkDown.count))
    expect(store.get('dogwalker-walk-left')?.frames).toEqual(walkFrames(dk.walkLeft, profile.anims.walkLeft.count))
    expect(store.get('dogwalker-walk-right')?.frames).toEqual(walkFrames(dk.walkRight, profile.anims.walkRight.count))
    expect(store.get('dogwalker-walk-up')?.frames).toEqual(walkFrames(dk.walkUp, profile.anims.walkUp.count))

    const idleTex = dk.idle ?? dk.walkDown
    expect(store.get('dogwalker-idle')?.frames).toEqual(walkFrames(idleTex, profile.anims.idle.count))
  })

  it('directional (camille): idle uses dedicated idle texture when set', () => {
    const { scene, store } = buildAnimScene()
    const profile = profileForType('camille')
    createSpriteProfileAnimations(scene, profile)

    expect(store.get('camille-idle')?.frames[0]?.key).toBe('cam_stand')
    expect(store.get('camille-idle')?.frames).toEqual([{ key: 'cam_stand', frame: 0 }])
    expect(store.get('camille-walk-down')?.frames[0]?.key).toBe('cam_walk_s')
  })

  it('directional (camille): registers crouch anims when keys and counts exist', () => {
    const { scene, store } = buildAnimScene()
    const profile = profileForType('camille')
    createSpriteProfileAnimations(scene, profile)

    expect(store.has('camille-crouch-left')).toBe(true)
    expect(store.has('camille-crouch-right')).toBe(true)
    expect(store.get('camille-crouch-left')?.repeat).toBe(0)
    expect(store.get('camille-crouch-right')?.repeat).toBe(0)
  })

  it('directional (ben): registers dedicated walk, idle, and crouch frame ranges', () => {
    const { scene, store } = buildAnimScene()
    const profile = profileForType('ben')
    createSpriteProfileAnimations(scene, profile)

    const walkFrames = (tex: string, count: number) =>
      Array.from({ length: count }, (_, i) => ({ key: tex, frame: i }))

    expect(store.get('ben-walk-down')?.frames).toEqual(walkFrames('ben_walk_s', 4))
    expect(store.get('ben-walk-left')?.frames).toEqual(walkFrames('ben_walk_w', 4))
    expect(store.get('ben-walk-right')?.frames).toEqual(walkFrames('ben_walk_e', 4))
    expect(store.get('ben-walk-up')?.frames).toEqual(walkFrames('ben_walk_n', 4))
    expect(store.get('ben-idle')?.frames).toEqual(walkFrames('ben_stand', 8))
    expect(store.get('ben-crouch-left')?.frames).toEqual(walkFrames('ben_crouch_w', 5))
    expect(store.get('ben-crouch-right')?.frames).toEqual(walkFrames('ben_crouch_e', 5))
    expect(store.get('ben-crouch-left')?.repeat).toBe(0)
    expect(store.get('ben-crouch-right')?.repeat).toBe(0)
  })

  it('duplicate call: early exit when idle exists; no extra creates or generateFrameNumbers', () => {
    const { scene, store, generateFrameNumbers } = buildAnimScene()
    const profile = profileForType('jogger')

    expect(scene.anims.exists('jogger-idle')).toBe(false)
    createSpriteProfileAnimations(scene, profile)
    expect(scene.anims.exists('jogger-idle')).toBe(true)

    const keysAfterFirst = [...store.keys()].sort()
    const genCallsAfterFirst = generateFrameNumbers.mock.calls.length

    createSpriteProfileAnimations(scene, profile)

    expect(scene.anims.exists('jogger-idle')).toBe(true)
    expect([...store.keys()].sort()).toEqual(keysAfterFirst)
    expect(generateFrameNumbers.mock.calls.length).toBe(genCallsAfterFirst)
    expect(store.get('jogger-walk-down')?.frames).toEqual(framesForRow('jogger', profile.anims.walkDown.row, profile.cols, profile.anims.walkDown.count))
  })
})
