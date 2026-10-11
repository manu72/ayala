/**
 * Deterministic "Story so far" facts and human relationship stages for NPC
 * prompts. Everything is read from the save-backed registry, so a restored
 * save never leaks facts from an abandoned timeline. Pure: tests pass a Map.
 */

import { CAMILLE_ENCOUNTER_MEMORY } from "../data/camille-encounter-beats";
import { StoryKeys } from "../registry/storyKeys";
import type { RelationshipStage } from "../services/DialogueRelationship";
import { readLifetimeCount, type CountRegistry } from "./lifetimeCount";
import { buildManuVisitedFluffyMessage, manuVisitDaysAgo } from "./manuVisitMessage";

export function buildNpcStoryFacts(
  speaker: string,
  speakerType: "cat" | "human",
  registry: CountRegistry,
  currentDay: number,
): string[] {
  const encounters = readLifetimeCount({ registry }, StoryKeys.CAMILLE_ENCOUNTER);
  const manuVisitDay = registry.get(StoryKeys.MANU_VISITED_FLUFFY_DAY);
  const facts: string[] = [];

  if (speakerType === "cat") {
    if (encounters >= 1) facts.push("Mamma Cat has met Camille, the quiet woman who walks the evening rounds.");
    const manuVisit = speaker === "Fluffy" ? buildManuVisitedFluffyMessage(manuVisitDay, currentDay) : null;
    if (manuVisit) facts.push(manuVisit);
    // The story moments a cat's persona keys off, so they outlast pruned or trimmed history.
    const eggs = (registry.get(StoryKeys.EGGS) ?? {}) as Partial<
      Record<"collar" | "pedigreeThanked" | "blackyStory", unknown>
    >;
    if (speaker === "Blacky" && eggs.blackyStory === true) {
      facts.push("One sleepless night you told Mamma Cat about the grey cat who raised you, and how she was taken.");
    }
    if (speaker === "Pedigree" && typeof eggs.collar === "number") {
      facts.push(
        eggs.pedigreeThanked === true
          ? "Mamma Cat dug up your friend's old collar where your friend used to sleep, and you thanked her for it."
          : "Mamma Cat dug up your friend's old collar where your friend used to sleep.",
      );
    }
    if (speaker === "Jayco" && registry.get("TERRITORY_CLAIMED") === true) {
      facts.push("You told Mamma Cat the steps are wide enough for all of you; she lives on them now.");
    }
    return facts;
  }

  switch (speaker) {
    case "Camille": {
      for (const n of [1, 2, 3, 4] as const) {
        if (encounters >= n) facts.push(CAMILLE_ENCOUNTER_MEMORY[n]);
      }
      const lastDay = readLifetimeCount({ registry }, StoryKeys.CAMILLE_ENCOUNTER_DAY);
      if (encounters >= 1 && lastDay >= 1) facts.push(`Last encounter was on day ${lastDay}.`);
      break;
    }
    case "Manu":
      if (encounters >= 2) facts.push("You have walked the evening rounds with Camille while she got to know Mamma Cat.");
      facts.push(
        manuVisitDaysAgo(manuVisitDay, currentDay) === 0
          ? "You already stopped by to see Fluffy today."
          : "You haven't seen Fluffy yet today.",
      );
      break;
    case "Kish":
      if (encounters >= 3) {
        facts.push("You have come along on the evening rounds with your aunt Camille while she got to know Mamma Cat.");
      }
      break;
  }
  return facts;
}

/**
 * Humans have no per-human trust. Camille's stage follows her encounters
 * (she knows Mamma Cat from encounter 1 even with no stored lines); the
 * others warm up over `daysMet`, the distinct game days in their records.
 */
export function humanRelationshipStage(speaker: string, registry: CountRegistry, daysMet: number): RelationshipStage {
  if (speaker === "Camille") {
    const encounters = readLifetimeCount({ registry }, StoryKeys.CAMILLE_ENCOUNTER);
    if (encounters >= 4) return 4;
    if (encounters === 3) return 3;
    return daysMet > 0 || encounters >= 1 ? 2 : 1;
  }
  if (daysMet >= 6) return 4;
  if (daysMet >= 3) return 3;
  return daysMet >= 1 ? 2 : 1;
}
