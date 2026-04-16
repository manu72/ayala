import { describe, it, expect } from 'vitest'

/**
 * profileForType and the profile constants are pure data + a switch statement.
 * However, the module imports from BaseNPC which imports Phaser.
 * To avoid pulling in Phaser at test time, we re-test the switch logic
 * by importing the module (Vitest handles the dead-code Phaser import)
 * or by testing against the known profile keys.
 *
 * If the Phaser import causes issues, we can mock it. For now,
 * we test the function contract through a dynamic import with a vi.mock.
 */
import { vi } from 'vitest'

// Mock Phaser to avoid loading the full game engine in tests
vi.mock('phaser', () => ({
  default: {
    Physics: { Arcade: { Sprite: class {} } },
  },
}))

// Now safe to import after mock
const { profileForType, GUARD_PROFILE } = await import('../../src/sprites/SpriteProfiles')

describe('profileForType', () => {
  const expectedKeys: Record<string, string> = {
    jogger: 'jogger',
    feeder: 'feeder',
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

  it('returns GUARD_PROFILE as default for unknown type', () => {
    const profile = profileForType('unknown' as Parameters<typeof profileForType>[0])
    expect(profile).toBe(GUARD_PROFILE)
    expect(profile.key).toBe('guard')
  })

  it('all profiles have required shape fields', () => {
    const types = ['jogger', 'feeder', 'dogwalker', 'camille', 'manu', 'kish'] as const
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
    const types = ['dogwalker', 'feeder', 'camille', 'manu', 'kish'] as const
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
