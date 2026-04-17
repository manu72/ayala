import { describe, expect, it } from "vitest";
import { hasLineOfSightTiles } from "../../src/utils/lineOfSight";

describe("hasLineOfSightTiles", () => {
  const tileSize = 32;

  it("returns true when no tiles block", () => {
    const blocked = (_wx: number, _wy: number) => false;
    expect(hasLineOfSightTiles(0, 0, 100, 0, tileSize, blocked)).toBe(true);
  });

  it("returns false when midpoint hits a blocked tile", () => {
    const blocked = (wx: number, wy: number) => wx >= 48 && wx <= 80 && wy >= 0 && wy <= 32;
    expect(hasLineOfSightTiles(0, 16, 128, 16, tileSize, blocked)).toBe(false);
  });

  it("returns true for very short segments", () => {
    expect(hasLineOfSightTiles(0, 0, 10, 0, tileSize, () => false)).toBe(true);
  });

  describe("tileSize precondition", () => {
    const blocked = () => false;

    it("throws RangeError when tileSize is 0 (would hang the raymarch loop)", () => {
      expect(() => hasLineOfSightTiles(0, 0, 100, 0, 0, blocked)).toThrow(RangeError);
    });

    it("throws RangeError when tileSize is negative", () => {
      expect(() => hasLineOfSightTiles(0, 0, 100, 0, -16, blocked)).toThrow(RangeError);
    });

    it("throws RangeError when tileSize is NaN", () => {
      expect(() => hasLineOfSightTiles(0, 0, 100, 0, Number.NaN, blocked)).toThrow(RangeError);
    });

    it("throws RangeError when tileSize is Infinity", () => {
      expect(() => hasLineOfSightTiles(0, 0, 100, 0, Number.POSITIVE_INFINITY, blocked)).toThrow(
        RangeError,
      );
    });
  });
});
