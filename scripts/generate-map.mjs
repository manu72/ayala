/**
 * Generates the Ayala Triangle Gardens tilemap as Tiled-compatible JSON.
 *
 * Map: 100x80 tiles (3200x2560 px at 32x32).
 * Triangular playable area bounded by 3-4 tile wide roads.
 * Gradual zone transitions using transition tiles.
 * Dense tree placement with overhead canopies.
 *
 * Run: node scripts/generate-map.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const T = JSON.parse(readFileSync(join(__dirname, 'tile-indices.json'), 'utf8'))

const MAP_W = 100
const MAP_H = 80
const TILE_SIZE = 32

const t = (id) => id + 1

const ground = new Array(MAP_W * MAP_H).fill(0)
const objects = new Array(MAP_W * MAP_H).fill(0)
const overhead = new Array(MAP_W * MAP_H).fill(0)

function set(layer, x, y, tileId) {
  if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) {
    layer[y * MAP_W + x] = t(tileId)
  }
}

function get(layer, x, y) {
  if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) {
    return layer[y * MAP_W + x]
  }
  return 0
}

function fillArea(layer, x0, y0, w, h, tileId) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      set(layer, x0 + dx, y0 + dy, tileId)
}

// Seeded random for reproducible maps
let seed = 12345
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return (seed >> 16) / 32768
}

// ─────────────────────────────────────────
// TRIANGLE GEOMETRY
// Expanded for 100x80 map
// ─────────────────────────────────────────

const TRI_A = { x: 10, y: 38 }   // west apex
const TRI_B = { x: 90, y: 10 }   // northeast
const TRI_C = { x: 90, y: 65 }   // southeast

function sign(p1, p2, p3) {
  return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
}

function inTriangle(x, y) {
  const pt = { x, y }
  const d1 = sign(pt, TRI_A, TRI_B)
  const d2 = sign(pt, TRI_B, TRI_C)
  const d3 = sign(pt, TRI_C, TRI_A)
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0)
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0)
  return !(hasNeg && hasPos)
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  let param = ((px - ax) * dx + (py - ay) * dy) / lenSq
  param = Math.max(0, Math.min(1, param))
  return Math.hypot(px - (ax + param * dx), py - (ay + param * dy))
}

// Distances to each road edge
function roadDists(x, y) {
  return {
    paseo:  distToSegment(x, y, TRI_A.x, TRI_A.y, TRI_B.x, TRI_B.y),
    makati: distToSegment(x, y, TRI_B.x, TRI_B.y, TRI_C.x, TRI_C.y),
    ayala:  distToSegment(x, y, TRI_C.x, TRI_C.y, TRI_A.x, TRI_A.y),
  }
}

function minRoadDist(x, y) {
  const d = roadDists(x, y)
  return Math.min(d.paseo, d.makati, d.ayala)
}

// Road = 3.5 tiles wide
function isRoad(x, y) { return minRoadDist(x, y) < 3.5 }

// Sidewalk = between road and garden (3.5 to 5.5 tiles from edge)
function isSidewalk(x, y) {
  const d = minRoadDist(x, y)
  return d >= 3.5 && d < 5.5
}

// Transition zone = gradual blend from sidewalk to garden (5.5 to 7.5)
function isTransition(x, y) {
  const d = minRoadDist(x, y)
  return d >= 5.5 && d < 7.5
}

// Zone assignment
function getZone(x, y) {
  if (!inTriangle(x, y)) return 0
  if (isRoad(x, y)) return 0

  // Zone 6: The Shops / Pyramid Steps — northeast corner
  if (x >= 78 && y <= 22) return 6

  // Zone 1: Makati Ave Edge — right side, below Zone 6
  if (x >= 80 && y > 22) return 1

  // Zone 2: Blackbird / Southeast
  if (x >= 62 && y >= 45) return 2

  // Zone 5: Paseo de Roxas Edge & Underpass — along north edge
  if (y <= 20 && x < 78) return 5

  // Zone 7: Playground — northwest area
  if (x <= 30 && y <= 38) return 7

  // Zone 4: Fountain & Exchange Plaza — southwest
  if (x <= 35 && y > 38) return 4

  // Zone 3: Central Gardens — everything else
  return 3
}

// ─────────────────────────────────────────
// GROUND LAYER
// ─────────────────────────────────────────

for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    const d = minRoadDist(x, y)

    if (!inTriangle(x, y)) {
      set(ground, x, y, T.ROAD)
      continue
    }

    if (d < 2.0) {
      // Inner road: lane markings every ~8 tiles
      set(ground, x, y, (x + y) % 8 < 1 ? T.ROAD_LINE : T.ROAD)
      continue
    }

    if (d < 3.5) {
      // Road edge with solid line
      set(ground, x, y, d < 2.5 ? T.ROAD : T.ROAD_EDGE)
      continue
    }

    if (isSidewalk(x, y)) {
      set(ground, x, y, T.SIDEWALK)
      continue
    }

    if (isTransition(x, y)) {
      // Gradual transition: sidewalk → grass with scattered dirt
      set(ground, x, y, rand() < 0.4 ? T.GRASS_TO_PATH : T.SIDEWALK)
      continue
    }

    // Interior zones
    const zone = getZone(x, y)
    switch (zone) {
      case 1: // Makati Ave Edge
        set(ground, x, y, (x + y) % 3 === 0 ? T.STONE_PATH : T.SIDEWALK)
        break

      case 2: // Blackbird area — dense trees on dark grass
        set(ground, x, y, (x + y) % 6 === 0 ? T.STONE_PATH : T.GRASS_DARK)
        break

      case 3: { // Central Gardens — lush green with winding paths
        // Winding paths using sine curves
        const pathA = Math.abs(Math.sin(x * 0.12) * 8 + 35 - y) < 1.5
        const pathB = Math.abs(Math.sin(y * 0.15) * 6 + 50 - x) < 1.5
        const pathC = Math.abs(x * 0.6 + y * 0.4 - 55) < 1.2

        if (pathA || pathB || pathC) {
          set(ground, x, y, T.STONE_PATH)
        } else if (rand() < 0.05) {
          set(ground, x, y, T.GRASS_FLOWER)
        } else {
          set(ground, x, y, rand() < 0.35 ? T.GRASS_DARK : T.GRASS_LIGHT)
        }
        break
      }

      case 4: // Exchange Plaza — stone plaza with path accents
        if (x <= 20 && y >= 50) {
          set(ground, x, y, T.PLAZA)
        } else {
          set(ground, x, y, (x + y) % 5 === 0 ? T.STONE_PATH : T.PLAZA)
        }
        break

      case 5: // Paseo edge — medium grass with walkways
        set(ground, x, y, (x + y) % 4 === 0 ? T.STONE_PATH : T.GRASS_MED)
        break

      case 6: // The Shops / Pyramid Steps
        if (y < 16) {
          set(ground, x, y, T.STEPS)
        } else {
          set(ground, x, y, (x + y) % 2 === 0 ? T.STEPS : T.PLAZA)
        }
        break

      case 7: // Playground
        if (x >= 18 && x <= 28 && y >= 28 && y <= 36) {
          set(ground, x, y, T.PLAYGROUND)
        } else {
          set(ground, x, y, rand() < 0.1 ? T.GRASS_FLOWER : T.GRASS_MED)
        }
        break

      default:
        set(ground, x, y, T.GRASS_LIGHT)
    }
  }
}

// ─────────────────────────────────────────
// OBJECTS LAYER — Trees, hedges, benches, landmarks
// ─────────────────────────────────────────

// Dense trees in Central Gardens (Zone 3)
for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    const zone = getZone(x, y)
    if (zone === 0) continue
    if (get(ground, x, y) === t(T.STONE_PATH)) continue
    if (get(objects, x, y) !== 0) continue

    if (zone === 3 && rand() < 0.07) {
      set(objects, x, y, T.TREE_TRUNK)
      // 3x3 canopy overhead
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy
          if (getZone(nx, ny) !== 0 && get(overhead, nx, ny) === 0) {
            set(overhead, nx, ny, rand() < 0.3 ? T.CANOPY_DENSE : T.TREE_CANOPY)
          }
        }
      }
    }

    if (zone === 2 && rand() < 0.10) {
      set(objects, x, y, T.TREE_TRUNK)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy
          if (getZone(nx, ny) !== 0 && get(overhead, nx, ny) === 0) {
            set(overhead, nx, ny, T.CANOPY_DENSE)
          }
        }
      }
    }

    if (zone === 7 && rand() < 0.04) {
      set(objects, x, y, T.TREE_TRUNK)
      set(overhead, x, y, T.TREE_CANOPY)
    }

    if (zone === 5 && rand() < 0.05) {
      set(objects, x, y, T.TREE_TRUNK)
      set(overhead, x, y, T.TREE_CANOPY)
    }

    if (zone === 4 && rand() < 0.02) {
      set(objects, x, y, T.TREE_TRUNK)
      set(overhead, x, y, T.TREE_CANOPY)
    }
  }
}

// Hedges along zone boundaries (softer placement)
for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    const zone = getZone(x, y)
    if (zone === 0 || get(objects, x, y) !== 0) continue
    if (get(ground, x, y) === t(T.STONE_PATH)) continue

    const neighbors = [getZone(x-1,y), getZone(x+1,y), getZone(x,y-1), getZone(x,y+1)]
    const atBoundary = neighbors.some(n => n !== 0 && n !== zone)
    if (atBoundary && rand() < 0.12) {
      set(objects, x, y, T.SHRUB)
    }
  }
}

// Benches beside paths in Central Gardens
for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    if (getZone(x, y) !== 3) continue
    if (get(ground, x, y) !== t(T.STONE_PATH)) continue
    if (get(objects, x, y) !== 0) continue
    // Place bench if adjacent tile is grass
    const adjGrass = [get(ground,x-1,y), get(ground,x+1,y), get(ground,x,y-1), get(ground,x,y+1)]
      .some(g => g === t(T.GRASS_LIGHT) || g === t(T.GRASS_DARK))
    if (adjGrass && rand() < 0.04) {
      set(objects, x, y, T.BENCH)
    }
  }
}

// ── Landmarks ──

// Fountain (Zone 4, southwest ~x:25, y:52)
fillArea(objects, 23, 50, 5, 5, T.FOUNTAIN_EDGE)
fillArea(ground, 24, 51, 3, 3, T.WATER)
set(objects, 25, 52, T.EMPTY) // clear center object for water to show

// Starbucks (Zone 6, northeast below steps)
fillArea(objects, 82, 18, 5, 3, T.STARBUCKS)

// Tower buildings flanking The Shops
fillArea(objects, 84, 11, 4, 4, T.TOWER)
fillArea(objects, 84, 22, 4, 4, T.TOWER)

// Blackbird / Nielson Tower (Zone 2)
fillArea(objects, 68, 52, 5, 5, T.BUILDING)

// Monument in Zone 7 (northwest apex area)
fillArea(objects, 15, 33, 3, 3, T.MONUMENT)

// Dining area near Blackbird (Manam)
fillArea(objects, 74, 55, 3, 3, T.DINING)

// Boulders / public art in Central Gardens
set(objects, 50, 38, T.BOULDER)
set(objects, 55, 42, T.ART)
set(objects, 48, 30, T.ART)
set(objects, 60, 35, T.BOULDER)

// Flower beds near walkways
for (const [fx, fy] of [[44, 32], [52, 28], [58, 40], [42, 44], [66, 30], [40, 25], [55, 34]]) {
  if (getZone(fx, fy) >= 1 && get(objects, fx, fy) === 0) {
    set(objects, fx, fy, T.FLOWER_BED)
  }
}

// Escalator at Paseo underpass (Zone 5)
fillArea(objects, 30, 16, 3, 2, T.ESCALATOR)

// Playground sculptures (Zone 7)
set(objects, 20, 30, T.ART) // Carabao
set(objects, 26, 32, T.ART) // Hornbill

// Lampposts along main paths (every 8 tiles)
for (let x = 15; x < 88; x += 8) {
  for (let y = 12; y < 65; y += 8) {
    if (getZone(x, y) >= 1 && get(objects, x, y) === 0 && get(ground, x, y) === t(T.STONE_PATH)) {
      set(objects, x, y, T.LAMPPOST)
    }
  }
}

// ─────────────────────────────────────────
// SPAWN POINTS & POIs
// ─────────────────────────────────────────

const objectPoints = [
  // Player & NPC spawns
  { name: 'spawn_mammacat', x: 85, y: 50 },
  { name: 'spawn_blacky',   x: 32, y: 17 },
  { name: 'spawn_tiger',    x: 50, y: 36 },
  { name: 'spawn_jayco',    x: 80, y: 16 },

  // POIs — landmarks
  { name: 'poi_starbucks',  x: 83, y: 19 },
  { name: 'poi_fountain',   x: 25, y: 52 },
  { name: 'poi_monument',   x: 16, y: 34 },
  { name: 'poi_blackbird',  x: 69, y: 53 },
  { name: 'poi_playground', x: 22, y: 31 },
  { name: 'poi_pyramid_steps', x: 82, y: 14 },

  // Food sources — feeding stations
  { name: 'poi_feeding_station_1', x: 48, y: 34 },
  { name: 'poi_feeding_station_2', x: 62, y: 30 },

  // Water sources — bowls near feeding stations
  { name: 'poi_water_bowl_1', x: 49, y: 35 },
  { name: 'poi_water_bowl_2', x: 63, y: 31 },

  // Restaurant scraps (Manam / Blackbird area)
  { name: 'poi_restaurant_scraps', x: 75, y: 56 },
  { name: 'poi_dining',     x: 74, y: 55 },

  // Guard patrol near restaurants
  { name: 'spawn_guard',    x: 73, y: 54 },

  // Safe sleeping spot near start zone
  { name: 'poi_safe_sleep', x: 86, y: 48 },
]

// ─────────────────────────────────────────
// TILED JSON OUTPUT
// ─────────────────────────────────────────

const collisionTiles = new Set([
  T.ROAD, T.ROAD_LINE, T.ROAD_SOLID_LINE, T.BUILDING, T.HEDGE,
  T.TREE_TRUNK, T.WATER, T.TOWER, T.FOUNTAIN_EDGE, T.MONUMENT,
  T.STARBUCKS, T.GLASS_FACADE,
])

const tileProperties = []
for (let i = 0; i < 40; i++) {
  if (collisionTiles.has(i)) {
    tileProperties.push({
      id: i,
      properties: [{ name: 'collides', type: 'bool', value: true }],
    })
  }
}

const tiledMap = {
  compressionlevel: -1,
  height: MAP_H,
  width: MAP_W,
  infinite: false,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  tilewidth: TILE_SIZE,
  tileheight: TILE_SIZE,
  tiledversion: '1.10.2',
  type: 'map',
  version: '1.10',
  nextlayerid: 5,
  nextobjectid: objectPoints.length + 1,
  tilesets: [
    {
      columns: 8,
      firstgid: 1,
      image: '../tilesets/park-tiles.png',
      imageheight: 160,
      imagewidth: 256,
      margin: 0,
      name: 'park-tiles',
      spacing: 0,
      tilecount: 40,
      tilewidth: TILE_SIZE,
      tileheight: TILE_SIZE,
      tiles: tileProperties,
    },
  ],
  layers: [
    { id: 1, name: 'ground', type: 'tilelayer', width: MAP_W, height: MAP_H, x: 0, y: 0, opacity: 1, visible: true, data: ground },
    { id: 2, name: 'objects', type: 'tilelayer', width: MAP_W, height: MAP_H, x: 0, y: 0, opacity: 1, visible: true, data: objects },
    { id: 3, name: 'overhead', type: 'tilelayer', width: MAP_W, height: MAP_H, x: 0, y: 0, opacity: 1, visible: true, data: overhead },
    {
      id: 4, name: 'spawns', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true,
      objects: objectPoints.map((pt, i) => ({
        id: i + 1, name: pt.name, type: '',
        x: pt.x * TILE_SIZE, y: pt.y * TILE_SIZE,
        width: TILE_SIZE, height: TILE_SIZE, visible: true,
      })),
    },
  ],
}

const outDir = join(__dirname, '..', 'public', 'assets', 'tilemaps')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'atg.json')
writeFileSync(outPath, JSON.stringify(tiledMap, null, 2))
console.log(`Created ${outPath}`)
console.log(`Map: ${MAP_W}x${MAP_H} tiles (${MAP_W * TILE_SIZE}x${MAP_H * TILE_SIZE} px)`)
console.log(`Spawn points: ${objectPoints.map(p => p.name).join(', ')}`)
