import { describe, it, expect } from 'vitest'
import { CAT_DIALOGUE_SCRIPTS } from '../../src/data/cat-dialogue'
import type { DialogueRequest } from '../../src/services/DialogueService'

/**
 * The isFirstMeeting and talkCount helpers are module-private,
 * so we test them indirectly through the exported dialogue scripts.
 */

function makeRequest(overrides: Partial<DialogueRequest> & { speaker: string }): DialogueRequest {
  return {
    speakerType: 'cat',
    target: 'player',
    gameState: {
      chapter: 1,
      timeOfDay: 'day',
      trustGlobal: 0,
      trustWithSpeaker: 0,
      hunger: 80,
      thirst: 80,
      energy: 80,
      daysSurvived: 1,
      knownCats: [],
      recentEvents: [],
    },
    conversationHistory: [],
    ...overrides,
  }
}

describe('cat-dialogue — isFirstMeeting (via script conditions)', () => {
  const namedCats = ['Blacky', 'Tiger', 'Jayco', 'Jayco Jr', 'Fluffy', 'Pedigree', 'Ginger', 'Ginger B']

  for (const cat of namedCats) {
    it(`${cat}: first script matches when no history and trust < 5`, () => {
      const req = makeRequest({ speaker: cat })
      const scripts = CAT_DIALOGUE_SCRIPTS[cat]!
      const match = scripts.find(s => s.condition(req))
      expect(match).toBeDefined()
      expect(match!.id).toBe(`${cat.toLowerCase().replace(/\s/g, '')}_first`)
      expect(match!.response.event).toContain('first')
    })
  }

  it('Blacky: returns return dialogue when history exists', () => {
    const req = makeRequest({
      speaker: 'Blacky',
      conversationHistory: [{ timestamp: 1, speaker: 'Blacky', text: 'hi' }],
    })
    const scripts = CAT_DIALOGUE_SCRIPTS['Blacky']!
    const match = scripts.find(s => s.condition(req))
    expect(match).toBeDefined()
    expect(match!.id).toBe('blacky_return')
    expect(match!.response.event).toBe('blacky_return')
  })

  it('Blacky: still returns first dialogue when trust >= 5 but no history exists', () => {
    const req = makeRequest({
      speaker: 'Blacky',
      gameState: {
        chapter: 1, timeOfDay: 'day', trustGlobal: 10, trustWithSpeaker: 5,
        hunger: 80, thirst: 80, energy: 80, daysSurvived: 1, knownCats: [], recentEvents: [],
      },
    })
    const scripts = CAT_DIALOGUE_SCRIPTS['Blacky']!
    const match = scripts.find(s => s.condition(req))
    expect(match!.id).toBe('blacky_first')
    expect(match!.response.event).toBe('blacky_first')
  })
})

describe('cat-dialogue — talkCount (via Tiger scripts)', () => {
  it('Tiger: second talk (talkCount === 1) triggers warmup', () => {
    const req = makeRequest({
      speaker: 'Tiger',
      conversationHistory: [{ timestamp: 1, speaker: 'Tiger', text: 'hi' }],
    })
    const scripts = CAT_DIALOGUE_SCRIPTS['Tiger']!
    const match = scripts.find(s => s.condition(req))
    expect(match!.id).toBe('tiger_warmup')
    expect(match!.response.event).toBe('tiger_warmup')
  })

  it('Tiger: no-history interaction remains first contact even if proximity trust exists', () => {
    const req = makeRequest({
      speaker: 'Tiger',
      gameState: {
        chapter: 1, timeOfDay: 'day', trustGlobal: 10, trustWithSpeaker: 10,
        hunger: 80, thirst: 80, energy: 80, daysSurvived: 1, knownCats: [], recentEvents: [],
      },
    })
    const scripts = CAT_DIALOGUE_SCRIPTS['Tiger']!
    const match = scripts.find(s => s.condition(req))
    expect(match!.id).toBe('tiger_first')
    expect(match!.response.event).toBe('tiger_first')
  })

  it('Tiger: third+ talk (talkCount > 1) returns general', () => {
    const req = makeRequest({
      speaker: 'Tiger',
      conversationHistory: [
        { timestamp: 1, speaker: 'Tiger', text: 'hi' },
        { timestamp: 2, speaker: 'Tiger', text: 'hey' },
      ],
    })
    const scripts = CAT_DIALOGUE_SCRIPTS['Tiger']!
    const match = scripts.find(s => s.condition(req))
    expect(match!.id).toBe('tiger_return')
    expect(match!.response.event).toBe('tiger_return')
  })
})

