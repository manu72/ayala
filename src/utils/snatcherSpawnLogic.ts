/**
 * Pure decision logic for nightly snatcher spawn checks (first scripted sighting vs random).
 * Extracted for unit testing — GameScene delegates side effects after resolving an action.
 */

export type SnatcherSpawnAction =
  | { type: "not_night"; resetChecked: true }
  | { type: "already_checked" }
  | { type: "defer_first_sighting"; reason: "resting_at_shelter" }
  | { type: "first_sighting" }
  | { type: "random_spawn" };

export interface SnatcherSpawnInput {
  isNight: boolean;
  snatcherSpawnChecked: boolean;
  firstSnatcherSeen: boolean | undefined;
  chapter: number;
  isResting: boolean;
  isNearShelter: boolean;
}

/**
 * Decide what the nightly snatcher spawn pass should do.
 * Critical: when the first scripted sighting is deferred (player resting at shelter),
 * `snatcherSpawnChecked` must stay false so the next poll can try again.
 */
export function resolveSnatcherSpawnAction(input: SnatcherSpawnInput): SnatcherSpawnAction {
  if (!input.isNight) {
    return { type: "not_night", resetChecked: true };
  }
  if (input.snatcherSpawnChecked) {
    return { type: "already_checked" };
  }

  const firstEligible =
    input.firstSnatcherSeen !== true && input.chapter >= 3;

  if (firstEligible) {
    if (input.isResting && input.isNearShelter) {
      return { type: "defer_first_sighting", reason: "resting_at_shelter" };
    }
    return { type: "first_sighting" };
  }

  return { type: "random_spawn" };
}
