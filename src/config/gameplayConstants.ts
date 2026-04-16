/**
 * Single source for interaction radii and narrative witness distances (Phase 4.5 remediation).
 */
export const GP = {
  INTERACTION_DIST: 50,
  DIALOGUE_BREAK_DIST: 96,
  LEARN_NAME_DIST: 100,
  GLANCE_DIST: 48,
  CAT_PERSON_GREET_DIST: 64,
  CAT_PERSON_PLAYER_GREET_DIST: 50,
  NARRATION_WITNESS_DIST: 150,
  /** Horizontal band centre for Makati Ave dumping events (world px). */
  MAKATI_AVE_CENTER_X: 2800,
  MAKATI_AVE_WITNESS_DIST: 300,
  SNATCHER_WITNESS_DIST: 200,
  /** NPC cats flee snatcher when within this range. */
  NPC_FLEE_SNATCHER_DIST: 160,
  CAMILLE_ENCOUNTER_DIST: 64,
  TILE_SIZE: 32,
} as const;
