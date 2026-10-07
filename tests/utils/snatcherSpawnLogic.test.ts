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

  describe("with a sight requirement (the scripted first sighting)", () => {
    // 1000 px square patrol; the target stands 150 px inside its top edge
    const square = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }, { x: 0, y: 0 }];
    const target = { x: 500, y: 150 };
    const sight = (canSee: (p: { x: number; y: number }) => boolean = () => true) => ({ witnessDistPx: 200, reachPx: 150, canSee });
    /** Walk a staged path and return how far it went before first being seen within 200 px (Infinity if never). */
    const walkToView = (path: Array<{ x: number; y: number }>, canSee: (p: { x: number; y: number }) => boolean) => {
      let walked = 0;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        for (let d = 0; d < len; d += 4) {
          const p = { x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len };
          if (Math.hypot(p.x - target.x, p.y - target.y) <= 200 && canSee(p)) return walked + d;
        }
        walked += len;
      }
      return Infinity;
    };

    it("starts off-screen mid-route on the stretch that walks into view soonest", () => {
      const staged = stagePatrolNear([square], target, 260, sight())!;
      expect(staged[0]).toEqual({ x: 272, y: 0 }); // not a vertex (x = 288 is 259.7 px away: on screen)
      expect(Math.hypot(staged[0]!.x - target.x, staged[0]!.y - target.y)).toBeGreaterThanOrEqual(260);
      expect(walkToView(staged, () => true)).toBeLessThanOrEqual(150);
      expect(staged.slice(1)).toEqual([{ x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }, { x: 0, y: 0 }, { x: 272, y: 0 }]);
    });

    it("walks the loop the other way when only that direction comes into her line of sight in time", () => {
      const canSee = (p: { x: number; y: number }) => p.x > 560; // something blocks the view to the west
      const staged = stagePatrolNear([square], target, 260, sight(canSee))!;
      expect(staged[0]).toEqual({ x: 728, y: 0 });
      expect(staged[1]).toEqual({ x: 0, y: 0 }); // heading west along the top edge
      expect(walkToView(staged, canSee)).toBeLessThanOrEqual(150);
    });

    it("falls back to the nearest off-screen vertex when no route can come into view in time", () => {
      const far = { x: 500, y: -600 };
      expect(stagePatrolNear([square], far, 260, sight())).toEqual(stagePatrolNear([square], far, 260));
      const hidden = stagePatrolNear([square], target, 260, sight(() => false));
      expect(hidden).toEqual(stagePatrolNear([square], target, 260));
    });
  });
});
