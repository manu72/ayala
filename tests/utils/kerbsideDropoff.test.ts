import { describe, expect, it } from "vitest";
import { carPose, LANE_WIDTH_PX, planKerbsideDropoff } from "../../src/utils/kerbsideDropoff";

describe("carPose", () => {
  it("points the nose of west-facing art along every heading and never turns it upside down", () => {
    for (let deg = -180; deg <= 180; deg += 15) {
      const heading = (deg * Math.PI) / 180;
      const { rotation, flipX } = carPose(heading);
      const nose = flipX ? rotation : rotation + Math.PI; // art's nose is at angle PI before rotation
      expect(Math.cos(nose)).toBeCloseTo(Math.cos(heading));
      expect(Math.sin(nose)).toBeCloseTo(Math.sin(heading));
      expect(Math.abs(rotation)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    }
    expect(carPose(0)).toEqual({ rotation: 0, flipX: true });
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
  });

  it("clamps to the lane ends and rejects degenerate lanes", () => {
    const plan = planKerbsideDropoff(lane, 1, { x: 900, y: 50 })!;
    expect(plan.start.y).toBeCloseTo(0);
    expect(plan.stop.x).toBeCloseTo(1000); // single lane: stop on the centre line
    expect(planKerbsideDropoff([{ x: 0, y: 0 }], 2, { x: 1, y: 1 })).toBeNull();
  });
});
