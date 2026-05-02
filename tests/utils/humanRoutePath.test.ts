import { describe, expect, it } from "vitest";
import atgMap from "../../public/assets/tilemaps/atg.json";
import { CAMILLE_CARE_ROUTE_ENTRY_BLACKY_PAUSE_MS } from "../../src/config/gameplayConstants";
import { buildCamilleEraCareRoutes } from "../../src/utils/camilleCareRoute";
import { createNavigationGrid, routeHumanPath, type NavigationGrid, type RoutePoint } from "../../src/utils/humanRoutePath";

describe("routeHumanPath", () => {
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

    expect(routed.path.length).toBeGreaterThan(routes.camille.length);
    expect(routed.lingerWaypointIndex).toBe(0);
    expect(routed.waypointPauseMs?.[0]).toBe(CAMILLE_CARE_ROUTE_ENTRY_BLACKY_PAUSE_MS);

    for (const point of routed.path) {
      const cell = toCell(point, grid);
      expect(grid.cells[cell.y]?.[cell.x]).toBe(0);
    }

    for (let i = 1; i < routed.path.length; i += 1) {
      const prev = toCell(routed.path[i - 1]!, grid);
      const next = toCell(routed.path[i]!, grid);
      const manhattanDistance = Math.abs(next.x - prev.x) + Math.abs(next.y - prev.y);
      expect(manhattanDistance).toBeLessThanOrEqual(1);
    }
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
