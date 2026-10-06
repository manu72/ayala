/**
 * Walkway graph for the ambient crowd. Nodes sit along the map's real footway
 * polylines ('walkway' places, walkable by construction), long segments are
 * subdivided, and near-touching polylines are joined. Crowd people move
 * node-to-node with no physics body and no grid A*.
 *
 * Routing uses one shortest-path tree per *target* node (Dijkstra run from the
 * target over the undirected graph): `next[n]` is the neighbour of `n` one step
 * closer to the target, so any number of walkers share one cached tree and a
 * step costs one array read. Pure: no Phaser dependency.
 */

import type { Pt } from "./mapPlaces";

export interface WalkwayGraph {
  readonly size: number;
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  /** CSR adjacency: neighbours of n are adjNode[adjStart[n]] .. adjNode[adjStart[n + 1] - 1]. */
  readonly adjStart: Int32Array;
  readonly adjNode: Int32Array;
  readonly adjLen: Float64Array;
  /** Connected-component id per node. */
  readonly component: Int32Array;
}

/** True when a straight walk from a to b stays on walkable ground. */
export type SegmentClear = (ax: number, ay: number, bx: number, by: number) => boolean;

export interface GraphOptions {
  /** Max px between consecutive nodes along a polyline (default 64 = 2 tiles). */
  spacing?: number;
  /** Polyline vertices within this many px of another polyline's node are joined (default 64). */
  joinDist?: number;
  /** Optional walkability check for join edges. */
  isClear?: SegmentClear;
}

/** Points closer than this collapse into one node (shared OSM junction vertices). */
const MERGE_DIST = 2;

export function buildWalkwayGraph(
  polylines: ReadonlyArray<ReadonlyArray<Pt>>,
  opts: GraphOptions = {},
): WalkwayGraph {
  const spacing = opts.spacing ?? 64;
  const joinDist = opts.joinDist ?? 64;
  const xs: number[] = [];
  const ys: number[] = [];
  const owner: number[] = [];
  const isVertex: boolean[] = [];
  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const edgeKeys = new Set<number>();

  const addNode = (x: number, y: number, poly: number, vertex: boolean): number => {
    for (let i = 0; i < xs.length; i++) {
      if (Math.abs((xs[i] ?? 0) - x) <= MERGE_DIST && Math.abs((ys[i] ?? 0) - y) <= MERGE_DIST) {
        if (vertex) isVertex[i] = true;
        return i;
      }
    }
    xs.push(x);
    ys.push(y);
    owner.push(poly);
    isVertex.push(vertex);
    return xs.length - 1;
  };
  const addEdge = (a: number, b: number): void => {
    if (a === b) return;
    const key = a < b ? a * 1_000_000 + b : b * 1_000_000 + a;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edgeA.push(a);
    edgeB.push(b);
  };

  polylines.forEach((line, poly) => {
    const first = line[0];
    if (!first) return;
    let prev = addNode(first.x, first.y, poly, true);
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      if (!a || !b) continue;
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const n = addNode(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, poly, s === steps);
        // OSM footways can run onto colliding tiles (crossings into the road, building edges):
        // drop those edges; whatever they cut off falls out of the dominant component.
        if (!opts.isClear || opts.isClear(xs[prev] ?? 0, ys[prev] ?? 0, xs[n] ?? 0, ys[n] ?? 0)) addEdge(prev, n);
        prev = n;
      }
    }
  });

  // Join each original vertex to the nearest node of every other polyline in reach.
  const size = xs.length;
  const nearestByPoly = new Map<number, { node: number; d: number }>();
  for (let v = 0; v < size; v++) {
    if (!isVertex[v]) continue;
    const vx = xs[v] ?? 0;
    const vy = ys[v] ?? 0;
    nearestByPoly.clear();
    for (let m = 0; m < size; m++) {
      const poly = owner[m] ?? -1;
      if (m === v || poly === owner[v]) continue;
      const d = Math.hypot((xs[m] ?? 0) - vx, (ys[m] ?? 0) - vy);
      if (d > joinDist) continue;
      const best = nearestByPoly.get(poly);
      if (!best || d < best.d) nearestByPoly.set(poly, { node: m, d });
    }
    for (const { node } of nearestByPoly.values()) {
      if (opts.isClear && !opts.isClear(vx, vy, xs[node] ?? 0, ys[node] ?? 0)) continue;
      addEdge(v, node);
    }
  }

  // CSR adjacency.
  const adjStart = new Int32Array(size + 1);
  for (let e = 0; e < edgeA.length; e++) {
    const a = (edgeA[e] ?? 0) + 1;
    const b = (edgeB[e] ?? 0) + 1;
    adjStart[a] = (adjStart[a] ?? 0) + 1;
    adjStart[b] = (adjStart[b] ?? 0) + 1;
  }
  for (let i = 0; i < size; i++) adjStart[i + 1] = (adjStart[i + 1] ?? 0) + (adjStart[i] ?? 0);
  const fill = adjStart.slice(0, size);
  const adjNode = new Int32Array(edgeA.length * 2);
  const adjLen = new Float64Array(edgeA.length * 2);
  for (let e = 0; e < edgeA.length; e++) {
    const a = edgeA[e] ?? 0;
    const b = edgeB[e] ?? 0;
    const len = Math.hypot((xs[b] ?? 0) - (xs[a] ?? 0), (ys[b] ?? 0) - (ys[a] ?? 0));
    const ia = fill[a] ?? 0;
    const ib = fill[b] ?? 0;
    fill[a] = ia + 1;
    fill[b] = ib + 1;
    adjNode[ia] = b;
    adjLen[ia] = len;
    adjNode[ib] = a;
    adjLen[ib] = len;
  }

  // Connected components (BFS).
  const component = new Int32Array(size).fill(-1);
  const queue = new Int32Array(size);
  let comp = 0;
  for (let s = 0; s < size; s++) {
    if (component[s] !== -1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    component[s] = comp;
    while (head < tail) {
      const n = queue[head++] ?? 0;
      for (let k = adjStart[n] ?? 0; k < (adjStart[n + 1] ?? 0); k++) {
        const m = adjNode[k] ?? 0;
        if (component[m] === -1) {
          component[m] = comp;
          queue[tail++] = m;
        }
      }
    }
    comp++;
  }

  return {
    size,
    xs: Float64Array.from(xs),
    ys: Float64Array.from(ys),
    adjStart,
    adjNode,
    adjLen,
    component,
  };
}