describe('cat-dialogue — trust-gated scripts', () => {
  it('Fluffy: requires trust >= 20 for second dialogue', () => {
    const lowTrust = makeRequest({
      speaker: 'Fluffy',
      conversationHistory: [{ timestamp: 1, speaker: 'Fluffy', text: 'hi' }],
      gameState: {
        chapter: 1, timeOfDay: 'day', trustGlobal: 10, trustWithSpeaker: 10,
        hunger: 80, thirst: 80, energy: 80, daysSurvived: 1, knownCats: [], recentEvents: [],
      },
    })
    const scripts = CAT_DIALOGUE_SCRIPTS['Fluffy']!
    const match = scripts.find(s => s.condition(lowTrust))
    expect(match!.id).toBe('fluffy_cautious_return')
    expect(match!.response.event).toBe('fluffy_return')
    expect(match!.response.speakerPose).toBe('wary')
  })

  it('Fluffy: unlocks trust-gated dialogue at trust >= 20', () => {
    const highTrust = makeRequest({
      speaker: 'Fluffy',
      conversationHistory: [{ timestamp: 1, speaker: 'Fluffy', text: 'hi' }],
      gameState: {
        chapter: 1, timeOfDay: 'day', trustGlobal: 20, trustWithSpeaker: 20,
        hunger: 80, thirst: 80, energy: 80, daysSurvived: 1, knownCats: [], recentEvents: [],
      },
    })
    const scripts = CAT_DIALOGUE_SCRIPTS['Fluffy']!
    const match = scripts.find(s => s.condition(highTrust))
    expect(match!.id).toBe('fluffy_trust_return')
    expect(match!.response.event).toBe('fluffy_return')
    expect(match!.response.speakerPose).toBe('curious')
  })

  it('Ginger: requires trust >= 30 for friendly response', () => {
    const highTrust = makeRequest({
      speaker: 'Ginger',
      conversationHistory: [{ timestamp: 1, speaker: 'Ginger', text: 'hi' }],
      gameState: {
        chapter: 1, timeOfDay: 'day', trustGlobal: 30, trustWithSpeaker: 30,
        hunger: 80, thirst: 80, energy: 80, daysSurvived: 1, knownCats: [], recentEvents: [],
      },
    })
    const scripts = CAT_DIALOGUE_SCRIPTS['Ginger']!
    const match = scripts.find(s => s.condition(highTrust))
    expect(match!.id).toBe('ginger_trust_return')
    expect(match!.response.event).toBe('ginger_return')
    expect(match!.response.speakerPose).toBe('wary')
  })

  it('Ginger: hissing fallback only remains eligible while trust is low', () => {
    const lowTrust = makeRequest({
      speaker: 'Ginger',
      conversationHistory: [{ timestamp: 1, speaker: 'Ginger', text: 'hi' }],
      gameState: {
        chapter: 1, timeOfDay: 'day', trustGlobal: 10, trustWithSpeaker: 10,
        hunger: 80, thirst: 80, energy: 80, daysSurvived: 1, knownCats: [], recentEvents: [],
      },
    })
    const highTrust = makeRequest({
      speaker: 'Ginger',
      conversationHistory: [{ timestamp: 1, speaker: 'Ginger', text: 'hi' }],
      gameState: {
        chapter: 1, timeOfDay: 'day', trustGlobal: 30, trustWithSpeaker: 30,
        hunger: 80, thirst: 80, energy: 80, daysSurvived: 1, knownCats: [], recentEvents: [],
      },
    })
    const scripts = CAT_DIALOGUE_SCRIPTS['Ginger']!

    expect(scripts.find(s => s.condition(lowTrust))!.id).toBe('ginger_hostile_return')
    expect(scripts.find(s => s.id === 'ginger_hostile_return')!.condition(highTrust)).toBe(false)
  })
})

describe('cat-dialogue — Colony Cat', () => {
  it('Colony Cat always has a matching script', () => {
    const req = makeRequest({ speaker: 'Colony Cat' })
    const scripts = CAT_DIALOGUE_SCRIPTS['Colony Cat']!
    const match = scripts.find(s => s.condition(req))
    expect(match).toBeDefined()
    expect(match!.id).toBe('colony_cat_default')
    expect(match!.response.lines.length).toBe(1)
  })
})

describe('cat-dialogue — all named cats have scripts', () => {
  const expected = ['Blacky', 'Tiger', 'Jayco', 'Jayco Jr', 'Fluffy', 'Pedigree', 'Ginger', 'Ginger B', 'Colony Cat']

  for (const name of expected) {
    it(`has scripts for ${name}`, () => {
      expect(CAT_DIALOGUE_SCRIPTS[name]).toBeDefined()
      expect(CAT_DIALOGUE_SCRIPTS[name]!.length).toBeGreaterThan(0)
    })
  }

  it('every scripted dialogue entry has a unique stable id', () => {
    const ids = Object.values(CAT_DIALOGUE_SCRIPTS).flatMap(scripts => scripts.map(script => script.id))

    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
