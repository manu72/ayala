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
    expect(match?.response.lines).toEqual(["And who are you, sweetheart?"]);
  });

  it("Camille's return line promises nothing she doesn't give", () => {
    const camilleReturn = HUMAN_DIALOGUE_SCRIPTS["Camille"]?.find((script) => script.id === "camille_return");
    expect(camilleReturn?.response.lines).toEqual(["There you are. I hoped you'd come."]);
  });

  it("uses a named human return script once, on a later game day, and then exhausts authored scripts", () => {
    const firstSeen = { timestamp: 1, gameDay: 3, speaker: "Rose", text: "Hello, sweetie. Food is here." };
    const sameVisit = makeRequest({ speaker: "Rose", conversationHistory: [firstSeen] });
    sameVisit.gameState.daysSurvived = 3;
    expect(findUnplayedDialogueScript(HUMAN_DIALOGUE_SCRIPTS, sameVisit)).toBeNull();

    const nextDay = makeRequest({ speaker: "Rose", conversationHistory: [firstSeen] });
    expect(findUnplayedDialogueScript(HUMAN_DIALOGUE_SCRIPTS, nextDay)?.id).toBe("rose_return");

    const bothSeen = makeRequest({
      speaker: "Rose",
      conversationHistory: [
        firstSeen,
        { timestamp: 2, gameDay: 4, speaker: "Rose", text: "Come eat when you're ready." },
      ],
    });
    expect(findUnplayedDialogueScript(HUMAN_DIALOGUE_SCRIPTS, bothSeen)).toBeNull();
  });

  it("does not let a same-visit second greeting claim Mamma Cat came back", () => {
    const request = makeRequest({
      speaker: "Kish",
      conversationHistory: [{ timestamp: 1, gameDay: 4, speaker: "Kish", text: "Hi, kitty. I'll be gentle." }],
    });
    expect(findUnplayedDialogueScript(HUMAN_DIALOGUE_SCRIPTS, request)).toBeNull();
  });
});
