import { describe, it, expect } from 'vitest'
import map from '../../public/assets/tilemaps/atg.json'
import { readPlaces, placesOfType, type TiledObjectLike, type Pt } from '../../src/utils/mapPlaces'
import {
  buildWalkwayGraph,
  buildPathTree,
  degree,
  dominantComponent,
  nearestNode,
  pathToTarget,
  PathCache,
  type SegmentClear,
} from '../../src/utils/walkwayGraph'

const nodeAt = (g: ReturnType<typeof buildWalkwayGraph>, x: number, y: number): number => {
  for (let n = 0; n < g.size; n++) if (Math.abs(g.xs[n]! - x) < 1 && Math.abs(g.ys[n]! - y) < 1) return n
  return -1
}

describe('buildWalkwayGraph', () => {
  it('merges shared junction vertices into one node', () => {
    const g = buildWalkwayGraph([
      [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }],
      [{ x: 50, y: -50 }, { x: 50, y: 0 }, { x: 50, y: 50 }],
    ])
    const junction = nodeAt(g, 50, 0)
    expect(junction).toBeGreaterThanOrEqual(0)
    expect(degree(g, junction)).toBe(4)
    expect(g.size).toBe(5)
    expect(new Set(g.component).size).toBe(1)
  })

  it('subdivides long segments so no edge exceeds the spacing', () => {
    const g = buildWalkwayGraph([[{ x: 0, y: 0 }, { x: 300, y: 0 }]], { spacing: 64 })
    expect(g.size).toBe(6) // ceil(300 / 64) = 5 steps
    for (let k = 0; k < g.adjLen.length; k++) expect(g.adjLen[k]!).toBeLessThanOrEqual(64)
  })

  it('joins a polyline end that stops just short of another walkway', () => {
    const joined = buildWalkwayGraph(
      [
        [{ x: 0, y: 0 }, { x: 128, y: 0 }],
        [{ x: 64, y: 40 }, { x: 64, y: 200 }],
      ],
      { joinDist: 64 },
    )
    expect(new Set(joined.component).size).toBe(1)

    const apart = buildWalkwayGraph(
      [
        [{ x: 0, y: 0 }, { x: 128, y: 0 }],
        [{ x: 64, y: 100 }, { x: 64, y: 200 }],
      ],
      { joinDist: 64 },
    )
    expect(new Set(apart.component).size).toBe(2)
  })

  it('drops polyline edges that cross colliding ground (e.g. a footway running into the road)', () => {
    // Road band at 100 < x < 160: the footway crosses it, so it must split in two.
    const road: SegmentClear = (ax, _ay, bx) => !(Math.max(ax, bx) > 100 && Math.min(ax, bx) < 160)
    const g = buildWalkwayGraph([[{ x: 0, y: 0 }, { x: 256, y: 0 }]], { spacing: 32, isClear: road })
    const west = nodeAt(g, 96, 0)
    const east = nodeAt(g, 160, 0)
    expect(west).toBeGreaterThanOrEqual(0)
    expect(east).toBeGreaterThanOrEqual(0)
    expect(g.component[west]).not.toBe(g.component[east])
    expect(Number.isFinite(buildPathTree(g, west).dist[east]!)).toBe(false)
  })

  it('copes with single-point and zero-length polylines (no NaN, no self-loops)', () => {
    const g = buildWalkwayGraph([[{ x: 5, y: 5 }], [{ x: 400, y: 400 }, { x: 400, y: 400 }], []])
    expect(g.size).toBe(2)
    expect(g.adjNode).toHaveLength(0)
    for (let n = 0; n < g.size; n++) expect(Number.isFinite(g.xs[n]! + g.ys[n]!)).toBe(true)
    const tree = buildPathTree(g, 0)
    expect(tree.dist[0]).toBe(0)
    expect(tree.dist[1]).toBe(Infinity)
    expect(buildPathTree(buildWalkwayGraph([]), 0).next).toHaveLength(0)
  })

  it('lets a walkability check veto joins (e.g. across a wall)', () => {
    const wallAtY20: SegmentClear = (_ax, ay, _bx, by) => !(Math.min(ay, by) < 20 && Math.max(ay, by) > 20)
    const g = buildWalkwayGraph(
      [
        [{ x: 0, y: 0 }, { x: 128, y: 0 }],
        [{ x: 64, y: 40 }, { x: 64, y: 200 }],
      ],
      { joinDist: 64, isClear: wallAtY20 },
    )
    expect(new Set(g.component).size).toBe(2)
  })
})

