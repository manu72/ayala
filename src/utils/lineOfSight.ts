/**
 * Raymarch along segment (ax,ay)→(bx,by); returns false if any sample hits a colliding tile.
 * Pure — supply a tile lookup for tests and for GameScene (objects layer).
 *
 * @throws {RangeError} if `tileSize` is not a positive finite number.
 */
export function hasLineOfSightTiles(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  tileSize: number,
  isBlockedAtWorldPixel: (wx: number, wy: number) => boolean,
): boolean {
  // Precondition: tileSize must be a positive finite number. If it is 0 and
  // the segment has non-zero length, `steps` evaluates to Infinity and the
  // loop below would hang the Phaser main thread. NaN / ±Infinity / negative
  // values are likewise meaningless here. Fail loudly so caller bugs surface
  // in tests instead of as a frozen game tab.
  if (!Number.isFinite(tileSize) || tileSize <= 0) {
    throw new RangeError(
      `hasLineOfSightTiles: tileSize must be a positive finite number (got ${tileSize}).`,
    );
  }

  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(dist / tileSize));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = ax + dx * t;
    const py = ay + dy * t;
    if (isBlockedAtWorldPixel(px, py)) return false;
  }
  return true;
}
