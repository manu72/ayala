import { describe, expect, it } from "vitest";
import atgMap from "../../public/assets/tilemaps/atg.json";
import { CAMILLE_CARE_ROUTE_ENTRY_BLACKY_PAUSE_MS } from "../../src/config/gameplayConstants";
import { buildCamilleEraCareRoutes } from "../../src/utils/camilleCareRoute";
import { createNavigationGrid, routeHumanPath, type NavigationGrid, type RoutePoint } from "../../src/utils/humanRoutePath";

describe("routeHumanPath", () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid tileSize %s before creating a navigation grid",
    (tileSize) => {
      expect(() =>
        createNavigationGrid({
          width: 1,
          height: 1,
          tileSize,
          isBlocked: () => false,
        }),
      ).toThrow("createNavigationGrid: tileSize must be a positive finite number");
    },
  );

  it("routes around blocked tiles instead of preserving a wall-crossing straight segment", () => {
    const blocked = new Set(["2,0", "2,1", "2,2", "2,3"]);
    const grid = createNavigationGrid({
      width: 5,
      height: 5,
      tileSize: 10,
      isBlocked: (x, y) => blocked.has(`${x},${y}`),
    });

    const result = routeHumanPath(
      [
        { x: 5, y: 5 },
        { x: 45, y: 5 },
      ],
      grid,
    );

    expect(result.path.length).toBeGreaterThan(2);
    for (const point of result.path) {
      const cell = toCell(point, grid);
      expect(blocked.has(`${cell.x},${cell.y}`)).toBe(false);
    }
  });

  it("moves waypoint pauses and linger index onto routed destination points", () => {
    const blocked = new Set(["1,0"]);
    const grid = createNavigationGrid({
      width: 3,
      height: 3,
      tileSize: 10,
      isBlocked: (x, y) => blocked.has(`${x},${y}`),
    });

    const result = routeHumanPath(
      [
        { x: 5, y: 5 },
        { x: 25, y: 5 },
      ],
      grid,
      {
        waypointPauseMs: [100, 250],
        lingerWaypointIndex: 1,
      },
    );

    expect(result.lingerWaypointIndex).toBe(result.path.length - 1);
    expect(result.waypointPauseMs?.[0]).toBe(100);
    expect(result.waypointPauseMs?.[result.path.length - 1]).toBe(250);
    expect(result.waypointPauseMs?.slice(1, -1).every((pause) => pause === 0)).toBe(true);
  });

  it("stops at the last reachable point when a segment has no route", () => {
    const blocked = new Set(["1,0", "1,1", "1,2"]);
    const grid = createNavigationGrid({
      width: 3,
      height: 3,
      tileSize: 10,
      isBlocked: (x, y) => blocked.has(`${x},${y}`),
    });

    const result = routeHumanPath(
      [
        { x: 5, y: 5 },
        { x: 25, y: 5 },
      ],
      grid,
    );

    expect(result.path).toEqual([{ x: 5, y: 5 }]);
  });

  it("preserves repeated waypoints instead of treating already-there segments as route failures", () => {
    const grid = createNavigationGrid({
      width: 2,
      height: 2,
      tileSize: 10,
      isBlocked: () => false,
    });

    const result = routeHumanPath(
      [
        { x: 5, y: 5 },
        { x: 5, y: 5 },
        { x: 15, y: 15 },
      ],
      grid,
      {
        waypointPauseMs: [0, 200, 0],
      },
    );

    expect(result.path).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 15, y: 15 },
    ]);
    expect(result.waypointPauseMs?.[1]).toBe(200);
  });

  it("does not diagonal-cut through blocked corners", () => {
    const blocked = new Set(["1,0", "0,1"]);
    const grid = createNavigationGrid({
      width: 2,
      height: 2,
      tileSize: 10,
      isBlocked: (x, y) => blocked.has(`${x},${y}`),
    });

    const result = routeHumanPath(
      [
        { x: 5, y: 5 },
        { x: 15, y: 15 },
      ],
      grid,
    );

    expect(result.path).toEqual([{ x: 5, y: 5 }]);
  });

  it("keeps the male jogger's Paseo underpass segment as turn points instead of tile-step targets", () => {
    const grid = navigationGridFromAtgMap();
    const routed = routeHumanPath(
      [
        { x: 16, y: 1392 },
        { x: 1008, y: 432 },
      ],
      grid,
    );

    expect(routed.path[0]).toEqual({ x: 16, y: 1392 });
    expect(routed.path[routed.path.length - 1]).toEqual({ x: 1008, y: 432 });
    expect(routed.path.length).toBeLessThan(10);
    const firstMoveTileDistance = Math.max(
      Math.abs(toCell(routed.path[1]!, grid).x - toCell(routed.path[0]!, grid).x),
      Math.abs(toCell(routed.path[1]!, grid).y - toCell(routed.path[0]!, grid).y),
    );
    expect(firstMoveTileDistance).toBeGreaterThan(1);
  });

  it("expands Camille-era care routes into walkable adjacent tile waypoints on the shipped map", () => {
    const grid = navigationGridFromAtgMap();
    const routes = buildCamilleEraCareRoutes(findAtgObject);
    const routed = routeHumanPath(
      routes.camille.map(({ x, y }) => ({ x, y })),
      grid,
      {
        waypointPauseMs: routes.camille.map((w) => w.pauseMs),
        lingerWaypointIndex: 0,
      },
    );

    expect(toCell(routed.path[0]!, grid)).toEqual(toCell(routes.camille[0]!, grid));
    expect(toCell(routed.path[routed.path.length - 1]!, grid)).toEqual(toCell(routes.camille[routes.camille.length - 1]!, grid));
    expect(routed.lingerWaypointIndex).toBe(0);
    expect(routed.waypointPauseMs?.[0]).toBe(CAMILLE_CARE_ROUTE_ENTRY_BLACKY_PAUSE_MS);

    for (const point of routed.path) {
      const cell = toCell(point, grid);
      expect(grid.cells[cell.y]?.[cell.x]).toBe(0);
    }

    expect(routed.path.length).toBeGreaterThan(1);
  });
});

