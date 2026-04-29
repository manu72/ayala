import { describe, expect, it } from "vitest";
import {
  DEFAULT_RUN_SCORE_STATE,
  ScoringSystem,
  calculateTerritoryScore,
} from "../../src/systems/ScoringSystem";
import { SCORING_WEIGHTS } from "../../src/config/scoringWeights";

describe("calculateTerritoryScore", () => {
  it("uses diminishing returns for territory explored", () => {
    const max = SCORING_WEIGHTS.territoryMax;

    expect(calculateTerritoryScore(0, max)).toBe(0);
    expect(calculateTerritoryScore(25, max)).toBe(Math.floor(Math.sqrt(0.25) * max));
    expect(calculateTerritoryScore(50, max)).toBe(Math.floor(Math.sqrt(0.5) * max));
    expect(calculateTerritoryScore(100, max)).toBe(max);
  });

  it("clamps coverage before scoring", () => {
    const max = SCORING_WEIGHTS.territoryMax;

    expect(calculateTerritoryScore(-20, max)).toBe(0);
    expect(calculateTerritoryScore(140, max)).toBe(max);
  });
});

describe("ScoringSystem", () => {
  it("starts with the default run state", () => {
    const scoring = new ScoringSystem();

    expect(scoring.toJSON()).toEqual(DEFAULT_RUN_SCORE_STATE);
    expect(scoring.total).toBe(0);
  });

  it("computes weighted social, survival, discovery, and territory points", () => {
    const scoring = new ScoringSystem();

    scoring.recordCatEngagement(2);
    scoring.recordHumanEngagement(2);
    scoring.recordNightSurvived({ clean: true });
    scoring.addDistance(2_500);
    scoring.setTotalExplorableCells(100);
    for (let cell = 0; cell < 25; cell += 1) scoring.visitCell(cell);
    scoring.setCloseFriendsMade(2);
    scoring.recordDumpedPetComforted(1);
    scoring.discoverFoodSource("fountain:10:20");

    const breakdown = scoring.getBreakdown();

    expect(breakdown.catEngagement.points).toBe(2 * SCORING_WEIGHTS.catEngagement);
    expect(breakdown.humanEngagement.points).toBe(2 * SCORING_WEIGHTS.humanEngagement);
    expect(breakdown.cleanNights.points).toBe(SCORING_WEIGHTS.cleanNight);
    expect(breakdown.nightsSurvived.points).toBe(SCORING_WEIGHTS.nightSurvived);
    expect(breakdown.distanceTravelled.points).toBe(2 * SCORING_WEIGHTS.distancePerThousandPx);
    expect(breakdown.territoryExplored.percent).toBe(25);
    expect(breakdown.territoryExplored.points).toBe(Math.floor(Math.sqrt(0.25) * SCORING_WEIGHTS.territoryMax));
    expect(breakdown.closeFriends.points).toBe(2 * SCORING_WEIGHTS.closeFriend);
    expect(breakdown.dumpedPetsComforted.points).toBe(SCORING_WEIGHTS.dumpedPetComforted);
    expect(breakdown.foodSourcesDiscovered.points).toBe(SCORING_WEIGHTS.foodSourceDiscovered);
    expect(scoring.total).toBe(
      Object.values(breakdown).reduce((sum, item) => sum + item.points, 0),
    );
  });

  it("serializes sets as stable arrays and restores them defensively", () => {
    const scoring = new ScoringSystem();

    scoring.visitCell(9);
    scoring.visitCell(3);
    scoring.visitCell(9);
    scoring.discoverFoodSource("water_bowl:1:2");
    scoring.discoverFoodSource("water_bowl:1:2");
    scoring.recordDumpedPetComforted(2);
    scoring.recordDumpedPetComforted(2);

    expect(scoring.toJSON().visitedCells).toEqual([3, 9]);
    expect(scoring.toJSON().foodSourcesDiscovered).toEqual(["water_bowl:1:2"]);
    expect(scoring.toJSON().dumpedPetsComforted).toEqual([2]);

    const restored = new ScoringSystem();
    restored.fromJSON({
      ...DEFAULT_RUN_SCORE_STATE,
      visitedCells: [4, 4, -1, Number.NaN, 2.8],
      foodSourcesDiscovered: ["fountain:1:2", "", "fountain:1:2"],
      dumpedPetsComforted: [1, 1, 3, 99],
    });

    expect(restored.toJSON().visitedCells).toEqual([2, 4]);
    expect(restored.toJSON().foodSourcesDiscovered).toEqual(["fountain:1:2"]);
    expect(restored.toJSON().dumpedPetsComforted).toEqual([1, 3]);
  });

  it("records trust events without double-counting survival or suspended setup", () => {
    const scoring = new ScoringSystem();

    scoring.recordTrustEvent({ type: "cat:first-conversation", catName: "Tiger", globalDelta: 5, catDelta: 10 });
    scoring.recordTrustEvent({ type: "cat:seen-eating", globalDelta: 1 });
    scoring.recordTrustEvent({ type: "survival:day", globalDelta: 3 });
    scoring.suspend();
    scoring.recordTrustEvent({ type: "cat:return-conversation", catName: "Tiger", globalDelta: 2, catDelta: 5 });
    scoring.resume();

    expect(scoring.toJSON().catEngagements).toBe(2);
    expect(scoring.toJSON().nightsSurvived).toBe(0);
  });

  it("persists run snatch count without adding points to the score", () => {
    const scoring = new ScoringSystem();

    scoring.recordSnatch();
    scoring.recordSnatch();

    expect(scoring.toJSON().runSnatchCount).toBe(2);
    expect(scoring.total).toBe(0);

    const restored = new ScoringSystem(scoring.toJSON());
    expect(restored.toJSON().runSnatchCount).toBe(2);
    expect(restored.total).toBe(0);
  });

  it("ignores invalid distance deltas", () => {
    const scoring = new ScoringSystem();

    scoring.addDistance(999);
    scoring.addDistance(-20);
    scoring.addDistance(Number.NaN);
    scoring.addDistance(Number.POSITIVE_INFINITY);
    scoring.addDistance(1);

    expect(scoring.toJSON().distanceTravelledPx).toBe(1000);
    expect(scoring.getBreakdown().distanceTravelled.points).toBe(SCORING_WEIGHTS.distancePerThousandPx);
  });

  it("suspends direct scoring events during setup", () => {
    const scoring = new ScoringSystem();

    scoring.suspend();
    scoring.recordCatEngagement();
    scoring.recordHumanEngagement();
    scoring.recordNightSurvived({ clean: true });
    scoring.recordSnatch();
    scoring.addDistance(1000);
    scoring.visitCell(1);
    scoring.recordDumpedPetComforted(1);
    scoring.discoverFoodSource("fountain:1:2");
    scoring.resume();

    expect(scoring.toJSON()).toEqual(DEFAULT_RUN_SCORE_STATE);
  });
});
