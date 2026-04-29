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
  /**
   * "Close enough to touch" distance used by Camille's beat 5 decision gate.
   * The player must walk Mamma Cat within this radius of Camille and press
   * Space to greet within {@link CAMILLE_BEAT5_DECISION_MS} for the beat to
   * resolve as "yes, take me home". Kept slightly tighter than
   * CAT_PERSON_PLAYER_GREET_DIST so the choice reads as deliberate.
   */
  CAMILLE_BEAT5_TOUCH_DIST: 40,
  TILE_SIZE: 32,
} as const;

/**
 * Duration (ms) of the beat 5 decision window. Camille has asked "Would you
 * like to come home with me?" — the player has this long to approach and
 * press Space to greet. On timeout Camille stands down and the beat re-arms
 * for the next proximity trigger.
 */
export const CAMILLE_BEAT5_DECISION_MS = 10_000;

/**
 * Max number of automatic proximity greetings a single human NPC may fire at
 * Mamma Cat while she is stationary. Before this cap was introduced, cat-
 * persons would loop `startGreeting` → idle cooldown → `startGreeting` again
 * indefinitely against a stationary or resting Mamma Cat, trapping both
 * NPCs in a greeting stall. Counter resets for every human the moment Mamma
 * moves {@link STATIONARY_MOVE_THRESHOLD_PX} from her last anchor.
 *
 * The cap applies only to passive proximity greetings in `updateHumans`.
 * Player-initiated greetings (Space) and encounter beats are unaffected.
 */
export const STATIONARY_GREET_CAP = 2;

/**
 * World-pixel distance Mamma Cat must travel from her current anchor before
 * all humans' stationary greeting counters are reset. Chosen slightly below
 * one tile (32 px) so a single step in any direction releases the cap.
 */
export const STATIONARY_MOVE_THRESHOLD_PX = 24;

/** Duration (ms) the player must hold the rest key to enter resting state. */
export const REST_HOLD_MS = 1000;

/** Radius (px) of the on-screen movement control in HUD space. */
export const TOUCH_STICK_RADIUS_PX = 48;

/** Movement input below this distance is treated as neutral. */
export const TOUCH_STICK_DEAD_ZONE_PX = 10;

/** Base size for on-screen touch action buttons. Kept on the 8px grid. */
export const TOUCH_BUTTON_SIZE_PX = 48;

/** Gap between touch controls. Kept on the 8px grid. */
export const TOUCH_BUTTON_GAP_PX = 8;

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
