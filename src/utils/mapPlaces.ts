/**
 * Reads the generator's `places` object layer (traffic lanes, exits, zones,
 * crowd anchors, routes) into absolute world-pixel shapes, plus the small
 * polyline geometry the systems need. Pure: no Phaser dependency.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface MapPlace {
  name: string;
  type: string;
  x: number;
  y: number;
  /** Absolute world-px vertices for polyline objects. */
  polyline?: Pt[];
  /** Rectangle objects (zones). */
  rect?: { x: number; y: number; width: number; height: number };
  props: Record<string, unknown>;
}

/** Minimal shape of a parsed Tiled object (Phaser's TiledObject is compatible). */
export interface TiledObjectLike {
  name?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  point?: boolean;
  polyline?: ReadonlyArray<{ x: number; y: number }>;
  properties?: unknown;
}

/** Tiled properties arrive as [{name, value}] (or, from some tools, a plain object). */
export function tiledProps(raw: unknown): Record<string, unknown> {
  if (Array.isArray(raw)) {
    const out: Record<string, unknown> = {};
    for (const p of raw) {
      if (p && typeof p === "object" && typeof (p as { name?: unknown }).name === "string") {
        out[(p as { name: string }).name] = (p as { value?: unknown }).value;
      }
    }
    return out;
  }
  return raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
}

export function readPlaces(objects: ReadonlyArray<TiledObjectLike>): MapPlace[] {
  return objects.map((o) => {
    const x = o.x ?? 0;
    const y = o.y ?? 0;
    const place: MapPlace = { name: o.name ?? "", type: o.type ?? "", x, y, props: tiledProps(o.properties) };
    if (o.polyline && o.polyline.length > 0) {
      // Tiled polyline vertices are relative to the object's origin.
      place.polyline = o.polyline.map((p) => ({ x: x + p.x, y: y + p.y }));
    } else if (!o.point && (o.width ?? 0) > 0 && (o.height ?? 0) > 0) {
      place.rect = { x, y, width: o.width ?? 0, height: o.height ?? 0 };
    }
    return place;
  });
}

export const placesOfType = (places: ReadonlyArray<MapPlace>, type: string): MapPlace[] =>
  places.filter((p) => p.type === type);

export const placeNamed = (places: ReadonlyArray<MapPlace>, name: string): MapPlace | undefined =>
  places.find((p) => p.name === name);

export function pointInRect(p: Pt, r: { x: number; y: number; width: number; height: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

export function polylineLength(pts: ReadonlyArray<Pt>): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

/** Position and heading (radians) at `distance` px along the polyline, clamped to its ends. */
export function pointAlong(pts: ReadonlyArray<Pt>, distance: number): Pt & { angle: number } {
  const first = pts[0];
  if (!first) return { x: 0, y: 0, angle: 0 };
  let left = Math.max(0, distance);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (left <= seg || i === pts.length - 1) {
      const t = seg > 0 ? Math.min(1, left / seg) : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle };
    }
    left -= seg;
  }
  return { x: first.x, y: first.y, angle: 0 };
}

/** Closest point on the polyline to `p`, its distance, and how far along the line it lies. */
export function closestOnPolyline(pts: ReadonlyArray<Pt>, p: Pt): Pt & { distance: number; along: number } {
  let best = { x: pts[0]?.x ?? 0, y: pts[0]?.y ?? 0, distance: Infinity, along: 0 };
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < best.distance) best = { x, y, distance: d, along: walked + Math.sqrt(len2) * t };
    walked += Math.sqrt(len2);
  }
  return best;
}

/** Signed distance from `p` to the polyline: positive to the right of its direction of travel (x east, y south). */
export function offsetFromPolyline(pts: ReadonlyArray<Pt>, p: Pt): number {
  const near = closestOnPolyline(pts, p);
  const { angle } = pointAlong(pts, near.along);
  return (p.x - near.x) * -Math.sin(angle) + (p.y - near.y) * Math.cos(angle) >= 0 ? near.distance : -near.distance;
}
