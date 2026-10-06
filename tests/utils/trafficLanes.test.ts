import { describe, expect, it } from "vitest";
import atgMap from "../../public/assets/tilemaps/atg.json";
import T from "../../scripts/tile-indices.json";
import { LANE_WIDTH_PX } from "../../src/utils/kerbsideDropoff";
import {
  closestOnPolyline,
  placesOfType,
  pointAlong,
  polylineLength,
  readPlaces,
  type TiledObjectLike,
} from "../../src/utils/mapPlaces";
import {
  extendToBounds,
  fitLaneCount,
  hourOfDay,
  laneOffset,
  MIN_GAP_PX,
  offsetPolyline,
  reservedStretch,
  stepLane,
  trafficDensity,
  type LaneCar,
} from "../../src/utils/trafficLanes";

describe("lane offsets (right-hand traffic, lane 0 = kerb)", () => {
  it("centres the lanes on the carriageway with lane 0 furthest right of travel", () => {
    expect([0, 1, 2].map((k) => laneOffset(3, k))).toEqual([LANE_WIDTH_PX, 0, -LANE_WIDTH_PX]);
    expect(laneOffset(2, 0)).toBeCloseTo(LANE_WIDTH_PX / 2);
    expect(laneOffset(1, 0)).toBe(0);
  });

  it("puts the kerb lane of an eastbound road on its south side and of a southbound road on its west side", () => {
    const east = offsetPolyline([{ x: 0, y: 100 }, { x: 500, y: 100 }], laneOffset(3, 0));
    expect(east[0]!.y).toBeCloseTo(100 + LANE_WIDTH_PX);
    const south = offsetPolyline([{ x: 100, y: 0 }, { x: 100, y: 500 }], laneOffset(3, 0));
    expect(south[0]!.x).toBeCloseTo(100 - LANE_WIDTH_PX);
  });
});

describe("offsetPolyline", () => {
  it("mitres corners and drops duplicate vertices", () => {
    const out = offsetPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 10);
    expect(out).toHaveLength(3);
    expect(out[1]!.x).toBeCloseTo(90);
    expect(out[1]!.y).toBeCloseTo(10);
    expect(out[2]!.x).toBeCloseTo(90);
    expect(out[2]!.y).toBeCloseTo(100);
  });
});

describe("degenerate polylines", () => {
  it("never produces NaN from empty, single-point or zero-length lines", () => {
    const bounds = { width: 1000, height: 800 };
    for (const line of [[], [{ x: 5, y: 5 }], [{ x: 5, y: 5 }, { x: 5, y: 5 }]]) {
      for (const p of [...offsetPolyline(line, 20), ...extendToBounds(line, bounds)]) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      }
      expect(reservedStretch(line.length ? line : [], { x: 5, y: 5 }, 0)).toBeNull();
    }
    expect(reservedStretch([], { x: 0, y: 0 }, 100)).toBeNull();
    expect(() => stepLane([], 0.016, 100)).not.toThrow();
    expect(trafficDensity(Number.NaN)).toBeGreaterThan(0);
  });
});

describe("extendToBounds", () => {
  const bounds = { width: 1000, height: 800 };

  it("carries both ends straight on until they leave the map plus margin", () => {
    const out = extendToBounds([{ x: 200, y: 400 }, { x: 600, y: 400 }], bounds, 64);
    expect(out[0]).toEqual({ x: -64, y: 400 });
    expect(out[out.length - 1]).toEqual({ x: 1064, y: 400 });
    expect(out).toHaveLength(4);
  });

  it("caps the run-in and leaves ends that are already off-map alone", () => {
    const out = extendToBounds([{ x: -100, y: 400 }, { x: 500, y: 400 }], bounds, 64, 300);
    expect(out[0]).toEqual({ x: -100, y: 400 });
    expect(out[out.length - 1]).toEqual({ x: 800, y: 400 });
  });
});

