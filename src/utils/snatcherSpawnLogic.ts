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

/**
 * Stage the scripted first sighting near the player on the big map: pick the
 * patrol vertex nearest `target` that is at least `minDistPx` away (so the
 * snatcher appears just off-screen and walks into view), and start that
 * closed patrol loop there. Returns null when no route qualifies.
 */
export function stagePatrolNear(
  paths: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>,
  target: { x: number; y: number },
  minDistPx: number,
): Array<{ x: number; y: number }> | null {
  let best: { path: ReadonlyArray<{ x: number; y: number }>; index: number; dist: number } | null = null;
  for (const path of paths) {
    const closed = path.length > 2 && path[0]!.x === path[path.length - 1]!.x && path[0]!.y === path[path.length - 1]!.y;
    const loop = closed ? path.slice(0, -1) : path;
    loop.forEach((v, index) => {
      const dist = Math.hypot(v.x - target.x, v.y - target.y);
      if (dist >= minDistPx && (!best || dist < best.dist)) best = { path: loop, index, dist };
    });
  }
  if (!best) return null;
  const { path, index } = best as { path: ReadonlyArray<{ x: number; y: number }>; index: number };
  const rotated = [...path.slice(index), ...path.slice(0, index)].map(({ x, y }) => ({ x, y }));
  return [...rotated, { ...rotated[0]! }];
}
