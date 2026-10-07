import type Phaser from "phaser";
import { describe, expect, it } from "vitest";
import atgMap from "../../public/assets/tilemaps/atg.json";
import T from "../../scripts/tile-indices.json";
import { buildCamilleEraCareRoutes } from "../../src/utils/camilleCareRoute";
import { createNavigationGrid, routeHumanPath } from "../../src/utils/humanRoutePath";
import { GP, TERRITORY_NEGOTIATION_NEAR_STEPS_PX } from "../../src/config/gameplayConstants";
import { readPlaces, type TiledObjectLike } from "../../src/utils/mapPlaces";
import { drinkSpots } from "../../src/utils/waterEdge";
import { hasLineOfSightTiles } from "../../src/utils/lineOfSight";

/**
 * Data invariants for the generated map (scripts/generate-map.mjs). These pin
 * the real-world places the game relies on so a regeneration can't silently
 * move them apart or break routing.
 */

const W = atgMap.width;
const H = atgMap.height;
const TILE = atgMap.tilewidth;

type Layer = { name: string; data?: number[]; objects?: TiledObjectLike[] };
const layers = atgMap.layers as unknown as Layer[];
const data = (name: string): number[] => {
  const d = layers.find((l) => l.name === name)?.data;
  if (!d) throw new Error(`missing layer ${name}`);
  return d;
};
const ground = data("ground");
const objects = data("objects");
const overhead = data("overhead");
const spawns = layers.find((l) => l.name === "spawns")?.objects ?? [];
const places = readPlaces(layers.find((l) => l.name === "places")?.objects ?? []);

const parkTiles = atgMap.tilesets.find((t) => t.name === "park-tiles");
const colliding = new Set(
  (parkTiles && "tiles" in parkTiles ? parkTiles.tiles ?? [] : [])
    .filter((t) => t.properties?.some((p) => p.name === "collides" && p.value === true))
    .map((t) => t.id + 1),
);
const roadTiles = new Set(
  (parkTiles && "tiles" in parkTiles ? parkTiles.tiles ?? [] : [])
    .filter((t) => t.properties?.some((p) => p.name === "road" && p.value === true))
    .map((t) => t.id + 1),
);
const gid = (index: number): number => index + 1;
const cellIndex = (x: number, y: number): number => y * W + x;
const blocked = (x: number, y: number): boolean =>
  x < 0 || y < 0 || x >= W || y >= H || colliding.has(ground[cellIndex(x, y)] ?? 0) || colliding.has(objects[cellIndex(x, y)] ?? 0);
const clear = (x: number, y: number): boolean => {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (blocked(x + dx, y + dy)) return false;
  return true;
};
const cellOf = (p: { x: number; y: number }): [number, number] => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)];
const spawn = (name: string): { x: number; y: number } => {
  const o = spawns.find((s) => s.name === name);
  if (!o) throw new Error(`missing spawn ${name}`);
  return { x: o.x ?? 0, y: o.y ?? 0 };
};
/** Chebyshev distance in tiles from `p` to the nearest cell on `layer` holding one of `tiles`. */
const tilesAway = (p: { x: number; y: number }, layer: number[], tiles: number[]): number => {
  const [cx, cy] = cellOf(p);
  let best = Infinity;
  for (let y = Math.max(0, cy - 12); y <= Math.min(H - 1, cy + 12); y++)
    for (let x = Math.max(0, cx - 12); x <= Math.min(W - 1, cx + 12); x++)
      if (tiles.map(gid).includes(layer[cellIndex(x, y)] ?? 0)) best = Math.min(best, Math.max(Math.abs(x - cx), Math.abs(y - cy)));
  return best;
};

const reachable = (() => {
  const seen = new Uint8Array(W * H);
  const [sx, sy] = cellOf(spawn("spawn_mammacat"));
  const queue = [cellIndex(sx, sy)];
  seen[queue[0]!] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % W;
    const y = (i - x) / W;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (blocked(nx, ny) || seen[cellIndex(nx, ny)]) continue;
      seen[cellIndex(nx, ny)] = 1;
      queue.push(cellIndex(nx, ny));
    }
  }
  return seen;
})();