describe("fitLaneCount", () => {
  const road = [{ x: 0, y: 500 }, { x: 2000, y: 500 }];
  const band = (half: number) => (_x: number, y: number) => Math.abs(y - 500) <= half;

  it("drops outer lanes whose car body would leave the painted road", () => {
    // 3 lanes need |52.8| + 14 = 66.8 px of half-width; 4 lanes need 79.2 + 14.
    expect(fitLaneCount(road, 4, band(70))).toBe(3);
    expect(fitLaneCount(road, 4, band(95))).toBe(4);
    expect(fitLaneCount(road, 5, band(20))).toBe(1);
    expect(fitLaneCount(road, 3, () => false)).toBe(0);
  });

  it("tolerates a short off-road blip such as a junction island", () => {
    const blip = (x: number, y: number) => band(70)(x, y) && !(x > 1000 && x < 1012);
    expect(fitLaneCount(road, 3, blip)).toBe(3);
  });
});

describe("reservedStretch", () => {
  const lane = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];

  it("returns the along-lane interval inside the circle, or null when the lane misses it", () => {
    const s = reservedStretch(lane, { x: 400, y: 30 }, 50)!;
    expect(s[0]).toBeCloseTo(360);
    expect(s[1]).toBeCloseTo(440);
    expect(reservedStretch(lane, { x: 400, y: 80 }, 50)).toBeNull();
  });
});

describe("stepLane", () => {
  const car = (dist: number, cruise: number, speed = cruise): LaneCar => ({ dist, speed, cruise, length: 72 });
  const rearGap = (a: LaneCar, b: LaneCar) => a.dist - a.length / 2 - (b.dist + b.length / 2);

  it("lets a fast car catch a slow one, then follow at its speed without ever overlapping", () => {
    const cars = [car(600, 150), car(100, 200)];
    let minGap = Infinity;
    for (let i = 0; i < 1200; i++) {
      stepLane(cars, 1 / 60);
      minGap = Math.min(minGap, rearGap(cars[0]!, cars[1]!));
    }
    expect(minGap).toBeGreaterThanOrEqual(MIN_GAP_PX - 1e-9);
    expect(cars[1]!.speed).toBeCloseTo(150, 0);
    expect(rearGap(cars[0]!, cars[1]!)).toBeLessThan(250);
  });

  it("never overlaps even on a long frame hitch or a stopped leader", () => {
    const cars = [car(300, 0, 0), car(150, 200)];
    stepLane(cars, 2);
    expect(rearGap(cars[0]!, cars[1]!)).toBeGreaterThanOrEqual(MIN_GAP_PX - 1e-9);
    expect(cars[1]!.dist).toBeGreaterThanOrEqual(150);
  });

  it("queues cars short of a stop line and lets cars already past it drive on", () => {
    const cars = [car(1050, 180), car(700, 180), car(500, 180)];
    for (let i = 0; i < 600; i++) stepLane(cars, 1 / 60, 1000);
    expect(cars[0]!.dist).toBeGreaterThan(2000);
    expect(cars[1]!.dist + 36).toBeLessThanOrEqual(1000);
    expect(cars[1]!.speed).toBeLessThan(1);
    expect(rearGap(cars[1]!, cars[2]!)).toBeGreaterThanOrEqual(MIN_GAP_PX - 1e-9);
  });

  it("accelerates gradually from a standstill", () => {
    const cars = [car(0, 200, 0)];
    stepLane(cars, 0.5);
    expect(cars[0]!.speed).toBeCloseTo(45);
  });
});

describe("time of day", () => {
  it("derives the clock hour from a day-night phase", () => {
    expect(hourOfDay(6, 10, 0.5)).toBe(8);
    expect(hourOfDay(21, 6, 0.5)).toBe(1.5);
    expect(hourOfDay(21, 6, 0)).toBe(21);
  });

  it("is busiest in the rush hours, steady by day and sparse at night", () => {
    expect(trafficDensity(8)).toBe(1);
    expect(trafficDensity(18.5)).toBe(1);
    expect(trafficDensity(13)).toBeCloseTo(0.6);
    expect(trafficDensity(3)).toBeLessThan(0.1);
    expect(trafficDensity(24)).toBeCloseTo(trafficDensity(0));
    for (let h = 0; h < 24; h += 0.25) {
      expect(Math.abs(trafficDensity(h + 0.25) - trafficDensity(h))).toBeLessThan(0.15);
    }
  });
});

