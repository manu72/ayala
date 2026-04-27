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
  GAME_OVER: "GAME_OVER",
  COLLAPSE_COUNT: "COLLAPSE_COUNT",
  // Lifetime counter for background colony cats lost to snatchers. Incremented
  // by `handleColonyCatSnatch` in GameScene; surfaced in the journal footer.
  CATS_SNATCHED: "CATS_SNATCHED",
  // Lifetime counter for Mamma Cat's own captures by snatchers. Incremented in
  // `handleSnatcherCapture` before the save-and-restart flow so the bump
  // survives the scene reload. Surfaced in the journal footer.
  PLAYER_SNATCHED_COUNT: "PLAYER_SNATCHED_COUNT",
  // Total cat population of the colony (named + Mamma + unseen background).
  // Seeded on a fresh game from `INITIAL_COLONY_TOTAL`, bumped by dumping
  // events, decremented by snatcher captures, floored at
  // `NAMED_AND_MAMMA_COUNT`. Drives the `JournalScene` colony count and the
  // derived visible background spawn in `GameScene.spawnColonyCats`.
  COLONY_COUNT: "COLONY_COUNT",
} as const;

export type StoryKey = (typeof StoryKeys)[keyof typeof StoryKeys];

/** The pre-registry localStorage key used by older builds to persist INTRO_SEEN. */
export const LEGACY_INTRO_SEEN_KEY = "ayala_intro_seen";

/**
 * Minimal registry surface (matches Phaser.Data.DataManager) so migration
 * helpers can be tested without booting a Phaser scene.
 */
export interface StoryRegistry {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
}

/**
 * Minimal storage surface (matches the bits of DOM Storage we read). Accepts
 * either the real `localStorage` (when available) or `undefined` for SSR /
 * headless contexts. `getItem` may throw in some sandboxed environments; the
 * helper treats any throw as "key absent" so boot never fails on storage.
 */
export interface StoryStorage {
  getItem(key: string): string | null;
}

/**
 * Migrate the pre-registry localStorage INTRO_SEEN flag into the registry.
 *
 * Reads `localStorage["ayala_intro_seen"]` and, if it is the string `"1"`,
 * writes `registry.INTRO_SEEN = true`. Any other value (null, "0", missing
 * storage, getItem throwing) is a no-op — the registry is left untouched so
 * callers can decide whether to play the intro cinematic.
 *
 * This is idempotent: safe to call every scene boot.
 */
export function migrateLegacyIntroFlag(
  registry: StoryRegistry,
  storage: StoryStorage | undefined,
): void {
  if (!storage) return;
  let value: string | null = null;
  try {
    value = storage.getItem(LEGACY_INTRO_SEEN_KEY);
  } catch {
    // Some browsers throw on localStorage access in private mode / restricted
    // contexts. Swallowing is safe because the registry flag is the source of
    // truth going forward; the legacy key is only an upgrade path.
    return;
  }
  if (value === "1") {
    registry.set(StoryKeys.INTRO_SEEN, true);
  }
}