/** Mamma Cat's own reach: like `reachable`, but she may walk on road tiles (nobody else can). */
const catReachable = (() => {
  const seen = new Uint8Array(W * H);
  const [sx, sy] = cellOf(spawn("spawn_mammacat"));
  const queue = [cellIndex(sx, sy)];
  seen[queue[0]!] = 1;
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && (!blocked(x, y) || roadTiles.has(ground[cellIndex(x, y)] ?? 0));
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % W;
    const y = (i - x) / W;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (!open(nx, ny) || seen[cellIndex(nx, ny)]) continue;
      seen[cellIndex(nx, ny)] = 1;
      queue.push(cellIndex(nx, ny));
    }
  }
  return seen;
})();

const DECORATIVE = new Set(["poi_monument", "poi_gabriela_silang"]);

describe("atg.json structure", () => {
  it("ships the four tilesets GameScene requires, with collision metadata", () => {
    expect(atgMap.tilesets.map((t) => [t.name, t.firstgid])).toEqual([
      ["park-tiles", 1],
      ["trees-pale", 41],
      ["plants", 1065],
      ["atg-ground", 1577],
    ]);
    for (const index of [T.ROAD, T.BUILDING, T.TOWER, T.WATER, T.STARBUCKS]) expect(colliding.has(gid(index))).toBe(true);
    for (const index of [T.SIDEWALK, T.STONE_PATH, T.STEPS, T.ESCALATOR, T.GRASS_LIGHT]) expect(colliding.has(gid(index))).toBe(false);
  });

  it("marks the road tiles road=true and keeps them colliding (traffic and the human nav grid read collides)", () => {
    const roads = [T.ROAD, T.ROAD_LINE, T.ROAD_SOLID_LINE, T.ROAD_EDGE].map(gid);
    expect([...roadTiles].sort((a, b) => a - b)).toEqual(roads.sort((a, b) => a - b));
    for (const g of roads) expect(colliding.has(g)).toBe(true);
  });

  it("marks open water drinkable, with drinking spots every cat can walk to round each pond, pool and waterfall", () => {
    const waterTiles = new Set(
      (parkTiles && "tiles" in parkTiles ? parkTiles.tiles ?? [] : [])
        .filter((t) => t.properties?.some((p) => p.name === "water" && p.value === true))
        .map((t) => t.id + 1),
    );
    expect([...waterTiles]).toEqual([gid(T.WATER)]);
    const isWater = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && waterTiles.has(ground[cellIndex(x, y)] ?? 0);
    const spots = drinkSpots(W, H, TILE, isWater, (x, y) => !blocked(x, y));
    const grid = createNavigationGrid({ width: W, height: H, tileSize: TILE, isBlocked: (x, y) => !clear(x, y) });
    const blockedAt = (x: number, y: number) => blocked(Math.floor(x / TILE), Math.floor(y / TILE));
    // Like GameScene's water-trip routes: the nav grid keeps a tile clear, then up to 3 tiles are walked straight.
    const canWalkTo = (to: { x: number; y: number }) => {
      const { path } = routeHumanPath([spawn("spawn_mammacat"), to], grid);
      const end = path[path.length - 1]!;
      return Math.hypot(end.x - to.x, end.y - to.y) <= 3 * TILE && hasLineOfSightTiles(end.x, end.y, to.x, to.y, TILE, blockedAt);
    };
    // the PSE pond, the McMicking water-curtain pool and the Starbucks waterfall: cats pick among their 3 nearest spots
    for (const [name, cell] of [["PSE pond", [100, 125]], ["McMicking pool", [111, 107]], ["Starbucks waterfall", [201, 91]]] as const) {
      const near = spots.filter((s) => Math.hypot(s.x - (cell[0] * TILE + 16), s.y - (cell[1] * TILE + 16)) < 8 * TILE);
      expect(near.filter(canWalkTo).length, name).toBeGreaterThanOrEqual(3);
    }
  });

  it("hides the gameplay ground under half-tile-offset art layers that cover the whole map", () => {
    const layer = (name: string) => atgMap.layers.find((l) => l.name === name) as
      | { visible?: boolean; width?: number; height?: number; offsetx?: number; offsety?: number; data?: number[] }
      | undefined;
    expect(layer("ground")?.visible).toBe(false);
    const order = atgMap.layers.map((l) => l.name);
    expect(order.indexOf("groundArt")).toBeGreaterThan(order.indexOf("ground"));
    expect(order.indexOf("shade")).toBeLessThan(order.indexOf("objects"));
    expect(order.indexOf("roofArt")).toBeGreaterThan(order.indexOf("overhead"));
    for (const name of ["groundArt", "shade", "roofArt"]) {
      const l = layer(name);
      expect([l?.width, l?.height, l?.offsetx, l?.offsety]).toEqual([W + 1, H + 1, -16, -16]);
    }
    // every art cell is painted, and only with atg-ground tiles
    const art = layer("groundArt")?.data ?? [];
    expect(art.length).toBe((W + 1) * (H + 1));
    expect(art.every((g) => g >= 1577)).toBe(true);
  });

  it("records the map revision and scale", () => {
    const props = Object.fromEntries((atgMap.properties ?? []).map((p) => [p.name, p.value]));
    expect(props.metresPerTile).toBe(2);
    expect(typeof props.mapRevision).toBe("string");
  });

  it("never matches the dist secret-leak pattern", () => {
    expect(/sk-[A-Za-z0-9_-]{10,}/.test(JSON.stringify(atgMap))).toBe(false);
  });
});

