import { describe, expect, it } from "vitest";
import { nightLevel } from "../../src/utils/nightLevel";

describe("nightLevel", () => {
  it("is dark at night, light by day, and ramps through evening and dawn", () => {
    expect(nightLevel("night", 0.5)).toBe(1);
    expect(nightLevel("day", 0.5)).toBe(0);
    expect(nightLevel("evening", 0)).toBe(0);
    expect(nightLevel("evening", 1)).toBe(nightLevel("night", 0)); // no jump at the boundary
    expect(nightLevel("dawn", 0)).toBe(1);
    expect(nightLevel("dawn", 0.6)).toBe(0);
    const ramp = [0.4, 0.6, 0.8].map((p) => nightLevel("evening", p));
    expect(ramp[0]).toBeLessThan(ramp[1] ?? 0);
    expect(ramp[1]).toBeLessThan(ramp[2] ?? 0);
  });
});
