/**
 * Road tiles carry the tileset property `road` (scripts/generate-map.mjs). They still collide —
 * traffic's `isDrivable` and the human nav grid read `collides` — but Mamma Cat may cross them.
 */

/** The Phaser.Tilemaps.Tile fields these helpers touch, so tests can pass plain objects. */
export interface RoadFaceTile {
  collides: boolean;
  properties: unknown;
  faceTop: boolean;
  faceBottom: boolean;
  faceLeft: boolean;
  faceRight: boolean;
}

export function isRoadTile(tile: { properties?: unknown } | null | undefined): boolean {
  return (tile?.properties as { road?: unknown } | null | undefined)?.road === true;
}

/**
 * Arcade only separates a body from a tile on its "interesting" faces, and Phaser drops every face
 * two colliding tiles share. Roads collide, so a building / tower / water tile touching a road has
 * no face toward it, and from the asphalt Mamma Cat would walk straight in. Give those tiles their
 * road-side faces back; run after setCollision*. Nobody else can stand on a road, so nobody else
 * ever meets these faces. Returns the number of faces restored.
 */
export function exposeFacesTowardRoads(
  width: number,
  height: number,
  tileAt: (x: number, y: number) => RoadFaceTile | null | undefined,
): number {
  const roadAt = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && isRoadTile(tileAt(x, y));
  let restored = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tileAt(x, y);
      if (!tile?.collides || isRoadTile(tile)) continue;
      if (!tile.faceTop && roadAt(x, y - 1)) {
        tile.faceTop = true;
        restored++;
      }
      if (!tile.faceBottom && roadAt(x, y + 1)) {
        tile.faceBottom = true;
        restored++;
      }
      if (!tile.faceLeft && roadAt(x - 1, y)) {
        tile.faceLeft = true;
        restored++;
      }
      if (!tile.faceRight && roadAt(x + 1, y)) {
        tile.faceRight = true;
        restored++;
      }
    }
  }
  return restored;
}