describe("park geography", () => {
  it("is sealed by roads: the park (her explorable ground, everyone else's world) never touches the map edge", () => {
    for (let x = 0; x < W; x++) expect(reachable[cellIndex(x, 0)] || reachable[cellIndex(x, H - 1)]).toBeFalsy();
    for (let y = 0; y < H; y++) expect(reachable[cellIndex(0, y)] || reachable[cellIndex(W - 1, y)]).toBeFalsy();
  });

  it("lets Mamma Cat cross both carriageways of all three bordering roads, with nothing colliding on the asphalt", () => {
    let roadCells = 0;
    for (let i = 0; i < W * H; i++) {
      if (!roadTiles.has(ground[i] ?? 0)) continue;
      roadCells++;
      expect(colliding.has(objects[i] ?? 0), `object on road cell ${i}`).toBe(false);
    }
    expect(roadCells).toBeGreaterThan(1000);
    const lanes = places.filter((p) => p.type === "traffic");
    expect(lanes).toHaveLength(6);
    for (const lane of lanes) {
      const onLane = (lane.polyline ?? []).some((v) => {
        const [x, y] = cellOf(v);
        return x >= 0 && y >= 0 && x < W && y < H && catReachable[cellIndex(x, y)] === 1;
      });
      expect(onLane, `${lane.name} reachable on foot`).toBe(true);
    }
    // ...and on past them into the city, out to the edge of the map
    let edge = false;
    for (let x = 0; x < W; x++) edge ||= catReachable[cellIndex(x, 0)] === 1 || catReachable[cellIndex(x, H - 1)] === 1;
    for (let y = 0; y < H; y++) edge ||= catReachable[cellIndex(0, y)] === 1 || catReachable[cellIndex(W - 1, y)] === 1;
    expect(edge).toBe(true);
  });

  it("puts every gameplay spawn/POI on reachable ground with human-routing clearance", () => {
    for (const o of spawns) {
      if (DECORATIVE.has(o.name ?? "")) continue;
      const [x, y] = cellOf({ x: o.x ?? 0, y: o.y ?? 0 });
      expect({ name: o.name, reachable: Boolean(reachable[cellIndex(x, y)]), clear: clear(x, y) }).toEqual({
        name: o.name,
        reachable: true,
        clear: true,
      });
    }
  });

  it("makes Blacky's Paseo de Roxas underpass one place: entrance, descent and his watch post", () => {
    const blacky = spawn("spawn_blacky");
    const escalator = spawn("poi_escalator");
    expect(tilesAway(blacky, ground, [T.STEPS, T.ESCALATOR])).toBeLessThanOrEqual(2);
    expect(tilesAway(escalator, ground, [T.STEPS, T.ESCALATOR])).toBeLessThanOrEqual(1);
    expect(Math.hypot(blacky.x - escalator.x, blacky.y - escalator.y)).toBeLessThanOrEqual(5 * TILE);
    const [ex, ey] = cellOf({ x: blacky.x - 50, y: blacky.y }); // feeders / Camille enter here
    expect(blocked(ex, ey)).toBe(false);
    const exit = places.find((p) => p.name === "exit_sedeno_underpass");
    expect(exit && Math.hypot(exit.x - blacky.x, exit.y - blacky.y)).toBeLessThanOrEqual(4 * TILE);
  });

  it("puts the steps down to the mall right beside Starbucks and its waterfall", () => {
    const starbucks = spawn("poi_starbucks");
    expect(tilesAway(starbucks, ground, [T.STARBUCKS])).toBeLessThanOrEqual(3);
    expect(tilesAway(starbucks, ground, [T.STEPS])).toBeLessThanOrEqual(8);
    expect(tilesAway(spawn("poi_starbucks_water"), ground, [T.WATER, T.WATER_EDGE])).toBeLessThanOrEqual(2);
    expect(tilesAway(spawn("poi_shops_supermarket"), ground, [T.GLASS_FACADE])).toBeLessThanOrEqual(3);
  });

  it("puts the Starbucks waterfall on the courtyard's west wall, leaving the gap west of Starbucks open to the north lawn", () => {
    const [bx, by] = cellOf(spawn("poi_starbucks_water"));
    const water: number[] = [];
    for (let y = by - 6; y <= by + 6; y++) for (let x = bx - 6; x <= bx + 6; x++) if (ground[cellIndex(x, y)] === gid(T.WATER)) water.push(x);
    expect(water.length).toBeGreaterThan(0);
    expect(water.every((x) => x < bx)).toBe(true);
    // a few steps from the courtyard up through the gap to the lawn north of Starbucks (54 when the waterfall filled it)
    const steps = new Map([[cellIndex(bx, by), 0]]);
    const queue = [cellIndex(bx, by)];
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      const x = i % W;
      const y = (i - x) / W;
      if ((steps.get(i) ?? 0) >= 12) continue;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (blocked(nx, ny) || steps.has(cellIndex(nx, ny))) continue;
        steps.set(cellIndex(nx, ny), (steps.get(i) ?? 0) + 1);
        queue.push(cellIndex(nx, ny));
      }
    }
    const [sx, sy] = cellOf(spawn("poi_starbucks"));
    let lawnNorth = false;
    for (const i of steps.keys()) {
      const x = i % W;
      const y = (i - x) / W;
      if (y < sy - 4 && Math.abs(x - sx) <= 6 && [T.GRASS_LIGHT, T.GRASS_MED, T.GRASS_DARK, T.GRASS_FLOWER].map(gid).includes(ground[i] ?? 0)) lawnNorth = true;
    }
    expect(lawnNorth).toBe(true);
  });

  it("puts the pyramid steps up to the towers beside the glass, with a guard in Jayco's sight", () => {
    const steps = spawn("poi_pyramid_steps");
    expect(tilesAway(steps, ground, [T.STEPS])).toBeLessThanOrEqual(1);
    expect(tilesAway(steps, ground, [T.GLASS_FACADE])).toBeLessThanOrEqual(3); // "the steps near the glass building"
    const guards = places.filter((p) => p.type === "guard_post");
    expect(guards.some((g) => Math.hypot(g.x - steps.x, g.y - steps.y) <= 300)).toBe(true);
    const zone = places.find((p) => p.name === "zone_shops")?.rect;
    expect(zone).toBeDefined();
    for (const name of ["poi_pyramid_steps", "poi_starbucks", "poi_shops_supermarket"]) {
      const p = spawn(name);
      expect(zone && p.x >= zone.x && p.x <= zone.x + zone.width && p.y >= zone.y && p.y <= zone.y + zone.height).toBe(true);
    }
  });

  it("keeps the characters where their story happens", () => {
    const dist = (a: string, b: string) => Math.hypot(spawn(a).x - spawn(b).x, spawn(a).y - spawn(b).y);
    // Chapter 4: walk up to Jayco at the steps (his home radius is 150 px).
    expect(dist("spawn_jayco", "poi_pyramid_steps") + 150).toBeLessThanOrEqual(TERRITORY_NEGOTIATION_NEAR_STEPS_PX + 150);
    expect(dist("spawn_jayco", "poi_pyramid_steps")).toBeLessThanOrEqual(150);
    // The restaurant guard can see a cat eating the scraps (80 px leash + 120 px detect).
    expect(dist("spawn_guard", "poi_restaurant_scraps")).toBeLessThanOrEqual(150);
    // Manu's Fluffy stop and feeding station 3 are together.
    expect(dist("spawn_fluffy", "poi_feeding_station_3")).toBeLessThanOrEqual(GP.CAT_PERSON_GREET_DIST * 2);
  });

  it("keeps snatcher patrols away from the named cats' homes", () => {
    const named = { spawn_blacky: 150, spawn_tiger: 200, spawn_jayco: 150, spawn_jayco_jr: 100, spawn_fluffy: 180, spawn_pedigree: 150, spawn_ginger: 200 };
    for (const route of places.filter((p) => p.name.startsWith("route_snatcher_"))) {
      for (const [name, homeRadius] of Object.entries(named)) {
        const home = spawn(name);
        const closest = Math.min(...(route.polyline ?? []).map((v) => Math.hypot(v.x - home.x, v.y - home.y)));
        expect(closest, `${route.name} vs ${name}`).toBeGreaterThan(homeRadius + 16);
      }
    }
  });

  it("routes every named route end to end on the humans' clearance grid", () => {
    const grid = createNavigationGrid({ width: W, height: H, tileSize: TILE, isBlocked: (x, y) => !clear(x, y) });
    for (const route of places.filter((p) => p.type === "route")) {
      const pts = route.polyline ?? [];
      const routed = routeHumanPath(pts, grid);
      const last = pts[pts.length - 1]!;
      const end = routed.path[routed.path.length - 1]!;
      expect(cellOf(end), route.name).toEqual(cellOf(last));
    }
  });

  it("keeps the other landmarks recognisable", () => {
    expect(tilesAway(spawn("spawn_ginger"), objects, [T.BENCH])).toBeLessThanOrEqual(3); // "the bench near the fountain"
    expect(tilesAway(spawn("poi_fountain_exchange"), ground, [T.WATER, T.WATER_EDGE])).toBeLessThanOrEqual(2);
    expect(tilesAway(spawn("poi_fountain"), ground, [T.WATER, T.WATER_EDGE])).toBeLessThanOrEqual(2);
    expect(tilesAway(spawn("poi_gabriela_silang"), objects, [T.MONUMENT])).toBe(0);
    for (const name of ["poi_covered_area", "poi_library"]) {
      const [x, y] = cellOf(spawn(name));
      expect(overhead[cellIndex(x, y)], `${name} is under a roof`).toBeGreaterThan(0);
    }
    const playground = spawn("poi_playground");
    const carabao = { x: playground.x + TILE * 0.5, y: playground.y + TILE * 4 }; // GameScene.placePlaygroundCarabao
    expect(tilesAway(carabao, ground, [T.PLAYGROUND])).toBeLessThanOrEqual(1);
  });
});

