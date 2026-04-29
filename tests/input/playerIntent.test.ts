import { describe, expect, it } from "vitest";
import {
  EMPTY_MOVEMENT_INTENT,
  mergeMovementIntents,
  vectorToMovementIntent,
} from "../../src/input/playerIntent";

describe("playerIntent", () => {
  it("returns neutral movement inside the dead zone", () => {
    expect(vectorToMovementIntent(3, 4, 10)).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
      run: false,
    });
  });

  it("maps a drag vector to cardinal direction flags", () => {
    expect(vectorToMovementIntent(30, -20, 10)).toEqual({
      up: true,
      down: false,
      left: false,
      right: true,
      run: false,
    });
  });

  it("merges keyboard and touch intent without losing either source", () => {
    expect(
      mergeMovementIntents(
        { ...EMPTY_MOVEMENT_INTENT, left: true },
        { ...EMPTY_MOVEMENT_INTENT, right: true, run: true },
      ),
    ).toEqual({
      up: false,
      down: false,
      left: true,
      right: true,
      run: true,
    });
  });
});