export const degree = (g: WalkwayGraph, n: number): number => (g.adjStart[n + 1] ?? 0) - (g.adjStart[n] ?? 0);

/** The component id that most of `nodes` belong to (-1 for an empty list). */
export function dominantComponent(g: WalkwayGraph, nodes: ReadonlyArray<number>): number {
  const counts = new Map<number, number>();
  let best = -1;
  let bestCount = 0;
  for (const n of nodes) {
    const c = g.component[n];
    if (c === undefined) continue;
    const count = (counts.get(c) ?? 0) + 1;
    counts.set(c, count);
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

export interface SnapOptions {
  /** Only consider nodes in this component. */
  component?: number;
  /** Ignore nodes further than this (default Infinity). */
  maxDist?: number;
  /** The hop from the point to the node must pass this check. */
  isClear?: SegmentClear;
}

/**
 * Nearest node to (x, y) whose straight hop passes `isClear`; -1 if none.
 * Construction-time helper (allocates), not for per-frame use.
 */
export function nearestNode(g: WalkwayGraph, x: number, y: number, opts: SnapOptions = {}): number {
  const maxDist = opts.maxDist ?? Infinity;
  const candidates: Array<{ n: number; d: number }> = [];
  for (let n = 0; n < g.size; n++) {
    if (opts.component !== undefined && g.component[n] !== opts.component) continue;
    const d = Math.hypot((g.xs[n] ?? 0) - x, (g.ys[n] ?? 0) - y);
    if (d <= maxDist) candidates.push({ n, d });
  }
  candidates.sort((a, b) => a.d - b.d);
  for (const { n } of candidates.slice(0, 8)) {
    if (!opts.isClear || opts.isClear(x, y, g.xs[n] ?? 0, g.ys[n] ?? 0)) return n;
  }
  return -1;
}

export interface PathTree {
  readonly target: number;
  /** Next node from n toward the target; -1 at the target or when unreachable. */
  readonly next: Int32Array;
  /** Walkway distance in px from n to the target (Infinity when unreachable). */
  readonly dist: Float64Array;
}

/** Dijkstra from `target` (binary heap with lazy deletion). */
export function buildPathTree(g: WalkwayGraph, target: number): PathTree {
  const dist = new Float64Array(g.size).fill(Infinity);
  const next = new Int32Array(g.size).fill(-1);
  if (target < 0 || target >= g.size) return { target, next, dist };
  const cap = g.adjNode.length + 1;
  const heapNode = new Int32Array(cap);
  const heapKey = new Float64Array(cap);
  let heapSize = 0;
  const push = (n: number, k: number): void => {
    let i = heapSize++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((heapKey[p] ?? 0) <= k) break;
      heapNode[i] = heapNode[p] ?? 0;
      heapKey[i] = heapKey[p] ?? 0;
      i = p;
    }
    heapNode[i] = n;
    heapKey[i] = k;
  };
  const pop = (): number => {
    const top = heapNode[0] ?? 0;
    const lastNode = heapNode[--heapSize] ?? 0;
    const lastKey = heapKey[heapSize] ?? 0;
    let i = 0;
    for (;;) {
      let c = i * 2 + 1;
      if (c >= heapSize) break;
      if (c + 1 < heapSize && (heapKey[c + 1] ?? 0) < (heapKey[c] ?? 0)) c++;
      if ((heapKey[c] ?? 0) >= lastKey) break;
      heapNode[i] = heapNode[c] ?? 0;
      heapKey[i] = heapKey[c] ?? 0;
      i = c;
    }
    heapNode[i] = lastNode;
    heapKey[i] = lastKey;
    return top;
  };

  dist[target] = 0;
  push(target, 0);
  while (heapSize > 0) {
    const key = heapKey[0] ?? 0;
    const n = pop();
    if (key > (dist[n] ?? Infinity)) continue;
    for (let k = g.adjStart[n] ?? 0; k < (g.adjStart[n + 1] ?? 0); k++) {
      const m = g.adjNode[k] ?? 0;
      const nd = key + (g.adjLen[k] ?? 0);
      if (nd < (dist[m] ?? Infinity)) {
        dist[m] = nd;
        next[m] = n;
        push(m, nd);
      }
    }
  }
  return { target, next, dist };
}

/** Node sequence from `from` to the tree's target (inclusive); empty when unreachable. Test/debug helper. */
export function pathToTarget(tree: PathTree, from: number): number[] {
  if (!Number.isFinite(tree.dist[from] ?? Infinity)) return [];
  const out = [from];
  let n = from;
  while (n !== tree.target && out.length <= tree.next.length) {
    n = tree.next[n] ?? -1;
    if (n < 0) return [];
    out.push(n);
  }
  return out;
}

/**
 * Lazily built, cached path trees with a per-frame build budget so a burst of
 * new destinations is spread over several frames instead of one hitch.
 */
export class PathCache {
  private readonly trees = new Map<number, PathTree>();
  private budget: number;

  constructor(
    private readonly graph: WalkwayGraph,
    private readonly buildsPerTick = 2,
  ) {
    this.budget = buildsPerTick;
  }

  /** Refill the build budget; call once per frame. */
  tick(): void {
    this.budget = this.buildsPerTick;
  }

  /** Cached tree, or a fresh one if this frame's budget allows; null means "ask again next frame". */
  get(target: number): PathTree | null {
    const hit = this.trees.get(target);
    if (hit) return hit;
    if (this.budget <= 0) return null;
    this.budget--;
    return this.build(target);
  }

  /** Build (or fetch) ignoring the budget — for construction-time warm-up only. */
  warm(target: number): PathTree {
    return this.trees.get(target) ?? this.build(target);
  }

  get size(): number {
    return this.trees.size;
  }

  private build(target: number): PathTree {
    const tree = buildPathTree(this.graph, target);
    this.trees.set(target, tree);
    return tree;
  }
}
