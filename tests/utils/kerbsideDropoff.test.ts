import { describe, expect, it } from "vitest";
import { LANE_WIDTH_PX, planKerbsideDropoff, topDownPose } from "../../src/utils/kerbsideDropoff";

describe("topDownPose", () => {
  it("points the nose of east-facing top-down art along every heading, unmirrored, rotation in (-PI, PI]", () => {
    for (let deg = -720; deg <= 720; deg += 15) {
      const heading = (deg * Math.PI) / 180;
      const { rotation, flipX } = topDownPose(heading);
      expect(flipX).toBe(false);
      expect(Math.cos(rotation)).toBeCloseTo(Math.cos(heading));
      expect(Math.sin(rotation)).toBeCloseTo(Math.sin(heading));
      expect(rotation).toBeGreaterThan(-Math.PI);
      expect(rotation).toBeLessThanOrEqual(Math.PI);
    }
    expect(topDownPose(0)).toEqual({ rotation: 0, flipX: false });
    expect(topDownPose(-Math.PI).rotation).toBeCloseTo(Math.PI);
    expect(topDownPose(Math.PI / 2).rotation).toBeCloseTo(Math.PI / 2); // southbound (y down)
  });
});

describe("planKerbsideDropoff", () => {
  // southbound lane straight down x=1000; target on the west kerb
  const lane = [{ x: 1000, y: 0 }, { x: 1000, y: 2000 }];

  it("stops in the kerb lane opposite the target and approaches from upstream", () => {
    const plan = planKerbsideDropoff(lane, 3, { x: 850, y: 1000 })!;
    expect(plan.stop.x).toBeCloseTo(1000 - LANE_WIDTH_PX);
    expect(plan.stop.y).toBeCloseTo(1000);
    expect(plan.start.y).toBeCloseTo(600);
    expect(plan.exit.y).toBeCloseTo(1600);
    expect(plan.towardKerb.x).toBeCloseTo(-1);
    // Southbound (+y): top-down art turned a quarter clockwise, nose down the lane.
    expect(plan.rotation).toBeCloseTo(Math.PI / 2);
    expect(plan.flipX).toBe(false);
  });

  it("clamps to the lane ends and rejects degenerate lanes", () => {
    const plan = planKerbsideDropoff(lane, 1, { x: 900, y: 50 })!;
    expect(plan.start.y).toBeCloseTo(0);
    expect(plan.stop.x).toBeCloseTo(1000); // single lane: stop on the centre line
    expect(planKerbsideDropoff([{ x: 0, y: 0 }], 2, { x: 1, y: 1 })).toBeNull();
  });
});
