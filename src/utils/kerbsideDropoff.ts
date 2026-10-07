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
  /** Sprite rotation for nose-east top-down car art (the heading), never mirrored. */
  rotation: number;
  flipX: false;
  /** Unit vector from the stop point toward the target (the kerb side). */
  towardKerb: Pt;
}

/**
 * Top-down car art (nose pointing east, see scripts/generate-vehicles.mjs)
 * pointed along `heading` (radians): the rotation is the heading wrapped to
 * (-PI, PI]. Seen from above a car is never upside down, so never mirrored.
 */
export function topDownPose(heading: number): { rotation: number; flipX: false } {
  const r = Math.atan2(Math.sin(heading), Math.cos(heading));
  return { rotation: r <= -Math.PI ? r + 2 * Math.PI : r, flipX: false };
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
  return { start: shift(startOnLine), stop, exit: shift(exitOnLine), ...topDownPose(heading), towardKerb };
}

/**
 * True when `p` is in the way of a car driving from `car` (its centre) straight toward `to`:
 * under or beside its body (`halfLength` either side of the centre) or up to `clearance` px past
 * its nose, and within `halfWidth` of its centre line. A car already at `to` is in nobody's way.
 */
export function inCarPath(car: Pt, to: Pt, p: Pt, halfLength: number, halfWidth: number, clearance: number): boolean {
  const dx = to.x - car.x;
  const dy = to.y - car.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return false;
  const rx = p.x - car.x;
  const ry = p.y - car.y;
  const along = (rx * dx + ry * dy) / len;
  const side = Math.abs(rx * dy - ry * dx) / len;
  return along >= -halfLength && along <= halfLength + clearance && side <= halfWidth;
}
