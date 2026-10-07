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

type Pt = { x: number; y: number };

/** What "walks into view" means for {@link stagePatrolNear}. */
export interface StageSight {
  /** The snatcher must come within this of the target... */
  witnessDistPx: number;
  /** ...after walking no more than this along its route... */
  reachPx: number;
  /** ...to a spot the target can see. */
  canSee: (p: Pt) => boolean;
}

/** Route sampling step for {@link stagePatrolNear}'s sight search, px. */
const STAGE_STEP_PX = 16;

/**
 * Stage the scripted first sighting near the player on the big map. With
 * `sight`: start somewhere along a patrol loop (either direction) at least
 * `minDistPx` from `target`, so the snatcher appears just off-screen, choosing
 * the start whose walk comes into the target's view soonest within
 * `sight.reachPx`. Without `sight`, or when no start can do that: the patrol
 * vertex nearest `target` that is at least `minDistPx` away. The loop is
 * returned rotated (and closed) to begin at the start. Null when no route
 * qualifies.
 */
export function stagePatrolNear(
  paths: ReadonlyArray<ReadonlyArray<Pt>>,
  target: Pt,
  minDistPx: number,
  sight?: StageSight,
): Array<Pt> | null {
  const inView = sight ? stageInSight(paths, target, minDistPx, sight) : null;
  if (inView) return inView;
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

/** The open vertex cycle of a patrol path (closing duplicate dropped). */
function loopOf(path: ReadonlyArray<Pt>): Pt[] {
  const closed = path.length > 2 && path[0]!.x === path[path.length - 1]!.x && path[0]!.y === path[path.length - 1]!.y;
  return (closed ? path.slice(0, -1) : path).map(({ x, y }) => ({ x, y }));
}

function stageInSight(paths: ReadonlyArray<ReadonlyArray<Pt>>, target: Pt, minDistPx: number, sight: StageSight): Pt[] | null {
  let best: { loop: Pt[]; seg: number; at: Pt; walk: number } | null = null;
  for (const path of paths) {
    const forward = loopOf(path);
    if (forward.length < 2) continue;
    for (const loop of [forward, [...forward].reverse()]) {
      // Samples every STAGE_STEP_PX round the loop: position, segment, distance walked from vertex 0.
      const samples: Array<{ at: Pt; seg: number; along: number; seen: boolean }> = [];
      let total = 0;
      loop.forEach((a, seg) => {
        const b = loop[(seg + 1) % loop.length]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        for (let d = 0; d < len; d += STAGE_STEP_PX) {
          const at = { x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len };
          const seen = Math.hypot(at.x - target.x, at.y - target.y) <= sight.witnessDistPx && sight.canSee(at);
          samples.push({ at, seg, along: total + d, seen });
        }
        total += len;
      });
      samples.forEach((start, i) => {
        if (Math.hypot(start.at.x - target.x, start.at.y - target.y) < minDistPx) return;
        for (let k = 1; k < samples.length; k++) {
          const s = samples[(i + k) % samples.length]!;
          const walk = (s.along - start.along + total) % total;
          if (walk > sight.reachPx || (best && walk >= best.walk)) break;
          if (s.seen) {
            best = { loop, seg: start.seg, at: start.at, walk };
            break;
          }
        }
      });
    }
  }
  if (!best) return null;
  const { loop, seg, at } = best as { loop: Pt[]; seg: number; at: Pt };
  const onward = [...loop.slice(seg + 1), ...loop.slice(0, seg + 1)];
  return [{ ...at }, ...onward, { ...at }];
}
