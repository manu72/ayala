import { describe, expect, it } from "vitest";
import { computeReachableCells, getCellKey } from "../../src/utils/mapExploration";

describe("computeReachableCells", () => {
  it("flood-fills only reachable, unblocked cells from the start cell", () => {
    const blocked = new Set([
      getCellKey(1, 0, 4),
      getCellKey(1, 1, 4),
      getCellKey(1, 2, 4),
    ]);

    const reachable = computeReachableCells({
      width: 4,
      height: 3,
      startX: 0,
      startY: 0,
      isBlocked: (x, y) => blocked.has(getCellKey(x, y, 4)),
    });

    expect([...reachable].sort((a, b) => a - b)).toEqual([
      getCellKey(0, 0, 4),
      getCellKey(0, 1, 4),
      getCellKey(0, 2, 4),
    ]);
  });

  it("returns an empty set when the start cell is blocked or out of bounds", () => {
    expect(
      computeReachableCells({
        width: 2,
        height: 2,
        startX: 0,
        startY: 0,
        isBlocked: (x, y) => x === 0 && y === 0,
      }),
    ).toEqual(new Set());

    expect(
      computeReachableCells({
        width: 2,
        height: 2,
        startX: 5,
        startY: 0,
        isBlocked: () => false,
      }),
    ).toEqual(new Set());
  });
});
