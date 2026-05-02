import EasyStar from "easystarjs";

export interface RoutePoint {
  x: number;
  y: number;
}

export interface NavigationGridInput {
  width: number;
  height: number;
  tileSize: number;
  isBlocked: (tileX: number, tileY: number) => boolean;
}

export interface NavigationGrid {
  width: number;
  height: number;
  tileSize: number;
  cells: number[][];
}

export interface RoutedHumanPath {
  path: RoutePoint[];
  waypointPauseMs?: number[];
  lingerWaypointIndex?: number;
}

const WALKABLE = 0;
const BLOCKED = 1;

export function createNavigationGrid(input: NavigationGridInput): NavigationGrid {
  const width = Math.max(0, Math.floor(input.width));
  const height = Math.max(0, Math.floor(input.height));
  const cells: number[][] = [];

  for (let y = 0; y < height; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < width; x += 1) {
      row.push(input.isBlocked(x, y) ? BLOCKED : WALKABLE);
    }
    cells.push(row);
  }

  return { width, height, tileSize: input.tileSize, cells };
}

export function routeHumanPath(
  waypoints: RoutePoint[],
  grid: NavigationGrid,
  options: {
    waypointPauseMs?: number[];
    lingerWaypointIndex?: number;
  } = {},
): RoutedHumanPath {
  if (waypoints.length <= 1 || grid.width <= 0 || grid.height <= 0) {
    return {
      path: [...waypoints],
      waypointPauseMs: options.waypointPauseMs ? [...options.waypointPauseMs] : undefined,
      lingerWaypointIndex: options.lingerWaypointIndex,
    };
  }

  const routedPath: RoutePoint[] = [];
  const pauseByIndex: number[] | undefined = options.waypointPauseMs ? [] : undefined;
  const mappedOriginalIndexes: number[] = [];
  const firstCell = nearestWalkableCell(grid, worldToCell(waypoints[0]!, grid));
  routedPath.push(cellToWorld(firstCell, grid));
  if (pauseByIndex) pauseByIndex.push(options.waypointPauseMs?.[0] ?? 0);
  mappedOriginalIndexes[0] = 0;

  for (let i = 1; i < waypoints.length; i += 1) {
    const previousCell = worldToCell(routedPath[routedPath.length - 1]!, grid);
    const targetCell = nearestWalkableCell(grid, worldToCell(waypoints[i]!, grid));
    const segment = findTilePath(grid, previousCell, targetCell);

    if (!segment || segment.length === 0) {
      routedPath.push(cellToWorld(targetCell, grid));
      if (pauseByIndex) pauseByIndex.push(options.waypointPauseMs?.[i] ?? 0);
      mappedOriginalIndexes[i] = routedPath.length - 1;
      continue;
    }

    for (let j = 1; j < segment.length; j += 1) {
      routedPath.push(cellToWorld(segment[j]!, grid));
      if (pauseByIndex) pauseByIndex.push(0);
    }

    const mappedIndex = routedPath.length - 1;
    mappedOriginalIndexes[i] = mappedIndex;
    if (pauseByIndex) {
      pauseByIndex[mappedIndex] = options.waypointPauseMs?.[i] ?? 0;
    }
  }

  return {
    path: routedPath,
    waypointPauseMs: pauseByIndex,
    lingerWaypointIndex:
      options.lingerWaypointIndex === undefined
        ? undefined
        : mappedOriginalIndexes[options.lingerWaypointIndex] ?? options.lingerWaypointIndex,
  };
}

function findTilePath(
  grid: NavigationGrid,
  start: { x: number; y: number },
  end: { x: number; y: number },
): Array<{ x: number; y: number }> | null {
  const easystar = new EasyStar.js();
  (easystar as unknown as { enableSync: () => void }).enableSync();
  easystar.setGrid(grid.cells);
  easystar.setAcceptableTiles([WALKABLE]);
  easystar.setIterationsPerCalculation(Number.MAX_SAFE_INTEGER);

  let result: Array<{ x: number; y: number }> | null | undefined;
  easystar.findPath(start.x, start.y, end.x, end.y, (path: Array<{ x: number; y: number }> | null) => {
    result = path;
  });

  for (let i = 0; result === undefined && i < grid.width * grid.height; i += 1) {
    easystar.calculate();
  }

  return result ?? null;
}

function nearestWalkableCell(grid: NavigationGrid, cell: { x: number; y: number }): { x: number; y: number } {
  const clamped = clampCell(grid, cell);
  if (isWalkable(grid, clamped.x, clamped.y)) return clamped;

  const maxRadius = Math.max(grid.width, grid.height);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let y = clamped.y - radius; y <= clamped.y + radius; y += 1) {
      for (let x = clamped.x - radius; x <= clamped.x + radius; x += 1) {
        const onRing = Math.abs(x - clamped.x) === radius || Math.abs(y - clamped.y) === radius;
        if (onRing && isWalkable(grid, x, y)) {
          return { x, y };
        }
      }
    }
  }

  return clamped;
}

function worldToCell(point: RoutePoint, grid: NavigationGrid): { x: number; y: number } {
  return clampCell(grid, {
    x: Math.floor(point.x / grid.tileSize),
    y: Math.floor(point.y / grid.tileSize),
  });
}

function cellToWorld(cell: { x: number; y: number }, grid: NavigationGrid): RoutePoint {
  return {
    x: cell.x * grid.tileSize + grid.tileSize / 2,
    y: cell.y * grid.tileSize + grid.tileSize / 2,
  };
}

function clampCell(grid: NavigationGrid, cell: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.min(Math.max(0, cell.x), Math.max(0, grid.width - 1)),
    y: Math.min(Math.max(0, cell.y), Math.max(0, grid.height - 1)),
  };
}

function isWalkable(grid: NavigationGrid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height && grid.cells[y]?.[x] === WALKABLE;
}
