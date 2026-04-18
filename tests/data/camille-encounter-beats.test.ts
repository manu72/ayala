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
  CAMILLE_ENCOUNTER_5_PREDECISION_STEPS,
  CAMILLE_ENCOUNTER_5_JOURNEY_STEPS,
  CAMILLE_BEAT5_ACCEPT_LINE,
  CAMILLE_BEAT5_TIMEOUT_LINE,
  mergeCamilleBeatSteps,
  type EncounterStep,
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

describe("CAMILLE_ENCOUNTER_5 predecision / journey split (v0.3.2 decision gate)", () => {
  it("predecision + journey concatenation matches the legacy combined export", () => {
    expect([
      ...CAMILLE_ENCOUNTER_5_PREDECISION_STEPS,
      ...CAMILLE_ENCOUNTER_5_JOURNEY_STEPS,
    ]).toEqual(CAMILLE_ENCOUNTER_5_STEPS);
  });

  it("predecision phase has Camille ask the question (at least one spoken line)", () => {
    const spoken = CAMILLE_ENCOUNTER_5_PREDECISION_STEPS.filter(
      (s) => typeof s.spoken === "string" && s.spoken.trim().length > 0,
    );
    expect(spoken.length).toBeGreaterThan(0);
  });

  it("journey phase is narrator-only (no spoken lines — pickup tween plays underneath)", () => {
    for (const step of CAMILLE_ENCOUNTER_5_JOURNEY_STEPS) {
      expect(step.spoken).toBeUndefined();
    }
  });

  it("accept line is non-empty and does not embed a literal heart glyph (emote handles the heart visual)", () => {
    expect(CAMILLE_BEAT5_ACCEPT_LINE.trim().length).toBeGreaterThan(0);
    expect(CAMILLE_BEAT5_ACCEPT_LINE).not.toMatch(/❤|♥|💕|💖/);
  });

  it("timeout line is non-empty and reads gently (Camille stands down; beat re-arms)", () => {
    expect(CAMILLE_BEAT5_TIMEOUT_LINE.trim().length).toBeGreaterThan(0);
  });
});

/**
 * `mergeCamilleBeatSteps` produces the final step list that
 * `GameScene.playPairedBeat` consumes AND the `spokenRendered` list that
 * `GameScene.runCamilleEncounterBeat` persists to the conversation store.
 *
 * Invariants under test:
 *
 *  1. AI spoken lines map ONLY to steps where the author left a `spoken`
 *     slot. Narrator-only steps must stay narrator-only — otherwise
 *     Camille would speak over a beat the author intended to be her
 *     inner POV (e.g. beat 3 step [1] "You've seen other cats do this").
 *
 *  2. `spokenRendered` contains exactly the spoken lines the player will
 *     see bubble up, in order, authored fallbacks included. The
 *     conversation store writes this, so persisted history matches the
 *     on-screen experience byte-for-byte.
 *
 *  3. Missing AI lines (fewer AI responses than authored spoken slots)
 *     fall back to the authored `s.spoken`.
 *
 *  4. Surplus AI lines (more responses than authored slots) are dropped
 *     — the modal + bubble channel has a fixed length per beat.
 */