function navigationGridFromAtgMap(): NavigationGrid {
  const ground = layerNamed("ground");
  const objects = layerNamed("objects");
  const tileset = atgMap.tilesets[0];
  if (!tileset || !Array.isArray(tileset.tiles)) {
    throw new Error("Missing ATG tileset");
  }
  const collidingGids = new Set(
    tileset.tiles
      .filter((tile) => tile.properties?.some((property) => property.name === "collides" && property.value === true))
      .map((tile) => tile.id + tileset.firstgid),
  );

  return createNavigationGrid({
    width: atgMap.width,
    height: atgMap.height,
    tileSize: atgMap.tilewidth,
    isBlocked: (x, y) => {
      const index = y * atgMap.width + x;
      return collidingGids.has(ground.data[index] ?? 0) || collidingGids.has(objects.data[index] ?? 0);
    },
  });
}

function layerNamed(name: string): { data: number[] } {
  const layer = atgMap.layers.find((candidate) => candidate.name === name);
  if (!layer || !("data" in layer) || !Array.isArray(layer.data)) {
    throw new Error(`Missing tile layer ${name}`);
  }
  return { data: layer.data };
}

function findAtgObject(name: string) {
  const layer = atgMap.layers.find((candidate) => candidate.name === "spawns");
  if (!layer || !("objects" in layer) || !Array.isArray(layer.objects)) return undefined;
  return layer.objects.find((object) => object.name === name);
}

function toCell(point: RoutePoint, grid: NavigationGrid): { x: number; y: number } {
  return {
    x: Math.floor(point.x / grid.tileSize),
    y: Math.floor(point.y / grid.tileSize),
  };
}
