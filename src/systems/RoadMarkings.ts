import type Phaser from "phaser";
import { placesOfType, type MapPlace, type Pt } from "../utils/mapPlaces";
import { dashSegments, laneDividers, wheelTracks, zebraBars } from "../utils/roadMarkings";

const PAINT = 0xeceae2;
const MARKINGS_DEPTH = 1; // over the ground art, under people (3) and cars (4)
/** Markings are bucketed into square chunks; only chunks near the camera are drawn. */
const CHUNK_PX = 1024;
/** A chunk's marks may poke this far past its square (dash / bar length). */
const CHUNK_MARGIN_PX = 128;

export interface RoadMarkingsOptions {
  /** Fitted lane count for a `traffic` place (TrafficSystem.lanesFor). */
  lanesFor: (placeName: string) => number;
  /** True on asphalt; marks are only painted where a car may drive. */
  isDrivable: (x: number, y: number) => boolean;
}

interface Chunk {
  x: number;
  y: number;
  wear: Phaser.GameObjects.Graphics;
  paint: Phaser.GameObjects.Graphics;
  shown: boolean;
}

/**
 * Painted road markings along the real carriageways: dashed lane lines,
 * zebra crossings (OSM `crossing` places) and tyre-polished wheel tracks.
 * Drawn once into static Graphics, bucketed by map chunk so only the few
 * chunks around the camera render each frame (call {@link update}). Purely visual.
 */
export class RoadMarkings {
  private readonly chunks = new Map<string, Chunk>();

  constructor(
    private readonly scene: Phaser.Scene,
    places: ReadonlyArray<MapPlace>,
    options: RoadMarkingsOptions,
  ) {
    const onRoad = (p: Pt) => options.isDrivable(p.x, p.y);

    for (const place of placesOfType(places, "traffic")) {
      const centre = place.polyline;
      const lanes = options.lanesFor(place.name);
      if (!centre || centre.length < 2 || lanes < 1) continue;
      for (const track of wheelTracks(centre, lanes))
        for (let i = 1; i < track.length; i++) {
          const a = track[i - 1];
          const b = track[i];
          if (!a || !b || !onRoad(a) || !onRoad(b)) continue;
          // long OSM segments: split so every piece lands in the chunk it crosses
          const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CHUNK_PX / 2)));
          for (let k = 0; k < n; k++) {
            const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
            const q = { x: a.x + ((b.x - a.x) * (k + 1)) / n, y: a.y + ((b.y - a.y) * (k + 1)) / n };
            this.chunkAt(p, q).wear.lineBetween(p.x, p.y, q.x, q.y);
          }
        }
      for (const divider of laneDividers(centre, lanes))
        for (const [a, b] of dashSegments(divider))
          if (onRoad(a) && onRoad(b)) this.chunkAt(a, b).paint.lineBetween(a.x, a.y, b.x, b.y);
    }

    for (const place of placesOfType(places, "crossing")) {
      if (!place.polyline) continue;
      for (const [p0, p1, p2, p3] of zebraBars(place.polyline)) {
        const mid = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
        if (![p0, p1, p2, p3, mid].every(onRoad)) continue;
        this.chunkAt(mid, mid)
          .paint.fillTriangle(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y)
          .fillTriangle(p0.x, p0.y, p2.x, p2.y, p3.x, p3.y);
      }
    }
    for (const c of this.chunks.values()) this.show(c, false);
  }

  /** Show only the chunks overlapping the camera view. Call once per frame. */
  update(): void {
    const v = this.scene.cameras.main.worldView;
    for (const c of this.chunks.values()) {
      const near =
        c.x - CHUNK_MARGIN_PX < v.right && c.x + CHUNK_PX + CHUNK_MARGIN_PX > v.x && c.y - CHUNK_MARGIN_PX < v.bottom && c.y + CHUNK_PX + CHUNK_MARGIN_PX > v.y;
      if (near !== c.shown) this.show(c, near);
    }
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  destroy(): void {
    for (const c of this.chunks.values()) {
      c.wear.destroy();
      c.paint.destroy();
    }
    this.chunks.clear();
  }

  private show(c: Chunk, shown: boolean): void {
    c.shown = shown;
    c.wear.setVisible(shown);
    c.paint.setVisible(shown);
  }

  /** The chunk owning the midpoint of a mark. */
  private chunkAt(a: Pt, b: Pt): Chunk {
    const cx = Math.floor((a.x + b.x) / 2 / CHUNK_PX), cy = Math.floor((a.y + b.y) / 2 / CHUNK_PX);
    const key = `${cx},${cy}`;
    let c = this.chunks.get(key);
    if (!c) {
      // wear under paint in every chunk
      const wear = this.scene.add.graphics().setDepth(MARKINGS_DEPTH).lineStyle(7, 0x000000, 0.07);
      const paint = this.scene.add.graphics().setDepth(MARKINGS_DEPTH + 0.01).lineStyle(3, PAINT, 0.82).fillStyle(PAINT, 0.85);
      c = { x: cx * CHUNK_PX, y: cy * CHUNK_PX, wear, paint, shown: true };
      this.chunks.set(key, c);
    }
    return c;
  }
}
