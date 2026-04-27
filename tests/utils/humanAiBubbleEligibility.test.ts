import { describe, expect, it } from 'vitest'
import { shouldUseHumanAiBubble } from '../../src/utils/humanAiBubbleEligibility'

const eligibleInput = {
  hasPersona: true,
  aiServiceAvailable: true,
  aiInFlight: false,
  now: 1_000,
  cooldownUntil: 0,
  isMammaCatGreeting: true,
  distanceToMammaCat: 40,
  maxMammaCatDistance: 50,
}

describe('shouldUseHumanAiBubble', () => {
  it('allows AI only for close Mamma Cat greetings', () => {
    expect(shouldUseHumanAiBubble(eligibleInput)).toBe(true)
  })

  it('blocks AI for greetings aimed at another NPC cat', () => {
    expect(shouldUseHumanAiBubble({
      ...eligibleInput,
      isMammaCatGreeting: false,
    })).toBe(false)
  })

  it('blocks AI when the human is no longer close to Mamma Cat', () => {
    expect(shouldUseHumanAiBubble({
      ...eligibleInput,
      distanceToMammaCat: 51,
    })).toBe(false)
  })

  it('blocks AI while another human bubble request is in flight', () => {
    expect(shouldUseHumanAiBubble({
      ...eligibleInput,
      aiInFlight: true,
    })).toBe(false)
  })
})
