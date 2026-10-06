/**
 * Invariants for the ambient crowd role table: anonymous art only, every role
 * can actually move with the look it may wear, and night stays nearly empty.
 */
import { describe, it, expect } from 'vitest'
import bootSceneSource from '../../src/scenes/BootScene.ts?raw'
import girlPng from '../../public/assets/sprites/girl.png?inline'
import fedoraPng from '../../public/assets/sprites/dogwalker.png?inline'
import {
  ANCHOR_SEATS,
  CROWD_ANIMS,
  CROWD_LOOKS,
  CROWD_ROLES,
  CROWD_TEXTURES,
  type CrowdLook,
} from '../../src/data/ambient-roles'

/** Named characters and villains whose art the crowd must never wear. */
const FORBIDDEN = /feeder|ben_|^ben|cam_|camille|manu|kish|snatcher|guard/i

const textureKeys = (look: CrowdLook): string[] =>
  [
    ...Object.values(look.face).map(([tex]) => tex),
    ...(look.sitFrame ? [look.sitFrame[0]] : []),
    ...(look.groundSitFrame ? [look.groundSitFrame[0]] : []),
  ]

const animKeys = (look: CrowdLook): string[] =>
  [
    ...Object.values(look.walk ?? {}),
    ...Object.values(look.run ?? {}),
    look.idleAnim,
    look.phoneWalkAnim,
    look.selfieAnim,
  ].filter((k): k is string => typeof k === 'string')

/** PNG width/height from the IHDR chunk of a base64 data URL. */
const pngSize = (dataUrl: string): { w: number; h: number } => {
  const bytes = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const u32 = (at: number) => [0, 1, 2, 3].reduce((n, i) => n * 256 + bytes.charCodeAt(at + i), 0)
  return { w: u32(16), h: u32(20) }
}

describe('crowd looks', () => {
  it('use only whitelisted anonymous textures', () => {
    for (const [id, look] of Object.entries(CROWD_LOOKS)) {
      for (const tex of textureKeys(look)) {
        expect(CROWD_TEXTURES, `${id}: ${tex}`).toContain(tex)
        expect(tex, id).not.toMatch(FORBIDDEN)
      }
    }
  })

  it('only play anonymous animations', () => {
    const own = new Set(CROWD_ANIMS.map((a) => a.key))
    for (const [id, look] of Object.entries(CROWD_LOOKS)) {
      for (const key of animKeys(look)) {
        expect(key, id).not.toMatch(FORBIDDEN)
        const fromProfiles = /^(dogwalker|jogger|jogger_male)-walk-(down|left|right|up)$/.test(key)
        expect(own.has(key) || fromProfiles, `${id}: ${key}`).toBe(true)
      }
    }
    for (const a of CROWD_ANIMS) expect(CROWD_TEXTURES).toContain(a.texture)
  })

  it('slice the new sheets on their real grids', () => {
    expect(pngSize(girlPng)).toEqual({ w: 8 * 150, h: 6 * 85 })
    expect(pngSize(fedoraPng)).toEqual({ w: 14 * 25, h: 3 * 45 })
    const frameCount: Record<string, number> = { crowd_girl: 48, crowd_fedora: 42 }
    for (const a of CROWD_ANIMS) {
      for (const f of a.frames) expect(f).toBeLessThan(frameCount[a.texture] ?? 0)
    }
    // girl.png row 3 has only 6 phone-walk frames; row 5 only 2 sitting frames.
    expect(CROWD_ANIMS.find((a) => a.key === 'crowd-girl-phonewalk')?.frames).toEqual([24, 25, 26, 27, 28, 29])
    expect(CROWD_LOOKS.pinkGirl.sitFrame?.[1]).toBe(41)
    expect(CROWD_LOOKS.pinkGirl.groundSitFrame?.[1]).toBe(40)
  })

  it('keep the seated crop inside the frame', () => {
    for (const look of Object.values(CROWD_LOOKS)) {
      expect(look.seatCropY).toBeGreaterThan(0)
      expect(look.seatCropY).toBeLessThan(look.originY * look.frameH)
    }
  })

  it('are loaded by BootScene under new keys at the verified frame sizes', () => {
    expect(bootSceneSource).toMatch(/"crowd_girl", "assets\/sprites\/girl\.png", \{\s*frameWidth: 150,\s*frameHeight: 85/)
    expect(bootSceneSource).toMatch(
      /"crowd_fedora", "assets\/sprites\/dogwalker\.png", \{\s*frameWidth: 25,\s*frameHeight: 45/,
    )
    // The legacy key keeps its old slicing.
    expect(bootSceneSource).toMatch(/"dogwalker", "assets\/sprites\/dogwalker\.png", \{\s*frameWidth: 50,\s*frameHeight: 45/)
  })
})

describe('crowd roles', () => {
  it('have unique ids', () => {
    expect(new Set(CROWD_ROLES.map((r) => r.id)).size).toBe(CROWD_ROLES.length)
  })

  it('only wear looks that have art for their gait', () => {
    for (const role of CROWD_ROLES) {
      expect(role.looks.length, role.id).toBeGreaterThan(0)
      for (const id of role.looks) {
        const look = CROWD_LOOKS[id]
        expect(role.gait === 'run' ? look.run : look.walk, `${role.id} as ${id}`).toBeDefined()
      }
    }
  })

  it('declare what anchored and strolling roles need', () => {
    for (const role of CROWD_ROLES) {
      if (role.motion === 'anchored') {
        expect(role.anchor && ANCHOR_SEATS[role.anchor].length, role.id).toBeGreaterThan(0)
        expect(role.pose, role.id).toBeDefined()
        expect(role.dwellMs?.[0], role.id).toBeGreaterThan(0)
        expect(role.dwellMs![1]).toBeGreaterThanOrEqual(role.dwellMs![0])
      } else {
        expect(role.stops?.[0], role.id).toBeGreaterThanOrEqual(1)
      }
      expect(role.speed[0]).toBeGreaterThan(0)
      expect(role.speed[1]).toBeGreaterThanOrEqual(role.speed[0])
    }
  })

  it('keep the park nearly empty at night so snatchers stay scary', () => {
    const night = CROWD_ROLES.reduce((sum, r) => sum + r.population.night, 0)
    expect(night).toBeLessThanOrEqual(4)
    for (const r of CROWD_ROLES) {
      if (r.motion === 'anchored' && r.anchor !== 'smoking') expect(r.population.night, r.id).toBe(0)
    }
  })

  it('crowd benches, picnics and tables at lunch', () => {
    const at = (slot: 'day' | 'lunch', anchors: string[]) =>
      CROWD_ROLES.filter((r) => r.anchor && anchors.includes(r.anchor)).reduce((s, r) => s + r.population[slot], 0)
    expect(at('lunch', ['bench', 'picnic', 'dining'])).toBeGreaterThan(at('day', ['bench', 'picnic', 'dining']))
  })
})