describe("real map (atg.json)", () => {
  const W = atgMap.width;
  const H = atgMap.height;
  const TS = atgMap.tilewidth;
  const ground = atgMap.layers.find((l) => l.name === "ground")?.data ?? [];
  const collidingGids = new Set<number>();
  for (const ts of atgMap.tilesets) {
    for (const t of ts.tiles ?? []) {
      if (t.properties?.some((p) => p.name === "collides" && p.value === true)) collidingGids.add(ts.firstgid + t.id);
    }
  }
  // Mirrors the GameScene wiring: ground tile collides (off-map counts as road).
  const isDrivable = (x: number, y: number): boolean => {
    const cx = Math.floor(x / TS);
    const cy = Math.floor(y / TS);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return true;
    return collidingGids.has(ground[cy * W + cx] ?? 0);
  };
  const placesLayer = atgMap.layers.find((l) => l.name === "places");
  const traffic = placesOfType(readPlaces((placesLayer?.objects ?? []) as TiledObjectLike[]), "traffic");

  it("fits at least two drivable lanes on every carriageway, never more than OSM's lanes", () => {
    expect(traffic.length).toBe(6);
    let total = 0;
    for (const place of traffic) {
      const centre = extendToBounds(place.polyline ?? [], { width: W * TS, height: H * TS });
      const n = fitLaneCount(centre, Number(place.props.lanes), isDrivable);
      expect(n, place.name).toBeGreaterThanOrEqual(2);
      expect(n, place.name).toBeLessThanOrEqual(Number(place.props.lanes));
      total += n;
    }
    expect(total).toBeGreaterThanOrEqual(15);
  });

  // isDrivable only asks "collides", which buildings and the monument also do; pin that the
  // fitted lanes (car body included) really are on road tiles so a map regeneration can't
  // put cars on a building, a median or across the park.
  it("keeps every fitted lane's car body on road tiles", () => {
    const roadGids = new Set([T.ROAD, T.ROAD_LINE, T.ROAD_EDGE, T.ROAD_SOLID_LINE].map((i) => i + 1));
    const onRoad = (x: number, y: number): boolean => {
      const cx = Math.floor(x / TS);
      const cy = Math.floor(y / TS);
      return cx < 0 || cy < 0 || cx >= W || cy >= H || roadGids.has(ground[cy * W + cx] ?? 0);
    };
    for (const place of traffic) {
      const centre = extendToBounds(place.polyline ?? [], { width: W * TS, height: H * TS });
      const n = fitLaneCount(centre, Number(place.props.lanes), isDrivable);
      for (let k = 0; k < n; k++) {
        const lane = offsetPolyline(centre, laneOffset(n, k));
        let samples = 0;
        let off = 0;
        for (let d = 0; d < polylineLength(lane); d += 16) {
          const p = pointAlong(lane, d);
          const nx = -Math.sin(p.angle) * 14;
          const ny = Math.cos(p.angle) * 14;
          samples++;
          if (!onRoad(p.x, p.y) || !onRoad(p.x + nx, p.y + ny) || !onRoad(p.x - nx, p.y - ny)) off++;
        }
        expect(off / samples, `${place.name} lane ${k}`).toBeLessThan(0.01);
      }
    }
  });

  it("runs each road's two carriageways right-hand-traffic style (the other one on the left)", () => {
    const roads = new Map<string, typeof traffic>();
    for (const place of traffic) roads.set(String(place.props.road), [...(roads.get(String(place.props.road)) ?? []), place]);
    expect(roads.size).toBe(3);
    for (const [road, pair] of roads) {
      expect(pair, road).toHaveLength(2);
      for (const place of pair) {
        const other = pair.find((p) => p !== place)?.polyline ?? [];
        const line = place.polyline ?? [];
        // Sample the middle 60% (the ends meet other roads at the apexes).
        for (let f = 0.2; f <= 0.8; f += 0.1) {
          const p = pointAlong(line, f * polylineLength(line));
          const q = closestOnPolyline(other, p);
          const rightOfTravel = (q.x - p.x) * -Math.sin(p.angle) + (q.y - p.y) * Math.cos(p.angle);
          expect(rightOfTravel, `${place.name} at ${f.toFixed(1)}`).toBeLessThan(0);
        }
      }
    }
  });
});
