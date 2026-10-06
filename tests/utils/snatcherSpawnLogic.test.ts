import { describe, expect, it } from "vitest";
import { resolveSnatcherSpawnAction, stagePatrolNear } from "../../src/utils/snatcherSpawnLogic";

describe("resolveSnatcherSpawnAction", () => {
  it("resets when not night", () => {
    expect(
      resolveSnatcherSpawnAction({
        isNight: false,
        snatcherSpawnChecked: true,
        firstSnatcherSeen: undefined,
        chapter: 3,
        isResting: true,
        isNearShelter: true,
      }),
    ).toEqual({ type: "not_night", resetChecked: true });
  });

  it("does nothing when already checked this night", () => {
    expect(
      resolveSnatcherSpawnAction({
        isNight: true,
        snatcherSpawnChecked: true,
        firstSnatcherSeen: undefined,
        chapter: 3,
        isResting: false,
        isNearShelter: false,
      }),
    ).toEqual({ type: "already_checked" });
  });

  it("defers first sighting when resting at shelter without consuming the night check", () => {
    const r = resolveSnatcherSpawnAction({
      isNight: true,
      snatcherSpawnChecked: false,
      firstSnatcherSeen: undefined,
      chapter: 3,
      isResting: true,
      isNearShelter: true,
    });
    expect(r).toEqual({
      type: "defer_first_sighting",
      reason: "resting_at_shelter",
    });
  });

  it("runs first sighting when chapter >= 3 and first not seen and not deferred", () => {
    expect(
      resolveSnatcherSpawnAction({
        isNight: true,
        snatcherSpawnChecked: false,
        firstSnatcherSeen: undefined,
        chapter: 3,
        isResting: false,
        isNearShelter: false,
      }),
    ).toEqual({ type: "first_sighting" });
  });

  it("runs first sighting when resting but not at shelter (unsafe)", () => {
    expect(
      resolveSnatcherSpawnAction({
        isNight: true,
        snatcherSpawnChecked: false,
        firstSnatcherSeen: undefined,
        chapter: 3,
        isResting: true,
        isNearShelter: false,
      }),
    ).toEqual({ type: "first_sighting" });
  });

  it("uses random spawn after first snatcher seen", () => {
    expect(
      resolveSnatcherSpawnAction({
        isNight: true,
        snatcherSpawnChecked: false,
        firstSnatcherSeen: true,
        chapter: 4,
        isResting: false,
        isNearShelter: false,
      }),
    ).toEqual({ type: "random_spawn" });
  });

  it("uses random spawn when chapter < 3 even if first not seen", () => {
    expect(
      resolveSnatcherSpawnAction({
        isNight: true,
        snatcherSpawnChecked: false,
        firstSnatcherSeen: undefined,
        chapter: 2,
        isResting: false,
        isNearShelter: false,
      }),
    ).toEqual({ type: "random_spawn" });
  });
});

describe("stagePatrolNear", () => {
  const loopA = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 0 }];
  const loopB = [{ x: 1000, y: 0 }, { x: 1100, y: 0 }, { x: 1000, y: 0 }];

  it("starts the nearest patrol loop at the closest vertex that is still off-screen", () => {
    // (100,100) is nearest but only 224 px away (on screen), so the loop starts at (0,0), 300 px away
    const staged = stagePatrolNear([loopB, loopA], { x: 0, y: 300 }, 250);
    expect(staged).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 0 }]);
  });

  it("never spawns closer than the minimum and returns null when nothing qualifies", () => {
    expect(stagePatrolNear([loopA], { x: 50, y: 50 }, 500)).toBeNull();
    // loop B's vertices are both 50 px away (too close), so the nearest qualifying vertex is A's (100,0)
    const staged = stagePatrolNear([loopA, loopB], { x: 1050, y: 0 }, 100);
    expect(staged?.[0]).toEqual({ x: 100, y: 0 });
    expect(staged).toHaveLength(4);
  });
});
