import { closestOnPolyline, pointAlong, type Pt } from "./mapPlaces";

/** Lane width in world px (3.3 m at 16 px/m). */
export const LANE_WIDTH_PX = 52.8;

export interface DropoffPlan {
  /** Where the car appears (upstream on the lane). */
  start: Pt;
  /** Where it stops, centred in the kerb-side lane opposite `target`. */
  stop: Pt;
  /** Where it drives off to (downstream). */
  exit: Pt;
  /** Sprite rotation for a west-facing side-view car image, and whether to mirror it. */
  rotation: number;
  flipX: boolean;
  /** Unit vector from the stop point toward the target (the kerb side). */
  towardKerb: Pt;
}

/**
 * West-facing side-view car art pointed along `heading` (radians) without
 * ever drawing it upside down: eastward headings mirror the art instead.
 */
export function carPose(heading: number): { rotation: number; flipX: boolean } {
  const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
  if (Math.cos(heading) > 0) return { rotation: wrap(heading), flipX: true };
  return { rotation: wrap(heading - Math.PI), flipX: false };
}

/**
 * Plan a car pulling over at the kerb nearest `target` on a one-way lane
 * polyline (vertices in driving order). Pure geometry; callers pick the
 * walkable drop cell between `stop` and `target`.
 */
export function planKerbsideDropoff(
  lane: ReadonlyArray<Pt>,
  lanes: number,
  target: Pt,
  approachPx = 400,
  departPx = 600,
): DropoffPlan | null {
  if (lane.length < 2) return null;
  const near = closestOnPolyline(lane, target);
  const dx = target.x - near.x;
  const dy = target.y - near.y;
  const len = Math.hypot(dx, dy) || 1;
  const towardKerb = { x: dx / len, y: dy / len };
  const kerbLaneOffset = Math.min(len, ((Math.max(1, lanes) - 1) / 2) * LANE_WIDTH_PX);
  const stop = { x: near.x + towardKerb.x * kerbLaneOffset, y: near.y + towardKerb.y * kerbLaneOffset };
  const startOnLine = pointAlong(lane, near.along - approachPx);
  const exitOnLine = pointAlong(lane, near.along + departPx);
  const heading = pointAlong(lane, near.along).angle;
  const shift = (p: Pt): Pt => ({ x: p.x + towardKerb.x * kerbLaneOffset, y: p.y + towardKerb.y * kerbLaneOffset });
  return { start: shift(startOnLine), stop, exit: shift(exitOnLine), ...carPose(heading), towardKerb };
}