describe('nearestNode', () => {
  const g = buildWalkwayGraph([
    [{ x: 0, y: 0 }, { x: 60, y: 0 }],
    [{ x: 1000, y: 0 }, { x: 1060, y: 0 }],
  ])

  it('returns the closest node, honouring component and maxDist filters', () => {
    expect(nearestNode(g, 10, 5)).toBe(nodeAt(g, 0, 0))
    const otherComp = g.component[nodeAt(g, 1000, 0)]!
    expect(nearestNode(g, 10, 5, { component: otherComp })).toBe(nodeAt(g, 1000, 0))
    expect(nearestNode(g, 500, 0, { maxDist: 100 })).toBe(-1)
  })

  it('skips nodes whose hop is blocked and falls back to the next clear one', () => {
    const blockLeft: SegmentClear = (_ax, _ay, bx) => bx > 30
    expect(nearestNode(g, 10, 5, { isClear: blockLeft })).toBe(nodeAt(g, 60, 0))
  })
})

describe('buildPathTree', () => {
  // Square with a long and a short way round: A(0,0) B(64,0) C(64,64) D(0,64), plus a spur.
  const g = buildWalkwayGraph(
    [
      [{ x: 0, y: 0 }, { x: 64, y: 0 }, { x: 64, y: 64 }, { x: 0, y: 64 }, { x: 0, y: 0 }],
      [{ x: 500, y: 500 }, { x: 540, y: 500 }],
    ],
    { spacing: 64 },
  )
  const A = nodeAt(g, 0, 0)
  const B = nodeAt(g, 64, 0)
  const D = nodeAt(g, 0, 64)

  it('gives shortest walkway distances and next hops toward the target', () => {
    const tree = buildPathTree(g, A)
    expect(tree.dist[A]).toBe(0)
    expect(tree.dist[B]).toBeCloseTo(64)
    expect(tree.dist[D]).toBeCloseTo(64)
    expect(tree.next[B]).toBe(A)
    expect(pathToTarget(tree, nodeAt(g, 64, 64))).toHaveLength(3)
  })

  it('marks other components unreachable', () => {
    const tree = buildPathTree(g, A)
    const far = nodeAt(g, 500, 500)
    expect(tree.dist[far]).toBe(Infinity)
    expect(tree.next[far]).toBe(-1)
    expect(pathToTarget(tree, far)).toEqual([])
  })
})

describe('PathCache', () => {
  const g = buildWalkwayGraph([[{ x: 0, y: 0 }, { x: 640, y: 0 }]])

  it('builds at most N new trees per tick and serves cached trees for free', () => {
    const cache = new PathCache(g, 2)
    const a = cache.get(0)
    const b = cache.get(1)
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(cache.get(2)).toBeNull() // budget spent
    expect(cache.get(0)).toBe(a) // cached: no budget needed
    cache.tick()
    expect(cache.get(2)).not.toBeNull()
    expect(cache.size).toBe(3)
  })

  it('warm() ignores the budget', () => {
    const cache = new PathCache(g, 0)
    expect(cache.get(3)).toBeNull()
    expect(cache.warm(3).target).toBe(3)
    expect(cache.get(3)).not.toBeNull()
  })
})

