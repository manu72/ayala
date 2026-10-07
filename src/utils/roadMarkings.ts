/**
 * Pure geometry for painted road markings (lane dashes, zebra crossings,
 * tyre-worn wheel tracks). World px, y down. Drawn by {@link RoadMarkings}.
 */
import { LANE_WIDTH_PX } from "./kerbsideDropoff";
import { laneOffset, offsetPolyline } from "./trafficLanes";
import type { Pt } from "./mapPlaces";

export type Segment = readonly [Pt, Pt];
export type Quad = readonly [Pt, Pt, Pt, Pt];

/** 16 px per metre: dashes 3 m, gaps 4.5 m (urban lane lines). */
export const DASH_PX = 48;
export const GAP_PX = 72;

/** Dashes along a polyline, starting with a full dash at its first point. */
export function dashSegments(pts: ReadonlyArray<Pt>, dashPx = DASH_PX, gapPx = GAP_PX): Segment[] {
  const out: Segment[] = [];
  const period = dashPx + gapPx;
  let travelled = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    // walk this segment in dash/gap pieces
    let s = 0;
    while (s < len) {
      const phase = (travelled + s) % period;
      if (phase < dashPx) {
        const end = Math.min(len, s + (dashPx - phase));
        out.push([{ x: a.x + ux * s, y: a.y + uy * s }, { x: a.x + ux * end, y: a.y + uy * end }]);
        s = end;
      } else {
        s += period - phase;
      }
    }
    travelled += len;
  }
  return out;
}

/** Lines between neighbouring lanes of one carriageway (empty for a single lane). */
export function laneDividers(centre: ReadonlyArray<Pt>, lanes: number): Pt[][] {
  const out: Pt[][] = [];
  for (let k = 0; k + 1 < lanes; k++) out.push(offsetPolyline(centre, (laneOffset(lanes, k) + laneOffset(lanes, k + 1)) / 2));
  return out;
}

/** The two wheel tracks of every lane: where tyres polish the asphalt. */
export function wheelTracks(centre: ReadonlyArray<Pt>, lanes: number): Pt[][] {
  const out: Pt[][] = [];
  const half = LANE_WIDTH_PX * 0.26;
  for (let k = 0; k < lanes; k++) {
    const off = laneOffset(lanes, k);
    out.push(offsetPolyline(centre, off - half), offsetPolyline(centre, off + half));
  }
  return out;
}

/**
 * Zebra bars across a crossing line: 0.5 m wide every 1 m, each 3 m long and
 * parallel to the traffic (perpendicular to the crossing).
 */
export function zebraBars(crossing: ReadonlyArray<Pt>, barPx = 8, stepPx = 16, lengthPx = 48): Quad[] {
  const out: Quad[] = [];
  for (let i = 1; i < crossing.length; i++) {
    const a = crossing[i - 1];
    const b = crossing[i];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < stepPx) continue;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len; // along the crossing
    const nx = -uy, ny = ux; // along the traffic
    for (let s = stepPx / 2; s + barPx / 2 <= len; s += stepPx) {
      const cx = a.x + ux * s, cy = a.y + uy * s;
      const hw = barPx / 2, hl = lengthPx / 2;
      out.push([
        { x: cx - ux * hw - nx * hl, y: cy - uy * hw - ny * hl },
        { x: cx + ux * hw - nx * hl, y: cy + uy * hw - ny * hl },
        { x: cx + ux * hw + nx * hl, y: cy + uy * hw + ny * hl },
        { x: cx - ux * hw + nx * hl, y: cy - uy * hw + ny * hl },
      ]);
    }
  }
  return out;
}
