import { describe, expect, it } from "vitest";
import { describeMammaCatCondition, mammaCatCondition } from "../../src/utils/mammaCatCondition";

describe("describeMammaCatCondition", () => {
  it("reads hunger and thirst as fullness: full and rested is simply well", () => {
    expect(describeMammaCatCondition(100, 100, 100)).toBe("She seems well.");
    expect(describeMammaCatCondition(60, 60, 60)).toBe("She seems well.");
  });

  it("uses mild words below 60 and strong words below 30", () => {
    expect(describeMammaCatCondition(59, 100, 100)).toBe("She is a little hungry.");
    expect(describeMammaCatCondition(29, 100, 100)).toBe("She is very hungry.");
    expect(describeMammaCatCondition(100, 45, 100)).toBe("She is a little thirsty.");
    expect(describeMammaCatCondition(100, 0, 100)).toBe("She is very thirsty.");
    expect(describeMammaCatCondition(100, 100, 59)).toBe("She is tired.");
    expect(describeMammaCatCondition(100, 100, 29)).toBe("She is exhausted.");
  });

  it("lists several conditions in plain English and never prints a stat number", () => {
    expect(describeMammaCatCondition(20, 50, 10)).toBe("She is very hungry, a little thirsty and exhausted.");
    expect(describeMammaCatCondition(91.43500000000002, 12.5, 40)).toBe("She is very thirsty and tired.");
  });

  it("returns an empty condition when nothing is notable", () => {
    expect(mammaCatCondition(80, 80, 80)).toBe("");
    expect(mammaCatCondition(40, 80, 80)).toBe("a little hungry");
  });
});
