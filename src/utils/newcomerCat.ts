/**
 * Newly dumped pets (ColonyDynamicsSystem's dumping events) are frightened house
 * cats, not street cats: they settle into the gardens over days. Pure helpers for
 * {@link NewcomerCats}, kept Phaser-free for tests.
 */

/** A newcomer, saved by background index in the registry (`COLONY_NEWCOMERS`). */
export interface NewcomerRecord {
  /** 0 just dumped … {@link SETTLED}: at home in the gardens. */
  comfort: number;
  /** The game day it was dumped. */
  since: number;
  /** Where it lives: where it was dropped, then its bush, then wherever it settled. */
  x: number;
  y: number;
}

export const SETTLED = 100;
/** It lets Mamma Cat learn its name once it is this settled. */
export const NEWCOMER_NAME_COMFORT = 50;

/** However much Mamma Cat sits with it, it settles by at most this much per game day it has been here. */
const COMFORT_PER_DAY = 35;

export function comfortCeiling(since: number, day: number): number {
  return Math.min(SETTLED, COMFORT_PER_DAY * (Math.max(0, day - since) + 1));
}

/** Left alone, it still settles this much for every game day it has been here. */
const SETTLES_ALONE_PER_DAY = 15;

export function comfortFloor(since: number, day: number): number {
  return Math.min(SETTLED, SETTLES_ALONE_PER_DAY * Math.max(0, day - since));
}

/** Half of them bolt for the bushes and hide; the rest freeze, stay low and creep. Fixed per cat. */
export function hidesWhenScared(index: number): boolean {
  return index % 2 === 0;
}

/**
 * How close Mamma Cat can come before it takes fright: only while she moves (sitting
 * still is how she makes friends), less creeping up crouched, more running at it,
 * and a little less the more it has settled.
 */
export function mammaAlarmRadius(m: { isMoving: boolean; isCrouching: boolean; isRunning: boolean }, comfort: number): number {
  if (!m.isMoving) return 0;
  const r = m.isRunning ? 180 : m.isCrouching ? 44 : 120;
  return r * (1 - Math.min(Math.max(comfort, 0), SETTLED) / (2 * SETTLED));
}

/** The saved newcomers (registry values may be missing or corrupt). */
export function readNewcomers(value: unknown): Map<number, NewcomerRecord> {
  const out = new Map<number, NewcomerRecord>();
  if (typeof value !== "object" || value === null) return out;
  for (const [key, rec] of Object.entries(value)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || typeof rec !== "object" || rec === null) continue;
    const { comfort, since, x, y } = rec as Record<string, unknown>;
    if ([comfort, since, x, y].every((v) => typeof v === "number" && Number.isFinite(v)))
      out.set(index, { comfort: Math.min(Math.max(comfort as number, 0), SETTLED), since: since as number, x: x as number, y: y as number });
  }
  return out;
}
