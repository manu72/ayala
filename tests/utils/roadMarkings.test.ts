import { describe, expect, it } from "vitest";
import { DASH_PX, GAP_PX, dashSegments, laneDividers, wheelTracks, zebraBars } from "../../src/utils/roadMarkings";
import { LANE_WIDTH_PX } from "../../src/utils/kerbsideDropoff";

const len = ([a, b]: readonly [{ x: number; y: number }, { x: number; y: number }]) => Math.hypot(b.x - a.x, b.y - a.y);

describe("dashSegments", () => {
  it("lays full dashes at the dash/gap period along a straight line", () => {
    const dashes = dashSegments([{ x: 0, y: 0 }, { x: 600, y: 0 }]);
    expect(dashes.length).toBe(5);
    expect(dashes.every((d) => Math.abs(len(d) - DASH_PX) < 1e-6)).toBe(true);
    expect(dashes[1]?.[0].x).toBeCloseTo(DASH_PX + GAP_PX);
  });

  it("keeps the rhythm across polyline vertices (a dash can turn the corner)", () => {
    const dashes = dashSegments([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 100 }]);
    const total = dashes.slice(0, 2).reduce((a, d) => a + len(d), 0);
    expect(total).toBeCloseTo(DASH_PX); // 30 px on the first leg + 18 px on the second
  });
});

describe("lane geometry", () => {
  const centre = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];
  it("puts n-1 dividers halfway between n lanes", () => {
    const d = laneDividers(centre, 3);
    expect(d.length).toBe(2);
    expect(d.map((l) => l[0]?.y).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([-LANE_WIDTH_PX / 2, LANE_WIDTH_PX / 2]);
    expect(laneDividers(centre, 1)).toEqual([]);
  });
  it("gives every lane two wheel tracks inside the lane", () => {
    const tracks = wheelTracks(centre, 2);
    expect(tracks.length).toBe(4);
    for (const t of tracks) expect(Math.abs(t[0]?.y ?? 99)).toBeLessThan(LANE_WIDTH_PX);
  });
});

describe("zebraBars", () => {
  it("stripes a crossing with bars parallel to the traffic", () => {
    const bars = zebraBars([{ x: 0, y: 0 }, { x: 0, y: 160 }]); // crossing runs north-south
    expect(bars.length).toBe(10);
    const [a, b, c] = bars[0] ?? [];
    expect(Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0))).toBeCloseTo(8); // bar width along the crossing
    expect(Math.abs((c?.x ?? 0) - (b?.x ?? 0))).toBeCloseTo(48); // bar length across it (east-west traffic)
  });
});