describe("places layer", () => {
  it("provides the roads, exits and routes the systems read", () => {
    const traffic = places.filter((p) => p.type === "traffic");
    expect(traffic).toHaveLength(6);
    for (const lane of traffic) {
      expect(lane.polyline?.length).toBeGreaterThan(1);
      expect(Number(lane.props.lanes)).toBeGreaterThan(0);
    }
    expect(places.filter((p) => p.type === "exit").length).toBeGreaterThanOrEqual(6);
    const routes = ["route_jogger_1", "route_jogger_2", "route_jogger_male", "route_dogwalker_1", "route_dogwalker_2", "route_snatcher_1", "route_snatcher_2", "route_snatcher_3"];
    for (const name of routes) {
      const route = places.find((p) => p.name === name)?.polyline;
      expect(route?.length, name).toBeGreaterThan(1);
      for (const v of route ?? []) {
        const [x, y] = cellOf(v);
        expect(Boolean(reachable[cellIndex(x, y)]), `${name} vertex reachable`).toBe(true);
      }
    }
    expect(places.filter((p) => p.type === "colony_zone").length).toBeGreaterThanOrEqual(4);
  });

  it("keeps the Camille care-route fallbacks identical to the shipped spawns", () => {
    const find = (name: string) => spawns.find((s) => s.name === name) as Phaser.Types.Tilemaps.TiledObject | undefined;
    expect(buildCamilleEraCareRoutes(() => undefined)).toEqual(buildCamilleEraCareRoutes(find));
  });
});
