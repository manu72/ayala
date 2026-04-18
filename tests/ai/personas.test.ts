import { describe, it, expect } from "vitest";
import { AI_PERSONAS, CAT_PERSONAS, PERSONA_TIER } from "../../src/ai/personas";

const CAT_KEYS = [
  "Blacky",
  "Tiger",
  "Jayco",
  "Jayco Jr",
  "Fluffy",
  "Pedigree",
  "Ginger",
  "Ginger B",
];

const HUMAN_KEYS = ["Camille", "Manu", "Kish", "Rose", "Ben"];

describe("AI_PERSONAS", () => {
  it("defines all named AI cats with non-empty markdown", () => {
    for (const key of CAT_KEYS) {
      expect(AI_PERSONAS[key]?.length ?? 0).toBeGreaterThan(40);
    }
  });

  it("defines all named AI humans with non-empty markdown", () => {
    for (const key of HUMAN_KEYS) {
      expect(AI_PERSONAS[key]?.length ?? 0).toBeGreaterThan(40);
    }
  });

  it("exposes the cat-only alias for backward compatibility", () => {
    expect(CAT_PERSONAS).toBe(AI_PERSONAS);
  });
});

describe("PERSONA_TIER", () => {
  it("marks Camille as tier1 and the other humans as tier2", () => {
    expect(PERSONA_TIER["Camille"]).toBe("tier1");
    expect(PERSONA_TIER["Manu"]).toBe("tier2");
    expect(PERSONA_TIER["Kish"]).toBe("tier2");
    expect(PERSONA_TIER["Rose"]).toBe("tier2");
    expect(PERSONA_TIER["Ben"]).toBe("tier2");
  });

  it("marks the historically-deep cats (Blacky, Tiger, Jayco) as tier1", () => {
    expect(PERSONA_TIER["Blacky"]).toBe("tier1");
    expect(PERSONA_TIER["Tiger"]).toBe("tier1");
    expect(PERSONA_TIER["Jayco"]).toBe("tier1");
  });
});
