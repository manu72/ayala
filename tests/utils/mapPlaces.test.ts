import { describe, expect, it } from "vitest";
import {
  closestOnPolyline,
  placeNamed,
  placesOfType,
  pointAlong,
  pointInRect,
  polylineLength,
  readPlaces,
  tiledProps,
} from "../../src/utils/mapPlaces";

describe("readPlaces", () => {
  it("converts relative Tiled polylines to absolute world px and keeps rects and points", () => {
    const places = readPlaces([
      { name: "traffic_a", type: "traffic", x: 100, y: 50, polyline: [{ x: 0, y: 0 }, { x: 30, y: 40 }], properties: [{ name: "lanes", value: 3 }] },
      { name: "zone_shops", type: "zone", x: 10, y: 20, width: 64, height: 32 },
      { name: "exit_mall", type: "exit", x: 5, y: 6, point: true, width: 0, height: 0 },
    ]);
    expect(places[0]!.polyline).toEqual([{ x: 100, y: 50 }, { x: 130, y: 90 }]);
    expect(places[0]!.props.lanes).toBe(3);
    expect(places[1]!.rect).toEqual({ x: 10, y: 20, width: 64, height: 32 });
    expect(places[2]!.rect).toBeUndefined();
    expect(placesOfType(places, "exit").map((p) => p.name)).toEqual(["exit_mall"]);
    expect(placeNamed(places, "zone_shops")?.type).toBe("zone");
  });

  it("accepts properties as a plain object too", () => {
    expect(tiledProps({ radius: 5 })).toEqual({ radius: 5 });
    expect(tiledProps(undefined)).toEqual({});
  });
});

describe("polyline geometry", () => {
  const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }];

  it("measures length and walks along segments with heading", () => {
    expect(polylineLength(line)).toBe(150);
    expect(pointAlong(line, 120)).toEqual({ x: 100, y: 20, angle: Math.PI / 2 });
    expect(pointAlong(line, 999)).toMatchObject({ x: 100, y: 50 });
    expect(pointAlong(line, -5)).toMatchObject({ x: 0, y: 0 });
  });

  it("finds the closest point with its distance along the line", () => {
    expect(closestOnPolyline(line, { x: 40, y: 10 })).toEqual({ x: 40, y: 0, distance: 10, along: 40 });
    expect(closestOnPolyline(line, { x: 120, y: 30 })).toEqual({ x: 100, y: 30, distance: 20, along: 130 });
  });

  it("tests points against rects inclusively", () => {
    expect(pointInRect({ x: 10, y: 10 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(true);
    expect(pointInRect({ x: 11, y: 10 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(false);
  });
});
