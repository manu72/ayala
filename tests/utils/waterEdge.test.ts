import { describe, expect, it } from "vitest";
import { drinkSpots, isWaterTile, waterWithin } from "../../src/utils/waterEdge";

// 5 x 4 cells of 32 px: water at (2,1) and (2,2), a wall at (3,1)
const water = new Set(["2,1", "2,2"]);
const wall = new Set(["3,1"]);
const isWater = (cx: number, cy: number) => water.has(`${cx},${cy}`);
const isWalkable = (cx: number, cy: number) => !water.has(`${cx},${cy}`) && !wall.has(`${cx},${cy}`);
const centre = (c: number) => c * 32 + 16;

describe("open water", () => {
  it("reads the tileset's water property", () => {
    expect(isWaterTile({ properties: { water: true, collides: true } })).toBe(true);
    expect(isWaterTile({ properties: { collides: true } })).toBe(false);
    expect(isWaterTile(null)).toBe(false);
  });

  it("lists every walkable cell beside the water, each facing water next to it", () => {
    const spots = drinkSpots(5, 4, 32, isWater, isWalkable);
    const cells = spots.map((s) => [(s.x - 16) / 32, (s.y - 16) / 32]);
    expect(cells).toEqual([[2, 0], [1, 1], [1, 2], [3, 2], [2, 3]]); // (3,1) is a wall
    for (const s of spots) {
      expect(isWater((s.water.x - 16) / 32, (s.water.y - 16) / 32)).toBe(true);
      expect(Math.hypot(s.water.x - s.x, s.water.y - s.y)).toBe(32);
    }
  });

  it("finds the nearest water edge within reach, and nothing beyond it", () => {
    // standing in cell (1,1), whose east edge is the water's west edge
    expect(waterWithin({ x: centre(1), y: centre(1) }, 22, 32, isWater)).toEqual({ x: 64, y: 48 });
    expect(waterWithin({ x: centre(0), y: centre(1) }, 22, 32, isWater)).toBeNull(); // 48 px away
  });
});
