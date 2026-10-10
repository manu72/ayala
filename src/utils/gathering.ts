import type { Pt } from "./mapPlaces";

/** The named cats sit close round her; every other cat she knows keeps to a looser, wider ring. */
export const INNER_RADIUS_PX = 64;
export const FRINGE_MIN_PX = 118;
export const FRINGE_MAX_PX = 190;
/** Seen from above the ground is foreshortened a little: rings are drawn as ellipses. */
const SQUASH = 0.82;

/**
 * Where everyone sits for the Complete Colony Gathering, round `centre`: an even inner ring for the
 * named cats, and for the rest an uneven fringe (angles jittered, alternate cats further back) so it
 * reads as cats who came on their own and stopped where they felt safe.
 */
export function gatheringSlots(centre: Pt, inner: number, fringe: number, rng: () => number): { inner: Pt[]; fringe: Pt[] } {
  const ring = (n: number, r: (i: number) => number, a: (i: number) => number): Pt[] =>
    Array.from({ length: n }, (_, i) => ({ x: centre.x + Math.cos(a(i)) * r(i), y: centre.y + Math.sin(a(i)) * r(i) * SQUASH }));
  const step = fringe > 0 ? (Math.PI * 2) / fringe : 0;
  const offset = rng() * Math.PI * 2;
  const band = (FRINGE_MAX_PX - FRINGE_MIN_PX) / 2;
  return {
    inner: ring(inner, () => INNER_RADIUS_PX, (i) => (i / Math.max(1, inner)) * Math.PI * 2),
    fringe: ring(
      fringe,
      (i) => FRINGE_MIN_PX + (i % 2) * band + rng() * band,
      (i) => offset + i * step + (rng() - 0.5) * step * 0.6,
    ),
  };
}

/** When each fringe cat sets off (ms): after the first named cats, spread so the last starts by `spreadMs`. */
export function fringeStarts(count: number, firstMs: number, spreadMs: number, rng: () => number): number[] {
  const gap = count > 1 ? Math.min(1600, spreadMs / (count - 1)) : 0;
  return Array.from({ length: count }, (_, i) => Math.round(firstMs + i * gap + rng() * gap * 0.5));
}
