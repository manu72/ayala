/**
 * Pure lane geometry, car-following and time-of-day density for ambient
 * traffic ({@link TrafficSystem}). No Phaser dependency.
 *
 * Conventions: world px, y down; a lane polyline runs in driving direction and
 * "right of travel" for heading (ux, uy) is (-uy, ux). Traffic keeps right, so
 * lane 0 is the kerb lane and lane n-1 the median lane. Lanes are centred on
 * the carriageway polyline, which is what the map generator paints the road
 * around.
 */
import { LANE_WIDTH_PX } from "./kerbsideDropoff";
import { closestOnPolyline, polylineLength, type Pt } from "./mapPlaces";

/** Closest a car's nose gets to the rear bumper ahead (1 m). */
export const MIN_GAP_PX = 16;
/** Time gap a follower keeps to the car ahead; also how gently cars brake. */
export const FOLLOW_HEADWAY_S = 0.9;
export const ACCEL_PX_S2 = 90;

/** Right-of-travel offset of lane `k` (0 = kerb) on an `lanes`-lane carriageway. */
export function laneOffset(lanes: number, k: number): number {
  return ((lanes - 1) / 2 - k) * LANE_WIDTH_PX;
}

function dedupe(pts: ReadonlyArray<Pt>): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-6) out.push({ x: p.x, y: p.y });
  }
  return out;
}

/** The polyline shifted `offset` px to the right of travel (mitred joints, capped at 2x on sharp bends). */
export function offsetPolyline(pts: ReadonlyArray<Pt>, offset: number): Pt[] {
  const line = dedupe(pts);
  const normals: Pt[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    normals.push({ x: -(b.y - a.y) / len, y: (b.x - a.x) / len });
  }
  return line.map((p, i) => {
    const n1 = normals[i - 1] ?? normals[i];
    const n2 = normals[i] ?? n1;
    if (!n1 || !n2) return p;
    const k = Math.max(1 + n1.x * n2.x + n1.y * n2.y, 0.5);
    return { x: p.x + ((n1.x + n2.x) / k) * offset, y: p.y + ((n1.y + n2.y) / k) * offset };
  });
}

/**
 * Both ends carried straight on (along their end segments) until they leave
 * `bounds` grown by `margin`, at most `maxPx` each, so cars enter and leave
 * off-map instead of popping in at a junction.
 */
export function extendToBounds(
  pts: ReadonlyArray<Pt>,
  bounds: { width: number; height: number },
  margin = 64,
  maxPx = 2400,
): Pt[] {
  const line = dedupe(pts);
  const first = line[0];
  const second = line[1];
  const last = line[line.length - 1];
  const prev = line[line.length - 2];
  if (!first || !second || !last || !prev) return line;
  const exitAt = (p: number, u: number, hi: number): number =>
    u > 0 ? (hi + margin - p) / u : u < 0 ? (-margin - p) / u : Infinity;
  const onward = (from: Pt, back: Pt): Pt => {
    const len = Math.hypot(from.x - back.x, from.y - back.y);
    const ux = (from.x - back.x) / len;
    const uy = (from.y - back.y) / len;
    const t = Math.max(0, Math.min(maxPx, exitAt(from.x, ux, bounds.width), exitAt(from.y, uy, bounds.height)));
    return { x: from.x + ux * t, y: from.y + uy * t };
  };
  return dedupe([onward(first, second), ...line, onward(last, prev)]);
}

function staysOnRoad(
  lane: ReadonlyArray<Pt>,
  isDrivable: (x: number, y: number) => boolean,
  step: number,
  margin: number,
  tolerance: number,
): boolean {
  const allowed = Math.floor((polylineLength(lane) / step) * tolerance);
  let bad = 0;
  for (let i = 1; i < lane.length; i++) {
    const a = lane[i - 1];
    const b = lane[i];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    for (let s = 0; s < len; s += step) {
      const x = a.x + ux * s;
      const y = a.y + uy * s;
      const ok =
        isDrivable(x, y) && isDrivable(x - uy * margin, y + ux * margin) && isDrivable(x + uy * margin, y - ux * margin);
      if (!ok && ++bad > allowed) return false;
    }
  }
  return true;
}

