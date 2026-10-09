import { describe, expect, it } from "vitest";
import { comfortCeiling, comfortFloor, hidesWhenScared, mammaAlarmRadius, readNewcomers, SETTLED } from "../../src/utils/newcomerCat";

describe("newcomerCat", () => {
  it("settles over days: at most 35 a day with Mamma Cat's help, at least 15 a day alone", () => {
    expect([0, 1, 2, 5].map((d) => comfortCeiling(10, 10 + d))).toEqual([35, 70, SETTLED, SETTLED]);
    expect([0, 1, 2, 7].map((d) => comfortFloor(10, 10 + d))).toEqual([0, 15, 30, SETTLED]);
    expect(comfortFloor(10, 8)).toBe(0); // a save from another run
  });

  it("takes fright at Mamma Cat only while she moves: less crouched, more running, less as it settles", () => {
    const m = (isMoving: boolean, isCrouching = false, isRunning = false) => ({ isMoving, isCrouching, isRunning });
    expect(mammaAlarmRadius(m(false), 0)).toBe(0);
    expect(mammaAlarmRadius(m(true), 0)).toBe(120);
    expect(mammaAlarmRadius(m(true, true), 0)).toBe(44);
    expect(mammaAlarmRadius(m(true, false, true), 0)).toBe(180);
    expect(mammaAlarmRadius(m(true), 100)).toBe(60);
  });

  it("splits newcomers into hiders and freezers by index", () => {
    expect([24, 25, 26].map(hidesWhenScared)).toEqual([true, false, true]);
  });

  it("reads saved newcomers defensively", () => {
    expect(readNewcomers(undefined).size).toBe(0);
    expect(readNewcomers("x").size).toBe(0);
    const read = readNewcomers({
      24: { comfort: 140, since: 1, x: 5, y: 6 },
      25: { comfort: "a", since: 1, x: 5, y: 6 },
      "-1": { comfort: 1, since: 1, x: 1, y: 1 },
      1000: { comfort: 1, since: 1, x: 1, y: 1 }, // Simba's number: the street colony's, never a newcomer's
      b: null,
    });
    expect([...read]).toEqual([[24, { comfort: SETTLED, since: 1, x: 5, y: 6 }]]);
  });
});
