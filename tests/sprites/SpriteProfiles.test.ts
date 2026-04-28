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

describe('profileForType', () => {
  const expectedKeys: Record<string, string> = {
    jogger: 'jogger',
    jogger_male: 'jogger_male',
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
    const types = ['jogger', 'jogger_male', 'feeder', 'ben', 'dogwalker', 'camille', 'manu', 'kish'] as const
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

  it('female jogger uses dedicated stand and directional run sheets', () => {
    const profile = profileForType('jogger')
    expect(profile.key).toBe('jogger')
    expect(profile.cols).toBe(8)
    expect(profile.frameW).toBe(68)
    expect(profile.frameH).toBe(68)
    expect(profile.scale).toBe(0.7)
    expect(profile.directionalKeys).toMatchObject({
      walkDown: 'jogger_run_s',
      walkLeft: 'jogger_run_w',
      walkRight: 'jogger_run_e',
      walkUp: 'jogger_run_n',
      idle: 'jogger_stand',
    })
    expect(profile.anims).toMatchObject({
      walkDown: { row: 0, count: 8 },
      walkLeft: { row: 0, count: 8 },
      walkRight: { row: 0, count: 8 },
      walkUp: { row: 0, count: 8 },
      idle: { row: 0, count: 8 },
    })
  })

  it('male jogger keeps using the male jogger directional sheets', () => {
    const profile = profileForType('jogger_male')
    expect(profile.key).toBe('jogger_male')
    expect(profile.frameW).toBe(48)
    expect(profile.frameH).toBe(48)
    expect(profile.directionalKeys).toMatchObject({
      walkDown: 'mjog_run_s',
      walkLeft: 'mjog_run_w',
      walkRight: 'mjog_run_e',
      walkUp: 'mjog_run_n',
      idle: 'mjog_stand',
    })
  })

  it('profiles with directionalKeys have the required direction textures', () => {
    const types = ['jogger', 'jogger_male', 'dogwalker', 'feeder', 'ben', 'camille', 'manu', 'kish'] as const
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

  it('legacy row-based jogger sheet is no longer used by HumanType jogger', () => {
    expect(profileForType('jogger').directionalKeys).toBeDefined()
  })
})

describe('createSpriteProfileAnimations', () => {
  it('directional (female jogger): registers new run and idle sheet frame ranges', () => {
    const { scene, store } = buildAnimScene()
    const profile = profileForType('jogger')
    createSpriteProfileAnimations(scene, profile)

    expect(new Set(store.keys())).toEqual(
      new Set([
        'jogger-walk-down',
        'jogger-walk-left',
        'jogger-walk-right',
        'jogger-walk-up',
        'jogger-idle',
      ]),
    )

    const walkFrames = (tex: string, count: number) =>
      Array.from({ length: count }, (_, i) => ({ key: tex, frame: i }))

    expect(store.get('jogger-walk-down')?.frames).toEqual(walkFrames('jogger_run_s', 8))
    expect(store.get('jogger-walk-left')?.frames).toEqual(walkFrames('jogger_run_w', 8))
    expect(store.get('jogger-walk-right')?.frames).toEqual(walkFrames('jogger_run_e', 8))
    expect(store.get('jogger-walk-up')?.frames).toEqual(walkFrames('jogger_run_n', 8))
    expect(store.get('jogger-idle')?.frames).toEqual(walkFrames('jogger_stand', 8))

    for (const k of ['jogger-walk-down', 'jogger-walk-left', 'jogger-walk-right', 'jogger-walk-up'] as const) {
      expect(store.get(k)?.frameRate).toBe(6)
      expect(store.get(k)?.repeat).toBe(-1)
    }
    expect(store.get('jogger-idle')?.frameRate).toBe(3)
    expect(store.get('jogger-idle')?.repeat).toBe(-1)
  })

  it('directional (male jogger): keeps registering male jogger texture keys', () => {
    const { scene, store } = buildAnimScene()
    const profile = profileForType('jogger_male')
    createSpriteProfileAnimations(scene, profile)

    const walkFrames = (tex: string, count: number) =>
      Array.from({ length: count }, (_, i) => ({ key: tex, frame: i }))

    expect(store.get('jogger_male-walk-down')?.frames).toEqual(walkFrames('mjog_run_s', 8))
    expect(store.get('jogger_male-walk-left')?.frames).toEqual(walkFrames('mjog_run_w', 8))
    expect(store.get('jogger_male-walk-right')?.frames).toEqual(walkFrames('mjog_run_e', 8))
    expect(store.get('jogger_male-walk-up')?.frames).toEqual(walkFrames('mjog_run_n', 8))
    expect(store.get('jogger_male-idle')?.frames).toEqual(walkFrames('mjog_stand', 8))
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
    expect(store.get('jogger-walk-down')?.frames).toEqual(
      Array.from({ length: profile.anims.walkDown.count }, (_, i) => ({
        key: 'jogger_run_s',
        frame: i,
      })),
    )
  })
})
