/**
 * Pure scheduling decisions for the ambient park crowd (AmbientCrowdSystem):
 * clock hour → time slot, per-role head-count targets, which role to spawn or
 * shed next, and the extra security guards' dispositions and night shift.
 * No Phaser dependency.
 */

import type { TimeOfDay } from "../systems/DayNightCycle";
import type { GuardDisposition } from "../sprites/GuardNPC";
import type { Pt } from "./mapPlaces";

/** Crowd time slots: the four day phases plus the lunch rush carved out of "day". */
export type CrowdSlot = TimeOfDay | "lunch";

export const CROWD_SLOTS: readonly CrowdSlot[] = ["dawn", "day", "lunch", "evening", "night"];

/** Lunch rush, in clock hours. */
export const LUNCH_HOURS: readonly [number, number] = [11.5, 13.5];

/** Clock hour (0-24) inside a phase that runs from `startHour` to `nextStartHour` (wraps midnight). */
export function clockHour(startHour: number, nextStartHour: number, progress: number): number {
  const span = (nextStartHour - startHour + 24) % 24 || 24;
  const p = Math.min(1, Math.max(0, progress));
  return (startHour + span * p) % 24;
}

export function crowdSlot(phase: TimeOfDay, hour: number, lunch: readonly [number, number] = LUNCH_HOURS): CrowdSlot {
  return phase === "day" && hour >= lunch[0] && hour < lunch[1] ? "lunch" : phase;
}

/** Writes each role's head-count target for `slot` into `out` (reused buffer). */
export function fillTargets(
  roles: ReadonlyArray<{ population: Readonly<Record<CrowdSlot, number>> }>,
  slot: CrowdSlot,
  scale: number,
  out: number[],
): number[] {
  out.length = roles.length;
  for (let i = 0; i < roles.length; i++) out[i] = Math.round((roles[i]?.population[slot] ?? 0) * scale);
  return out;
}

/**
 * Role to spawn next, chosen with probability proportional to its deficit
 * (target − count), so mixed shortfalls fill together. `r` is a uniform
 * random number in [0, 1). Returns -1 when no role is below target.
 */
export function pickWeightedDeficit(counts: ArrayLike<number>, targets: ArrayLike<number>, r: number): number {
  let total = 0;
  for (let i = 0; i < targets.length; i++) total += Math.max(0, (targets[i] ?? 0) - (counts[i] ?? 0));
  if (total <= 0) return -1;
  let pick = r * total;
  let last = -1;
  for (let i = 0; i < targets.length; i++) {
    const deficit = Math.max(0, (targets[i] ?? 0) - (counts[i] ?? 0));
    if (deficit <= 0) continue;
    last = i;
    if (pick < deficit) return i;
    pick -= deficit;
  }
  return last;
}

/** Role with the largest surplus over its target, or -1 when none is over. */
export function mostOverTarget(counts: ArrayLike<number>, targets: ArrayLike<number>): number {
  let best = -1;
  let bestSurplus = 0;
  for (let i = 0; i < targets.length; i++) {
    const surplus = (counts[i] ?? 0) - (targets[i] ?? 0);
    if (surplus > bestSurplus) {
      best = i;
      bestSurplus = surplus;
    }
  }
  return best;
}

export interface GuardPost extends Pt {
  name: string;
}

export interface Keepout extends Pt {
  r: number;
}

export interface GuardPlanOptions {
  /** No extra guard is posted within these circles (e.g. the existing restaurant guard). */
  exclude: ReadonlyArray<Keepout>;
  /** The single extra hostile guard must be outside all of these (player spawn, shelters, food, water). */
  hostileKeepout: ReadonlyArray<Keepout>;
  /** Post names tried first, in order, for the hostile guard. */
  hostilePreference: readonly string[];
  maxGuards: number;
  /** Every Nth calm guard (offset 1) is friendly; the rest are passive. */
  friendlyEvery: number;
}

const inside = (p: Pt, k: Keepout): boolean => Math.hypot(p.x - k.x, p.y - k.y) < k.r;

/**
 * Deterministic guard roster: at most one hostile (the first preferred post
 * clear of every hostile keep-out, else the first clear post), most passive,
 * every `friendlyEvery`-th calm guard friendly.
 */
export function planGuards(
  posts: ReadonlyArray<GuardPost>,
  opts: GuardPlanOptions,
): Array<{ post: GuardPost; disposition: GuardDisposition }> {
  const eligible = posts.filter((p) => !opts.exclude.some((k) => inside(p, k))).slice(0, opts.maxGuards);
  const clear = (p: GuardPost): boolean => !opts.hostileKeepout.some((k) => inside(p, k));
  let hostile = -1;
  for (const name of opts.hostilePreference) {
    const i = eligible.findIndex((p) => p.name === name && clear(p));
    if (i >= 0) {
      hostile = i;
      break;
    }
  }
  if (hostile < 0) hostile = eligible.findIndex(clear);

  let calm = 0;
  return eligible.map((post, i) => {
    if (i === hostile) return { post, disposition: "hostile" };
    const disposition: GuardDisposition = calm % opts.friendlyEvery === 1 ? "friendly" : "passive";
    calm++;
    return { post, disposition };
  });
}

/**
 * Which guards stay on duty at night: `count` calm guards, alternating
 * friendly and passive in roster order. Hostile guards always go home.
 */
export function nightShift(dispositions: ReadonlyArray<GuardDisposition>, count: number): boolean[] {
  const onDuty = dispositions.map(() => false);
  const friendly = dispositions.flatMap((d, i) => (d === "friendly" ? [i] : []));
  const passive = dispositions.flatMap((d, i) => (d === "passive" ? [i] : []));
  let picked = 0;
  for (let k = 0; picked < count && (k < friendly.length || k < passive.length); k++) {
    for (const list of [friendly, passive]) {
      const i = list[k];
      if (i !== undefined && picked < count) {
        onDuty[i] = true;
        picked++;
      }
    }
  }
  return onDuty;
}
