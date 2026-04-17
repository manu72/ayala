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

/**
 * Colony population model.
 *
 * `COLONY_COUNT` in the registry represents the total cat population of the
 * colony, including named cats (Blacky, Tiger, Jayco, Jayco Jr, Fluffy,
 * Pedigree, Ginger, Ginger B) + Mamma Cat + unseen/background cats. It moves
 * dynamically during play: dumping events bump it up, snatcher captures
 * bring it down. The visible background "Colony Cat N" roster is derived
 * from this total so snatcher losses visibly thin the colony once enough
 * have been taken.
 */

/** Starting colony population on a fresh game. Matches the pre-v0.1.10 narrative flavour number. */
export const INITIAL_COLONY_TOTAL = 42;

/**
 * Number of named story cats + Mamma Cat (Blacky, Tiger, Jayco, Jayco Jr,
 * Fluffy, Pedigree, Ginger, Ginger B, Mamma = 9). Also doubles as the
 * `COLONY_COUNT` floor — the counter never drops below this, so the story
 * cannot narratively count-out its own cast even under prolonged play.
 */
export const NAMED_AND_MAMMA_COUNT = 9;

/**
 * Max number of visible background "Colony Cat N" entities spawned by
 * `GameScene.spawnColonyCats`. Cap is a perf / readability constraint; the
 * narrative total lives independently in `COLONY_COUNT`.
 */
export const VISIBLE_BACKGROUND_CAP = 12;
