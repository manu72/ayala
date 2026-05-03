import { describe, expect, it } from "vitest";
import {
  FEEDERS_UNLOCK_DAY,
  getEffectiveHumanPhase,
  isFeederHumanType,
} from "../../src/utils/humanSpawnPolicy";

describe("human spawn policy", () => {
  it("treats Rose and Ben as feeder-class humans", () => {
    expect(isFeederHumanType("feeder")).toBe(true);
    expect(isFeederHumanType("ben")).toBe(true);
    expect(isFeederHumanType("jogger")).toBe(false);
    expect(isFeederHumanType("dogwalker")).toBe(false);
    expect(isFeederHumanType("camille")).toBe(false);
  });

  it("keeps feeder-class humans inactive before Day 3", () => {
    for (const type of ["feeder", "ben"] as const) {
      for (const phase of ["dawn", "day", "evening", "night"] as const) {
        expect(getEffectiveHumanPhase(type, phase, 1)).toBe("day");
        expect(getEffectiveHumanPhase(type, phase, FEEDERS_UNLOCK_DAY - 1)).toBe("day");
      }
    }
  });

  it("allows feeder-class humans to follow their normal schedule from Day 3", () => {
    for (const type of ["feeder", "ben"] as const) {
      expect(getEffectiveHumanPhase(type, "dawn", FEEDERS_UNLOCK_DAY)).toBe("dawn");
      expect(getEffectiveHumanPhase(type, "evening", FEEDERS_UNLOCK_DAY)).toBe("evening");
      expect(getEffectiveHumanPhase(type, "dawn", FEEDERS_UNLOCK_DAY + 1)).toBe("dawn");
    }
  });

  it("does not alter non-feeder human phases", () => {
    for (const type of ["jogger", "dogwalker", "camille", "manu", "kish", "snatcher", "snatcher2"] as const) {
      expect(getEffectiveHumanPhase(type, "dawn", 1)).toBe("dawn");
      expect(getEffectiveHumanPhase(type, "evening", 2)).toBe("evening");
      expect(getEffectiveHumanPhase(type, "night", 1)).toBe("night");
    }
  });
});
