import { describe, expect, it } from "vitest";
// Phaser's own face culling and tile separation (pure CommonJS modules), so the test
// exercises the exact Arcade behaviour the helper works around.
// @ts-expect-error untyped Phaser internals
import CalculateFacesWithin from "phaser/src/tilemaps/components/CalculateFacesWithin";
// @ts-expect-error untyped Phaser internals
import SeparateTile from "phaser/src/physics/arcade/tilemap/SeparateTile";
import { exposeFacesTowardRoads, isRoadTile, type RoadFaceTile } from "../../src/utils/roadTiles";

const TILE = 32;
type FakeTile = RoadFaceTile & { x: number; y: number; index: number; collideLeft: boolean; collideRight: boolean; collideUp: boolean; collideDown: boolean; resetFaces(): void };

/** One row per string: `.` pavement, `R` road, `B` building (collides, not a road). */
function layerOf(rows: string[]) {
  const data = rows.map((row, y) =>
    [...row].map((c, x): FakeTile => {
      const collides = c !== ".";
      return {
        x,
        y,
        index: 1,
        collides,
        collideLeft: collides,
        collideRight: collides,
        collideUp: collides,
        collideDown: collides,
        properties: c === "R" ? { collides: true, road: true } : collides ? { collides: true } : {},
        faceTop: false,
        faceBottom: false,
        faceLeft: false,
        faceRight: false,
        resetFaces() {
          this.faceTop = this.faceBottom = this.faceLeft = this.faceRight = false;
        },
      };
    }),
  );
  const layer = { width: rows[0]!.length, height: rows.length, data };
  CalculateFacesWithin(0, 0, layer.width, layer.height, layer);
  const tileAt = (x: number, y: number): FakeTile | null => data[y]?.[x] ?? null;
  return { layer, tileAt };
}

/** A 12 px Arcade-like body that just moved `dx` px to the right. */
function bodyAt(x: number, y: number, dx: number) {
  const position = { x, y };
  return {
    position,
    get x() {
      return position.x;
    },
    get y() {
      return position.y;
    },
    get right() {
      return position.x + 12;
    },
    get bottom() {
      return position.y + 12;
    },
    deltaX: () => dx,
    deltaY: () => 0,
    deltaAbsX: () => Math.abs(dx),
    deltaAbsY: () => 0,
    checkCollision: { left: true, right: true, up: true, down: true },
    blocked: { none: true, left: false, right: false, up: false, down: false },
    bounce: { x: 0, y: 0 },
    velocity: { x: dx * 60, y: 0 },
    customSeparateX: false,
    customSeparateY: false,
    updateCenter: () => {},
  };
}

/** Arcade's sprite-vs-layer pass: colliding tiles with an interesting face, then the process callback, then separation. */
function collide(tiles: FakeTile[], body: ReturnType<typeof bodyAt>, process: (t: FakeTile) => boolean): void {
  tiles.forEach((tile, i) => {
    if (!tile.collides || !(tile.faceTop || tile.faceBottom || tile.faceLeft || tile.faceRight)) return;
    const rect = { left: tile.x * TILE, top: tile.y * TILE, right: (tile.x + 1) * TILE, bottom: (tile.y + 1) * TILE };
    const hits = !(body.right <= rect.left || body.bottom <= rect.top || body.x >= rect.right || body.y >= rect.bottom);
    if (hits && process(tile)) SeparateTile(i, body, tile, rect, null, 16, true);
  });
}

describe("isRoadTile", () => {
  it("is true only for tiles whose tileset properties carry road=true", () => {
    expect(isRoadTile({ properties: { collides: true, road: true } })).toBe(true);
    expect(isRoadTile({ properties: { collides: true } })).toBe(false);
    expect(isRoadTile({ properties: { road: "true" } })).toBe(false);
    expect(isRoadTile({ properties: undefined })).toBe(false);
    expect(isRoadTile(null)).toBe(false);
    expect(isRoadTile(undefined)).toBe(false);
  });
});

describe("exposeFacesTowardRoads", () => {
  const rows = [".RRBB", ".RRBB", ".RRBB"];

  it("gives buildings back the faces Phaser culled against roads, and touches nothing else", () => {
    const { layer, tileAt } = layerOf(rows);
    const snapshot = () => layer.data.flat().map((t) => [t.faceTop, t.faceBottom, t.faceLeft, t.faceRight].join());
    const before = snapshot();
    expect(tileAt(3, 1)!.faceLeft).toBe(false); // Phaser: shared with a colliding road tile

    expect(exposeFacesTowardRoads(layer.width, layer.height, tileAt)).toBe(3);
    expect([0, 1, 2].every((y) => tileAt(3, y)!.faceLeft)).toBe(true);
    const after = snapshot();
    const changed = after.flatMap((s, i) => (s === before[i] ? [] : [i]));
    expect(changed).toEqual([3, 8, 13]); // the x=3 building column only
    expect(tileAt(4, 1)!.faceLeft).toBe(false); // building-to-building stays culled
    expect(tileAt(1, 1)!.faceLeft).toBe(true); // road keeps its pavement-side face for everyone else
    expect(exposeFacesTowardRoads(layer.width, layer.height, tileAt)).toBe(0); // idempotent
  });

  it("restores faces on every side, and copes with empty cells and the layer edge", () => {
    const { layer, tileAt } = layerOf(["RRR", "RBR", "RRR"]);
    expect(exposeFacesTowardRoads(layer.width, layer.height, tileAt)).toBe(4);
    const b = tileAt(1, 1)!;
    expect([b.faceTop, b.faceBottom, b.faceLeft, b.faceRight]).toEqual([true, true, true, true]);
    expect(exposeFacesTowardRoads(2, 2, (x, y) => (x === 0 && y === 0 ? null : undefined))).toBe(0);
  });

  it("stops Mamma Cat at a building's road-side edge (without it Arcade lets her walk in)", () => {
    const notRoad = (t: FakeTile) => !isRoadTile(t);
    const step = (expose: boolean) => {
      const { layer, tileAt } = layerOf(rows);
      if (expose) exposeFacesTowardRoads(layer.width, layer.height, tileAt);
      const body = bodyAt(3 * TILE - 12 + 3, 1 * TILE + 10, 3); // on the road, 3 px into the building
      collide(layer.data.flat(), body, notRoad);
      return body.right;
    };
    expect(step(false)).toBe(3 * TILE + 3);
    expect(step(true)).toBe(3 * TILE);
  });

  it("lets Mamma Cat step from the pavement onto the road while everyone else is still stopped at the kerb", () => {
    const { layer, tileAt } = layerOf(rows);
    exposeFacesTowardRoads(layer.width, layer.height, tileAt);
    const cat = bodyAt(TILE - 12 + 3, TILE + 10, 3);
    collide(layer.data.flat(), cat, (t) => !isRoadTile(t));
    expect(cat.right).toBe(TILE + 3);
    const npc = bodyAt(TILE - 12 + 3, TILE + 10, 3);
    collide(layer.data.flat(), npc, () => true);
    expect(npc.right).toBe(TILE);
  });
});