/**
 * Largest lane count <= `maxLanes` whose every lane (centre +/- `margin` px
 * across, i.e. the car body) stays on drivable ground for all but `tolerance`
 * of its length. OSM's `lanes` is the carriageway's widest way, but each way is
 * painted at its own width, so the outer lanes of the maximum would run over
 * the pavement. 0 when even one centred lane leaves the road.
 */
export function fitLaneCount(
  centre: ReadonlyArray<Pt>,
  maxLanes: number,
  isDrivable: (x: number, y: number) => boolean,
  { step = 16, margin = 14, tolerance = 0.01 } = {},
): number {
  for (let n = Math.floor(maxLanes); n >= 1; n--) {
    let fits = true;
    for (let k = 0; k < n && fits; k++) {
      fits = staysOnRoad(offsetPolyline(centre, laneOffset(n, k)), isDrivable, step, margin, tolerance);
    }
    if (fits) return n;
  }
  return 0;
}

/** Along-lane interval lying within `radius` of `point` (straight-road approximation), or null. */
export function reservedStretch(lane: ReadonlyArray<Pt>, point: Pt, radius: number): [number, number] | null {
  const near = closestOnPolyline(lane, point);
  if (near.distance >= radius) return null;
  const half = Math.sqrt(radius * radius - near.distance * near.distance);
  return [near.along - half, near.along + half];
}

export interface LaneCar {
  /** Centre position along the lane, px. */
  dist: number;
  speed: number;
  cruise: number;
  length: number;
}

/**
 * Advance one lane's cars, sorted front first (descending `dist`), by `dtSec`.
 * Each car accelerates toward its cruise speed, eases off to keep
 * FOLLOW_HEADWAY_S behind the car ahead and never closes within MIN_GAP_PX of
 * its rear bumper. `stopLine` (lane px) holds back every car whose nose has not
 * crossed it yet; cars already past it drive on.
 */
export function stepLane(cars: ReadonlyArray<LaneCar>, dtSec: number, stopLine: number | null = null): void {
  let ahead: LaneCar | undefined;
  for (const car of cars) {
    const half = car.length / 2;
    let limit = ahead ? ahead.dist - ahead.length / 2 - MIN_GAP_PX - half : Infinity;
    if (stopLine !== null && car.dist + half <= stopLine) limit = Math.min(limit, stopLine - half);
    const target = Math.max(0, Math.min(car.cruise, (limit - car.dist) / FOLLOW_HEADWAY_S));
    car.speed = Math.min(target, car.speed + ACCEL_PX_S2 * dtSec);
    car.dist = Math.min(car.dist + car.speed * dtSec, Math.max(car.dist, limit));
    ahead = car;
  }
}

/** Clock hour [0, 24) from a day-night phase's start hour, the next phase's start hour and its 0..1 progress. */
export function hourOfDay(startHour: number, nextStartHour: number, progress: number): number {
  const span = (nextStartHour - startHour + 24) % 24 || 24;
  return (startHour + span * Math.min(1, Math.max(0, progress))) % 24;
}

/** Share of the car cap on the road by hour: Makati's morning and evening rush, a steady day, a near-empty night. */
const DENSITY_BY_HOUR: ReadonlyArray<readonly [number, number]> = [
  [0, 0.06], [5, 0.06], [6, 0.35], [7, 0.9], [8, 1], [9.5, 1], [11, 0.6],
  [16, 0.6], [17.5, 1], [19.5, 1], [21, 0.45], [23, 0.12], [24, 0.06],
];

export function trafficDensity(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  let prev: readonly [number, number] = [0, 0.06];
  for (const kf of DENSITY_BY_HOUR) {
    if (h <= kf[0]) {
      const span = kf[0] - prev[0];
      return span > 0 ? prev[1] + ((kf[1] - prev[1]) * (h - prev[0])) / span : kf[1];
    }
    prev = kf;
  }
  return prev[1];
}
