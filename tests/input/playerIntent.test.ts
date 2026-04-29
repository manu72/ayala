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

  it.each([
    ["east", 30, 0, { up: false, down: false, left: false, right: true, run: false }],
    ["west", -30, 0, { up: false, down: false, left: true, right: false, run: false }],
    ["north", 0, -30, { up: true, down: false, left: false, right: false, run: false }],
    ["south", 0, 30, { up: false, down: true, left: false, right: false, run: false }],
  ])("maps a pure %s joystick drag to a cardinal direction", (_label, dx, dy, intent) => {
    expect(vectorToMovementIntent(dx, dy, 10)).toEqual(intent);
  });

  it("uses only the radial dead zone before deriving directions from signs", () => {
    expect(vectorToMovementIntent(8, -8, 10)).toEqual({
      up: true,
      down: false,
      left: false,
      right: true,
      run: false,
    });
  });

  it("snaps near-cardinal joystick drags to a single axis", () => {
    expect(vectorToMovementIntent(30, 6, 10)).toEqual({
      up: false,
      down: false,
      left: false,
      right: true,
      run: false,
    });
    expect(vectorToMovementIntent(-5, -32, 10)).toEqual({
      up: true,
      down: false,
      left: false,
      right: false,
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
