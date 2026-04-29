import { describe, expect, it } from "vitest";
import { applyLifeLoss, DEFAULT_LIVES, MAX_LIVES, normaliseLives } from "../../src/utils/lifeFlow";

describe("normaliseLives", () => {
  it("keeps lives as an integer within the playable range", () => {
    expect(normaliseLives(2)).toBe(2);
    expect(normaliseLives(2.8)).toBe(2);
    expect(normaliseLives(99)).toBe(MAX_LIVES);
    expect(normaliseLives(-1)).toBe(0);
  });

  it("falls back to default lives for non-numeric values", () => {
    expect(normaliseLives(Number.NaN)).toBe(DEFAULT_LIVES);
    expect(normaliseLives("3")).toBe(DEFAULT_LIVES);
  });
});

describe("applyLifeLoss", () => {
  it("decrements non-final lives and allows the run to continue", () => {
    expect(applyLifeLoss(3)).toEqual({ lives: 2, gameOver: false });
  });

  it("reports game over on the final life and never goes below zero", () => {
    expect(applyLifeLoss(1)).toEqual({ lives: 0, gameOver: true });
    expect(applyLifeLoss(0)).toEqual({ lives: 0, gameOver: true });
  });
});
