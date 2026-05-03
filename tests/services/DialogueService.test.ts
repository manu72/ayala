import { describe, it, expect } from 'vitest'
import { ScriptedDialogueService } from '../../src/services/DialogueService'
import type { DialogueRequest, DialogueScript, DialogueResponse } from '../../src/services/DialogueService'

function makeRequest(overrides: Partial<DialogueRequest> = {}): DialogueRequest {
  return {
    speaker: 'TestCat',
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

const firstMeetResponse: DialogueResponse = {
  lines: ['Hello, newcomer!'],
  emote: 'curious',
  trustChange: 10,
  event: 'test_first',
}

const returnResponse: DialogueResponse = {
  lines: ['Welcome back.'],
  emote: 'heart',
  trustChange: 5,
}

const testScripts: Record<string, DialogueScript[]> = {
  TestCat: [
    {
      id: 'test_first',
      condition: (req) => req.conversationHistory.length === 0,
      response: firstMeetResponse,
    },
    {
      id: 'test_return',
      condition: () => true,
      response: returnResponse,
    },
  ],
}

describe('ScriptedDialogueService', () => {
  it('returns first matching script response', async () => {
    const svc = new ScriptedDialogueService(testScripts)
    const result = await svc.getDialogue(makeRequest())
    expect(result).toEqual(firstMeetResponse)
  })

  it('falls through to next matching condition', async () => {
    const svc = new ScriptedDialogueService(testScripts)
    const req = makeRequest({
      conversationHistory: [{ timestamp: 1, speaker: 'TestCat', text: 'hi' }],
    })
    const result = await svc.getDialogue(req)
    expect(result).toEqual(returnResponse)
  })

  it('returns default cat response for unknown speaker', async () => {
    const svc = new ScriptedDialogueService(testScripts)
    const req = makeRequest({ speaker: 'UnknownCat' })
    const result = await svc.getDialogue(req)
    expect(result.lines).toEqual(['*The cat regards you warily.*'])
  })

  it('returns default human response for human type', async () => {
    const svc = new ScriptedDialogueService(testScripts)
    const req = makeRequest({ speaker: 'UnknownHuman', speakerType: 'human' })
    const result = await svc.getDialogue(req)
    expect(result.lines).toEqual(['...'])
  })

  it('returns default when no conditions match', async () => {
    const neverMatchScripts: Record<string, DialogueScript[]> = {
      TestCat: [{ id: 'test_never', condition: () => false, response: firstMeetResponse }],
    }
    const svc = new ScriptedDialogueService(neverMatchScripts)
    const result = await svc.getDialogue(makeRequest())
    expect(result.lines).toEqual(['*The cat regards you warily.*'])
  })

  it('evaluates conditions in order (first match wins)', async () => {
    const earlyResponse: DialogueResponse = { lines: ['I matched first!'] }
    const lateResponse: DialogueResponse = { lines: ['I matched second.'] }
    const ordered: Record<string, DialogueScript[]> = {
      TestCat: [
        { id: 'test_early', condition: () => true, response: earlyResponse },
        { id: 'test_late', condition: () => true, response: lateResponse },
      ],
    }
    const svc = new ScriptedDialogueService(ordered)
    const result = await svc.getDialogue(makeRequest())
    expect(result).toEqual(earlyResponse)
  })

  it('returns an unplayed matching script before repeated fallback dialogue', async () => {
    const svc = new ScriptedDialogueService({
      TestCat: [
        {
          id: 'test_first',
          condition: (req) => req.conversationHistory.length === 0,
          response: { lines: ['First scripted line.'] },
        },
        {
          id: 'test_trust',
          condition: (req) => req.gameState.trustWithSpeaker >= 20,
          response: { lines: ['Trust scripted line.'] },
        },
        {
          id: 'test_cautious',
          condition: (req) => req.gameState.trustWithSpeaker < 20,
          response: { lines: ['Cautious scripted line.'] },
        },
      ],
    })
    const req = makeRequest({
      gameState: {
        chapter: 1,
        timeOfDay: 'day',
        trustGlobal: 20,
        trustWithSpeaker: 20,
        hunger: 80,
        thirst: 80,
        energy: 80,
        daysSurvived: 1,
        knownCats: [],
        recentEvents: [],
      },
      conversationHistory: [
        { timestamp: 1, speaker: 'TestCat', text: 'First scripted line.' },
        { timestamp: 2, speaker: 'TestCat', text: 'AI line after scripts started.' },
      ],
    })

    const result = await svc.getUnplayedDialogue(req)

    expect(result?.lines).toEqual(['Trust scripted line.'])
  })

  it('does not replay a matching script once its rendered text is in history', async () => {
    const svc = new ScriptedDialogueService(testScripts)
    const req = makeRequest({
      conversationHistory: [{ timestamp: 1, speaker: 'TestCat', text: 'Welcome back.' }],
    })

    const result = await svc.getUnplayedDialogue(req)

    expect(result).toBeNull()
  })
})
