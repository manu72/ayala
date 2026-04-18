/**
 * Invariants for the Camille encounter beats data.
 *
 * These tests are the contract that `GameScene.playPairedBeat` relies
 * on — if any of them fail, the paired narrator+spoken bubble loop
 * will either render empty bubbles, blank narrator lines, or collide
 * the two surfaces together.
 */
import { describe, expect, it } from "vitest";
import {
  CAMILLE_ENCOUNTER_BEATS,
  CAMILLE_ENCOUNTER_5_STEPS,
} from "../../src/data/camille-encounter-beats";

describe("CAMILLE_ENCOUNTER_BEATS (beats 2–4)", () => {
  const ENCOUNTER_NUMBERS = [2, 3, 4] as const;

  it.each(ENCOUNTER_NUMBERS)("beat %i has a non-empty objective for the LLM", (n) => {
    const beat = CAMILLE_ENCOUNTER_BEATS[n];
    expect(beat.objective).toBeTypeOf("string");
    expect(beat.objective.trim().length).toBeGreaterThan(0);
  });

  it.each(ENCOUNTER_NUMBERS)("beat %i has at least one step", (n) => {
    const beat = CAMILLE_ENCOUNTER_BEATS[n];
    expect(beat.steps.length).toBeGreaterThan(0);
  });

  it.each(ENCOUNTER_NUMBERS)("beat %i — every step has a non-empty narrator line", (n) => {
    for (const step of CAMILLE_ENCOUNTER_BEATS[n].steps) {
      expect(step.narrator).toBeTypeOf("string");
      expect(step.narrator.trim().length).toBeGreaterThan(0);
    }
  });

  it.each(ENCOUNTER_NUMBERS)(
    "beat %i — spoken lines (when present) are non-empty and never equal the narrator",
    (n) => {
      for (const step of CAMILLE_ENCOUNTER_BEATS[n].steps) {
        if (step.spoken === undefined) continue;
        expect(step.spoken.trim().length).toBeGreaterThan(0);
        // If narrator === spoken, the modal + bubble would visually
        // echo each other, which would defeat the whole paired design.
        expect(step.spoken).not.toBe(step.narrator);
      }
    },
  );

  it.each(ENCOUNTER_NUMBERS)(
    "beat %i — at least one step has an authored spoken fallback (so the bubble surface is exercised even when AI fails)",
    (n) => {
      const hasSpoken = CAMILLE_ENCOUNTER_BEATS[n].steps.some(
        (s) => typeof s.spoken === "string" && s.spoken.trim().length > 0,
      );
      expect(hasSpoken).toBe(true);
    },
  );
});

describe("CAMILLE_ENCOUNTER_5_STEPS", () => {
  it("has at least one step", () => {
    expect(CAMILLE_ENCOUNTER_5_STEPS.length).toBeGreaterThan(0);
  });

  it("every step has a non-empty narrator line", () => {
    for (const step of CAMILLE_ENCOUNTER_5_STEPS) {
      expect(step.narrator.trim().length).toBeGreaterThan(0);
    }
  });

  it("spoken lines (when present) are non-empty and never equal the narrator", () => {
    for (const step of CAMILLE_ENCOUNTER_5_STEPS) {
      if (step.spoken === undefined) continue;
      expect(step.spoken.trim().length).toBeGreaterThan(0);
      expect(step.spoken).not.toBe(step.narrator);
    }
  });

  it("includes at least one Camille-spoken line (beat-5 handoff must give her a voice)", () => {
    const spokenCount = CAMILLE_ENCOUNTER_5_STEPS.filter(
      (s) => typeof s.spoken === "string",
    ).length;
    expect(spokenCount).toBeGreaterThan(0);
  });
});
