/**
 * Single source for shared gameplay constants: interaction radii, narrative
 * witness distances (Phase 4.5 remediation), and input-timing values used
 * across scenes.
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

/** Duration (ms) the player must hold the rest key to enter resting state. */
export const REST_HOLD_MS = 1000;

/** Duration (ms) Mamma Cat lies immobilised before the collapse recovery fires. */
export const COLLAPSE_RECOVERY_MS = 3000;
