import { describe, it, expect } from "vitest";
import { CAT_PERSONAS } from "../../src/ai/personas";

const EXPECTED_KEYS = [
  "Blacky",
  "Tiger",
  "Jayco",
  "Jayco Jr",
  "Fluffy",
  "Pedigree",
  "Ginger",
  "Ginger B",
];

describe("CAT_PERSONAS", () => {
  it("defines all named AI cats with non-empty markdown", () => {
    for (const key of EXPECTED_KEYS) {
      expect(CAT_PERSONAS[key]?.length ?? 0).toBeGreaterThan(40);
    }
  });
});
