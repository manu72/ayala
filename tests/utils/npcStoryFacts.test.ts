import { describe, expect, it } from "vitest";
import { CAMILLE_ENCOUNTER_MEMORY } from "../../src/data/camille-encounter-beats";
import { StoryKeys } from "../../src/registry/storyKeys";
import { buildNpcStoryFacts, humanRelationshipStage } from "../../src/utils/npcStoryFacts";

const registry = (values: Record<string, unknown> = {}) => new Map(Object.entries(values));
const MET_CAMILLE = "Mamma Cat has met Camille, the quiet woman who walks the evening rounds.";

describe("buildNpcStoryFacts — cats", () => {
  it("tells every named cat about Camille only once Mamma Cat has met her", () => {
    expect(buildNpcStoryFacts("Blacky", "cat", registry(), 4)).toEqual([]);
    expect(buildNpcStoryFacts("Blacky", "cat", registry({ [StoryKeys.CAMILLE_ENCOUNTER]: 1 }), 9)).toEqual([MET_CAMILLE]);
  });

  it("gives Fluffy Manu's visit in the second person", () => {
    const facts = buildNpcStoryFacts("Fluffy", "cat", registry({ [StoryKeys.MANU_VISITED_FLUFFY_DAY]: 8 }), 9);
    expect(facts).toEqual(["Manu came by to see you yesterday."]);
    expect(buildNpcStoryFacts("Tiger", "cat", registry({ [StoryKeys.MANU_VISITED_FLUFFY_DAY]: 8 }), 9)).toEqual([]);
  });

  it("ignores malformed registry values from old or edited saves", () => {
    const junk = registry({ [StoryKeys.CAMILLE_ENCOUNTER]: "3", [StoryKeys.MANU_VISITED_FLUFFY_DAY]: NaN });
    expect(buildNpcStoryFacts("Fluffy", "cat", junk, 9)).toEqual([]);
    for (const eggs of [null, "x", 4, { collar: "3", pedigreeThanked: 1, blackyStory: "yes" }]) {
      for (const cat of ["Pedigree", "Blacky"]) {
        expect(buildNpcStoryFacts(cat, "cat", registry({ [StoryKeys.EGGS]: eggs }), 9)).toEqual([]);
      }
    }
    expect(buildNpcStoryFacts("Jayco", "cat", registry({ TERRITORY_CLAIMED: "true" }), 9)).toEqual([]);
  });

  it("keeps the saved story moments a persona keys off, whatever history was pruned", () => {
    const collar = registry({ [StoryKeys.EGGS]: { collar: 5 } });
    expect(buildNpcStoryFacts("Pedigree", "cat", collar, 9)).toEqual([
      "Mamma Cat dug up your friend's old collar where your friend used to sleep.",
    ]);
    const thanked = registry({ [StoryKeys.EGGS]: { collar: 5, pedigreeThanked: true, blackyStory: true } });
    expect(buildNpcStoryFacts("Pedigree", "cat", thanked, 9)).toEqual([
      "Mamma Cat dug up your friend's old collar where your friend used to sleep, and you thanked her for it.",
    ]);
    expect(buildNpcStoryFacts("Blacky", "cat", thanked, 9)).toEqual([
      "One sleepless night you told Mamma Cat about the grey cat who raised you, and how she was taken.",
    ]);
    expect(buildNpcStoryFacts("Jayco", "cat", registry({ TERRITORY_CLAIMED: true }), 9)).toEqual([
      "You told Mamma Cat the steps are wide enough for all of you; she lives on them now.",
    ]);
    // each fact is its own cat's
    expect(buildNpcStoryFacts("Tiger", "cat", registry({ [StoryKeys.EGGS]: { collar: 5, blackyStory: true }, TERRITORY_CLAIMED: true }), 9)).toEqual([]);
  });
});

describe("buildNpcStoryFacts — humans", () => {
  it("gives Camille one fact per completed encounter plus the day of the last one", () => {
    const facts = buildNpcStoryFacts(
      "Camille",
      "human",
      registry({ [StoryKeys.CAMILLE_ENCOUNTER]: 3, [StoryKeys.CAMILLE_ENCOUNTER_DAY]: 7 }),
      8,
    );
    expect(facts).toEqual([
      CAMILLE_ENCOUNTER_MEMORY[1],
      CAMILLE_ENCOUNTER_MEMORY[2],
      CAMILLE_ENCOUNTER_MEMORY[3],
      "Last encounter was on day 7.",
    ]);
    expect(buildNpcStoryFacts("Camille", "human", registry(), 8)).toEqual([]);
  });

  it("puts Manu on the rounds from encounter 2 and tells him whether he has seen Fluffy today", () => {
    expect(buildNpcStoryFacts("Manu", "human", registry({ [StoryKeys.CAMILLE_ENCOUNTER]: 1 }), 5)).toEqual([
      "You haven't seen Fluffy yet today.",
    ]);
    expect(
      buildNpcStoryFacts(
        "Manu",
        "human",
        registry({ [StoryKeys.CAMILLE_ENCOUNTER]: 2, [StoryKeys.MANU_VISITED_FLUFFY_DAY]: 5 }),
        5,
      ),
    ).toEqual([
      "You have walked the evening rounds with Camille while she got to know Mamma Cat.",
      "You already stopped by to see Fluffy today.",
    ]);
  });

  it("puts Kish on the rounds from encounter 3, and gives Rose and Ben nothing extra", () => {
    expect(buildNpcStoryFacts("Kish", "human", registry({ [StoryKeys.CAMILLE_ENCOUNTER]: 2 }), 5)).toEqual([]);
    expect(buildNpcStoryFacts("Kish", "human", registry({ [StoryKeys.CAMILLE_ENCOUNTER]: 3 }), 5)).toHaveLength(1);
    for (const speaker of ["Rose", "Ben"]) {
      expect(buildNpcStoryFacts(speaker, "human", registry({ [StoryKeys.CAMILLE_ENCOUNTER]: 4 }), 5)).toEqual([]);
    }
  });
});

describe("humanRelationshipStage", () => {
  it("follows Camille's encounters, not stored lines or colony trust", () => {
    const camille = (encounters: number | undefined, daysMet: number) =>
      humanRelationshipStage("Camille", registry({ [StoryKeys.CAMILLE_ENCOUNTER]: encounters }), daysMet);
    expect(camille(undefined, 0)).toBe(1);
    expect(camille(undefined, 1)).toBe(2);
    expect(camille(1, 0)).toBe(2);
    expect(camille(2, 9)).toBe(2);
    expect(camille(3, 0)).toBe(3);
    expect(camille(4, 1)).toBe(4);
    expect(camille(5, 1)).toBe(4);
  });

  it.each([
    [0, 1],
    [1, 2],
    [2, 2],
    [3, 3],
    [5, 3],
    [6, 4],
  ] as const)("warms other humans up by distinct days met (%i days → stage %i)", (daysMet, stage) => {
    expect(humanRelationshipStage("Rose", registry({ [StoryKeys.CAMILLE_ENCOUNTER]: 4 }), daysMet)).toBe(stage);
  });
});
