import { describe, expect, it } from "vitest";
import { flickStartsOnCat, isPawFlick, PAW_FLICK, pawFlickFacing } from "../../src/utils/pawFlick";

describe("pawFlick (ATG-008)", () => {
  const cat = { x: 400, y: 300 };

  it("only starts on Mamma Cat", () => {
    expect(flickStartsOnCat(cat, { x: 400 + PAW_FLICK.START_RADIUS, y: 300 })).toBe(true);
    expect(flickStartsOnCat(cat, { x: 400 + PAW_FLICK.START_RADIUS + 1, y: 300 })).toBe(false);
  });

  it("needs enough travel, quickly enough", () => {
    const start = { x: 400, y: 300 };
    expect(isPawFlick(start, { x: 400 + PAW_FLICK.MIN_DISTANCE, y: 300 }, PAW_FLICK.MAX_MS)).toBe(true);
    expect(isPawFlick(start, { x: 400 + PAW_FLICK.MIN_DISTANCE - 1, y: 300 }, 50)).toBe(false); // a tap's wobble
    expect(isPawFlick(start, { x: 500, y: 300 }, PAW_FLICK.MAX_MS + 1)).toBe(false); // a slow drag
  });

  it("swats the way the flick went; mostly vertical keeps her facing", () => {
    const start = { x: 400, y: 300 };
    expect(pawFlickFacing(start, { x: 440, y: 320 })).toBe("e");
    expect(pawFlickFacing(start, { x: 360, y: 280 })).toBe("w");
    expect(pawFlickFacing(start, { x: 405, y: 260 })).toBeNull();
  });
});
