/**
 * Open water: the PSE pond, the McMicking water-curtain pool and the Starbucks
 * waterfall, where the real Ayala cats drink. Their water tiles carry the
 * tileset property `water` (scripts/generate-map.mjs) and collide; a cat drinks
 * standing beside them. Pure helpers, no Phaser.
 */
import type { Pt } from "./mapPlaces";

export function isWaterTile(tile: { properties?: unknown } | null | undefined): boolean {
  return (tile?.properties as { water?: unknown } | null | undefined)?.water === true;
}

/** Where a cat can stand to drink (a walkable cell's centre) and the water it faces. */
export interface DrinkSpot extends Pt {
  water: Pt;
}

/** Every walkable cell 4-adjacent to open water, as world-px cell centres facing that water. */
export function drinkSpots(
  width: number,
  height: number,
  tileSize: number,
  isWater: (cx: number, cy: number) => boolean,
  isWalkable: (cx: number, cy: number) => boolean,
): DrinkSpot[] {
  const centre = (c: number) => c * tileSize + tileSize / 2;
  const spots: DrinkSpot[] = [];
  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      if (!isWalkable(cx, cy)) continue;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        const wx = cx + dx;
        const wy = cy + dy;
        if (wx < 0 || wy < 0 || wx >= width || wy >= height || !isWater(wx, wy)) continue;
        spots.push({ x: centre(cx), y: centre(cy), water: { x: centre(wx), y: centre(wy) } });
        break;
      }
    }
  }
  return spots;
}

/** The nearest point of open water within `reach` px of `p` (its tile's closest edge point), or null. */
export function waterWithin(p: Pt, reach: number, tileSize: number, isWater: (cx: number, cy: number) => boolean): Pt | null {
  let best: Pt | null = null;
  let bestDist = reach;
  const span = Math.ceil(reach / tileSize);
  const pcx = Math.floor(p.x / tileSize);
  const pcy = Math.floor(p.y / tileSize);
  for (let cy = pcy - span; cy <= pcy + span; cy++) {
    for (let cx = pcx - span; cx <= pcx + span; cx++) {
      if (!isWater(cx, cy)) continue;
      const x = Math.max(cx * tileSize, Math.min(p.x, (cx + 1) * tileSize));
      const y = Math.max(cy * tileSize, Math.min(p.y, (cy + 1) * tileSize));
      const d = Math.hypot(x - p.x, y - p.y);
      if (d <= bestDist) {
        best = { x, y };
        bestDist = d;
      }
    }
  }
  return best;
}
