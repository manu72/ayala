import { describe, expect, it } from "vitest";
import { HUMAN_DIALOGUE_SCRIPTS } from "../../src/data/human-dialogue";
import { findUnplayedDialogueScript } from "../../src/services/DialogueService";
import type { DialogueRequest } from "../../src/services/DialogueService";

function makeRequest(overrides: Partial<DialogueRequest> & { speaker: string }): DialogueRequest {
  return {
    speakerType: "human",
    target: "Mamma Cat",
    gameState: {
      chapter: 5,
      timeOfDay: "evening",
      trustGlobal: 40,
      trustWithSpeaker: 40,
      hunger: 80,
      thirst: 80,
      energy: 80,
      daysSurvived: 4,
      knownCats: [],
      recentEvents: [],
    },
    conversationHistory: [],
    ...overrides,
  };
}

describe("human-dialogue", () => {
  const namedHumans = ["Camille", "Manu", "Kish", "Rose", "Ben"];

  for (const human of namedHumans) {
    it(`has first and return scripts for ${human}`, () => {
      expect(HUMAN_DIALOGUE_SCRIPTS[human]?.map((script) => script.id)).toEqual([
        `${human.toLowerCase()}_first`,
        `${human.toLowerCase()}_return`,
      ]);
    });
  }

  it("uses Camille first script before AI history exists", () => {
    const match = findUnplayedDialogueScript(HUMAN_DIALOGUE_SCRIPTS, makeRequest({ speaker: "Camille" }));

    expect(match?.id).toBe("camille_first");
  });

  it("uses a named human return script once and then exhausts authored scripts", () => {
    const firstSeen = makeRequest({
      speaker: "Rose",
      conversationHistory: [{ timestamp: 1, speaker: "Rose", text: "Hello, sweetie. Food is here." }],
    });
    const returnMatch = findUnplayedDialogueScript(HUMAN_DIALOGUE_SCRIPTS, firstSeen);
    expect(returnMatch?.id).toBe("rose_return");

    const bothSeen = makeRequest({
      speaker: "Rose",
      conversationHistory: [
        { timestamp: 1, speaker: "Rose", text: "Hello, sweetie. Food is here." },
        { timestamp: 2, speaker: "Rose", text: "Come eat when you're ready." },
      ],
    });
    expect(findUnplayedDialogueScript(HUMAN_DIALOGUE_SCRIPTS, bothSeen)).toBeNull();
  });
});