describe('walkway graph on the shipped map', () => {
  const m = map as unknown as {
    width: number
    height: number
    tilewidth: number
    tilesets: Array<{ firstgid: number; tiles?: Array<{ id: number; properties?: Array<{ name: string; value: unknown }> }> }>
    layers: Array<{ name: string; data?: number[]; objects?: TiledObjectLike[] }>
  }
  const colliding = new Set<number>()
  for (const ts of m.tilesets) {
    for (const t of ts.tiles ?? []) {
      if ((t.properties ?? []).some((p) => p.name === 'collides' && p.value === true)) colliding.add(ts.firstgid + t.id)
    }
  }
  const ground = m.layers.find((l) => l.name === 'ground')?.data ?? []
  const objects = m.layers.find((l) => l.name === 'objects')?.data ?? []
  const blocked = (x: number, y: number): boolean => {
    const tx = Math.floor(x / m.tilewidth)
    const ty = Math.floor(y / m.tilewidth)
    if (tx < 0 || ty < 0 || tx >= m.width || ty >= m.height) return true
    const i = ty * m.width + tx
    return colliding.has(ground[i] ?? 0) || colliding.has(objects[i] ?? 0)
  }
  const isClear: SegmentClear = (ax, ay, bx, by) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 8))
    for (let i = 0; i <= steps; i++) if (blocked(ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps)) return false
    return true
  }
  const places = readPlaces(m.layers.find((l) => l.name === 'places')?.objects ?? [])
  const walkways = placesOfType(places, 'walkway').flatMap((p) => (p.polyline ? [p.polyline] : [])) as Pt[][]

  it('builds quickly and links most exits into one walkable network', () => {
    const t0 = performance.now()
    const g = buildWalkwayGraph(walkways, { isClear })
    expect(performance.now() - t0).toBeLessThan(250)
    expect(g.size).toBeGreaterThan(100)

    const exits = placesOfType(places, 'exit')
    const exitNodes = exits.map((e) => nearestNode(g, e.x, e.y, { maxDist: 600, isClear }))
    const main = dominantComponent(g, exitNodes.filter((n) => n >= 0))
    const linked = exitNodes.filter((n) => n >= 0 && g.component[n] === main)
    expect(linked.length).toBeGreaterThanOrEqual(Math.ceil(exits.length / 2))

    const tree = buildPathTree(g, linked[0]!)
    for (const n of linked) expect(Number.isFinite(tree.dist[n]!)).toBe(true)
  })

  it('never routes the crowd across roads or through buildings (every edge of the main network is clear)', () => {
    const g = buildWalkwayGraph(walkways, { isClear })
    const exits = placesOfType(places, 'exit').map((e) => nearestNode(g, e.x, e.y, { maxDist: 600, isClear }))
    const main = dominantComponent(g, exits.filter((n) => n >= 0))
    let edges = 0
    for (let n = 0; n < g.size; n++) {
      if (g.component[n] !== main) continue
      for (let k = g.adjStart[n]!; k < g.adjStart[n + 1]!; k++) {
        const o = g.adjNode[k]!
        edges++
        expect(isClear(g.xs[n]!, g.ys[n]!, g.xs[o]!, g.ys[o]!), `${g.xs[n]},${g.ys[n]} -> ${g.xs[o]},${g.ys[o]}`).toBe(true)
      }
    }
    expect(edges).toBeGreaterThan(500)
  })

  it('reaches most crowd anchors with a clear off-walkway hop', () => {
    const g = buildWalkwayGraph(walkways, { isClear })
    for (const type of ['bench', 'dining', 'picnic', 'smoking', 'selfie']) {
      const anchors = placesOfType(places, type)
      const ok = anchors.filter((a) => nearestNode(g, a.x, a.y, { maxDist: 600, isClear }) >= 0)
      expect(ok.length, type).toBeGreaterThanOrEqual(Math.ceil(anchors.length * 0.6))
    }
  })
})