describe("mergeCamilleBeatSteps", () => {
  const beat3Steps: EncounterStep[] = CAMILLE_ENCOUNTER_BEATS[3].steps;

  it("null overrides → pure authored run, spokenRendered mirrors authored spoken slots", () => {
    const { steps, spokenRendered } = mergeCamilleBeatSteps(beat3Steps, null);
    expect(steps).toEqual(beat3Steps);
    expect(spokenRendered).toEqual(["There you are.", "Good girl."]);
  });

  it("empty overrides array behaves like null (pure authored run)", () => {
    const { steps, spokenRendered } = mergeCamilleBeatSteps(beat3Steps, []);
    expect(steps).toEqual(beat3Steps);
    expect(spokenRendered).toEqual(["There you are.", "Good girl."]);
  });

  it("AI lines fill authored-spoken slots positionally and NEVER bleed into narrator-only slots", () => {
    // Beat 3 asks AI for 2 spoken lines. Middle step is narrator-only;
    // both AI lines must land in the two AUTHORED-spoken slots (0 and 2),
    // not the narrator-only slot (1). Old positional merge collapsed
    // spoken and rendered the second AI line in the narrator-only slot.
    const { steps, spokenRendered } = mergeCamilleBeatSteps(beat3Steps, [
      "AI hello.",
      "AI goodbye.",
    ]);
    expect(steps[0]!.spoken).toBe("AI hello.");
    expect(steps[1]!.spoken).toBeUndefined();
    expect(steps[2]!.spoken).toBe("AI goodbye.");
    expect(spokenRendered).toEqual(["AI hello.", "AI goodbye."]);
  });

  it("narrator-only step narrators are preserved verbatim even with overrides present", () => {
    const { steps } = mergeCamilleBeatSteps(beat3Steps, ["x", "y"]);
    expect(steps.map((s) => s.narrator)).toEqual(beat3Steps.map((s) => s.narrator));
  });

  it("partial AI overrides → leading authored slots use AI, trailing ones fall back", () => {
    // AI returned only 1 line but beat 3 has 2 authored spoken slots.
    const { steps, spokenRendered } = mergeCamilleBeatSteps(beat3Steps, ["Just one."]);
    expect(steps[0]!.spoken).toBe("Just one.");
    expect(steps[1]!.spoken).toBeUndefined();
    expect(steps[2]!.spoken).toBe("Good girl.");
    expect(spokenRendered).toEqual(["Just one.", "Good girl."]);
  });

  it("surplus AI lines beyond authored-spoken capacity are dropped", () => {
    // Beat 3 has 2 authored spoken slots; AI returned 4 lines.
    const { steps, spokenRendered } = mergeCamilleBeatSteps(beat3Steps, [
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(spokenRendered).toEqual(["a", "b"]);
    expect(steps[0]!.spoken).toBe("a");
    expect(steps[1]!.spoken).toBeUndefined();
    expect(steps[2]!.spoken).toBe("b");
  });

  it("blank / whitespace-only AI lines fall back to authored spoken at the same slot", () => {
    // AIDialogueService already trims+filters empties before calling in,
    // but guard defensively so a regression upstream can't produce an
    // empty bubble.
    const { steps, spokenRendered } = mergeCamilleBeatSteps(beat3Steps, ["", "AI two."]);
    expect(steps[0]!.spoken).toBe("There you are.");
    expect(steps[2]!.spoken).toBe("AI two.");
    expect(spokenRendered).toEqual(["There you are.", "AI two."]);
  });

  it("all-narrator beat → spokenRendered is empty regardless of overrides", () => {
    const narratorOnly: EncounterStep[] = [
      { narrator: "a" },
      { narrator: "b" },
    ];
    const { steps, spokenRendered } = mergeCamilleBeatSteps(narratorOnly, ["x", "y"]);
    expect(steps).toEqual(narratorOnly);
    expect(spokenRendered).toEqual([]);
  });

  it("spokenRendered is always in the same order the bubbles will render (step order)", () => {
    // Regression guard: if the helper is ever refactored to collect
    // authored-spoken slots separately, ordering must still match
    // step index so persisted history reads left-to-right.
    const { steps, spokenRendered } = mergeCamilleBeatSteps(beat3Steps, ["first"]);
    const expected = steps.flatMap((s) => (s.spoken ? [s.spoken] : []));
    expect(spokenRendered).toEqual(expected);
  });

  it("returns a new steps array (does not mutate the authored source)", () => {
    const before = JSON.parse(JSON.stringify(beat3Steps));
    mergeCamilleBeatSteps(beat3Steps, ["a", "b"]);
    expect(beat3Steps).toEqual(before);
  });
});
