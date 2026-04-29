export interface ReachableCellsInput {
  width: number;
  height: number;
  startX: number;
  startY: number;
  isBlocked: (x: number, y: number) => boolean;
}

export function getCellKey(x: number, y: number, width: number): number {
  return y * width + x;
}

export function computeReachableCells(input: ReachableCellsInput): Set<number> {
  const width = Math.max(0, Math.floor(input.width));
  const height = Math.max(0, Math.floor(input.height));
  const startX = Math.floor(input.startX);
  const startY = Math.floor(input.startY);
  const reachable = new Set<number>();

  if (!isInBounds(startX, startY, width, height) || input.isBlocked(startX, startY)) {
    return reachable;
  }

  const queue: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
  reachable.add(getCellKey(startX, startY, width));

  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i]!;
    for (const next of neighbours(current.x, current.y)) {
      if (!isInBounds(next.x, next.y, width, height)) continue;
      if (input.isBlocked(next.x, next.y)) continue;
      const key = getCellKey(next.x, next.y, width);
      if (reachable.has(key)) continue;
      reachable.add(key);
      queue.push(next);
    }
  }

  return reachable;
}

function isInBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function neighbours(x: number, y: number): Array<{ x: number; y: number }> {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ];
}
