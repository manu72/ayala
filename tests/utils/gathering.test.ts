import { describe, expect, it } from "vitest";
import { FRINGE_MAX_PX, FRINGE_MIN_PX, INNER_RADIUS_PX, fringeStarts, gatheringSlots } from "../../src/utils/gathering";
import { seededRng } from "../../src/utils/forage";

const centre = { x: 1000, y: 1000 };
/** Distance in the ring's own (unsquashed) frame. */
const ringDist = (p: { x: number; y: number }) => Math.hypot(p.x - centre.x, (p.y - centre.y) / 0.82);

describe("gatheringSlots", () => {
  it("seats the named cats close and every other cat on a wider fringe, never on top of each other", () => {
    const { inner, fringe } = gatheringSlots(centre, 8, 30, seededRng(7));
    expect(inner).toHaveLength(8);
    expect(fringe).toHaveLength(30);
    for (const p of inner) expect(ringDist(p)).toBeCloseTo(INNER_RADIUS_PX, 5);
    for (const p of fringe) {
      expect(ringDist(p)).toBeGreaterThanOrEqual(FRINGE_MIN_PX - 1e-9);
      expect(ringDist(p)).toBeLessThanOrEqual(FRINGE_MAX_PX + 1e-9);
    }
    const all = [...inner, ...fringe];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) expect(Math.hypot(all[i]!.x - all[j]!.x, all[i]!.y - all[j]!.y)).toBeGreaterThan(10);
  });

  it("copes with nobody on the fringe", () => {
    expect(gatheringSlots(centre, 8, 0, seededRng(1)).fringe).toEqual([]);
  });
});

describe("fringeStarts", () => {
  it("starts after the first named cats and has everyone set off within the spread", () => {
    const starts = fringeStarts(24, 3500, 17_000, seededRng(3));
    expect(starts).toHaveLength(24);
    expect(Math.min(...starts)).toBeGreaterThanOrEqual(3500);
    expect(Math.max(...starts)).toBeLessThanOrEqual(3500 + 17_000 * 1.05);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});
