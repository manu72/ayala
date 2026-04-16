import { describe, expect, it } from "vitest";
import { resolveSnatcherSpawnAction } from "../../src/utils/snatcherSpawnLogic";

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
