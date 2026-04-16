/**
 * Raymarch along segment (ax,ay)→(bx,by); returns false if any sample hits a colliding tile.
 * Pure — supply a tile lookup for tests and for GameScene (objects layer).
 */
export function hasLineOfSightTiles(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  tileSize: number,
  isBlockedAtWorldPixel: (wx: number, wy: number) => boolean,
): boolean {
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
