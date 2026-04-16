/**
 * Typed Phaser registry keys for story progression (save-compatible string values).
 */

export const StoryKeys = {
  INTRO_SEEN: "INTRO_SEEN",
  FIRST_SNATCHER_SEEN: "FIRST_SNATCHER_SEEN",
  CAMILLE_ENCOUNTER: "CAMILLE_ENCOUNTER",
  CAMILLE_ENCOUNTER_DAY: "CAMILLE_ENCOUNTER_DAY",
  DUMPING_EVENTS_SEEN: "DUMPING_EVENTS_SEEN",
  ENCOUNTER_5_COMPLETE: "ENCOUNTER_5_COMPLETE",
  NEW_GAME_PLUS: "NEW_GAME_PLUS",
  GAME_COMPLETED: "GAME_COMPLETED",
} as const;

export type StoryKey = (typeof StoryKeys)[keyof typeof StoryKeys];
