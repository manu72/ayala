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
  /**
   * Chebyshev distance (max of |dx|,|dy| in tiles) from any colliding map cell
   * for which a tile centre is treated as blocked for human A* routing. Keeps
   * routed paths one tile away from building edges so Arcade body separation
   * does not wedge actors against facades.
   */
  HUMAN_NAV_CLEARANCE_CHEBYSHEV_TILES: 1,
  /** Human stuck: no meaningful position change for this long (ms) while trying to move. */
  HUMAN_STUCK_NO_PROGRESS_MS: 450,
  /** Human stuck: wall contact + low speed or no-progress must persist this long before detour. */
  HUMAN_STUCK_TRIGGER_MS: 220,
  /** Below this speed (px/s) while blocked counts as "pressing" a wall. */
  HUMAN_STUCK_SPEED_THRESHOLD: 8,
  /** Min position delta (px) between samples to reset the no-progress timer. */
  HUMAN_STUCK_MIN_PROGRESS_PX: 0.35,
  /** After this many failed detour requests, skip the current waypoint (last resort). */
  HUMAN_STUCK_SKIP_WAYPOINT_AFTER_FAILURES: 3,
} as const;

/**
 * Camille-era care route: default pause at each waypoint (crouch / refill /
 * greet window). Pyramid stops use {@link CAMILLE_CARE_ROUTE_PYRAMID_PAUSE_MS}.
 */
export const CAMILLE_CARE_ROUTE_WAYPOINT_PAUSE_MS = 4500;

/** Extra dwell at `poi_pyramid_steps` (both visits on the route). */
export const CAMILLE_CARE_ROUTE_PYRAMID_PAUSE_MS = 22_000;

/** Entry / underpass / final Blacky pause — slightly shorter than pyramid. */
export const CAMILLE_CARE_ROUTE_ENTRY_BLACKY_PAUSE_MS = 3800;

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

/**
 * After a chapter advance, Mamma Cat must move at least this many world
 * pixels from her position at the moment of the advance before the next
 * chapter is allowed to fire. Pre-v0.3.8 the 5 s `chapterCheckTimer`
 * could cascade 1→2→3→4 in fifteen seconds the moment a player woke
 * from a long sleep that had passively pushed trust over thresholds.
 * The threshold is set tight (one tile is 32 px) so any deliberate
 * exploration releases the lock, but a stationary or near-stationary
 * player cannot rack up consecutive chapter advances on the timer alone.
 */
export const CHAPTER_REARM_MOVE_PX = 200;

/**
 * Maximum distance (world pixels) from `poi_pyramid_steps` at which
 * Mamma Cat is considered "near the steps" for chapter 4 territory
 * negotiation. Slightly larger than the {@link isInTerritory} radius
 * (120 px) used post-claim so the trigger is forgiving — the player
 * just has to walk up to Jayco at the steps, not stand on a single
 * tile. Pre-v0.3.8 territory could be claimed from anywhere as soon
 * as global trust crossed 80; that bypassed the entire "earn your
 * place at the steps" beat.
 */
export const TERRITORY_NEGOTIATION_NEAR_STEPS_PX = 150;

/**
 * Per-cat trust required of Jayco before he will offer territory at the
 * pyramid steps. Mirrors {@link TrustSystem.firstConversation} delta
 * (10 trust per first conversation, +5 per return) so the player has
 * to actually engage Jayco several times — proximity ticks alone
 * cannot satisfy this gate.
 */
export const TERRITORY_JAYCO_TRUST_REQUIRED = 50;

/** Radius (px) of the on-screen movement control in HUD space. */
export const TOUCH_STICK_RADIUS_PX = 48;

/** Movement input below this distance is treated as neutral. */
export const TOUCH_STICK_DEAD_ZONE_PX = 10;

/** Base size for on-screen touch action buttons. Kept on the 8px grid. */
export const TOUCH_BUTTON_SIZE_PX = 64;

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
