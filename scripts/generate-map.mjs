/**
 * Generates the Ayala Triangle Gardens tilemap as Tiled-compatible JSON.
 *
 * The map is 80x60 tiles (2560x1920 px at 32x32).
 * The playable area is a triangle bounded by three roads:
 *   - Paseo de Roxas along the top (north)
 *   - Makati Ave along the right (east/southeast)
 *   - Ayala Ave along the bottom-left (southwest)
 *
 * The triangle apex points left (west). Roads are impassable.
 *
 * Run: node scripts/generate-map.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const T = JSON.parse(readFileSync(join(__dirname, 'tile-indices.json'), 'utf8'))

const MAP_W = 80
const MAP_H = 60
const TILE_SIZE = 32

// Tiled uses 1-based tile IDs (0 = empty)
const t = (id) => id + 1

// Layers stored as flat arrays (row-major)
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
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      set(layer, x0 + dx, y0 + dy, tileId)
    }
  }
}

/**
 * Determine if a tile (x, y) is inside the ATG triangle.
 *
 * Triangle vertices (in tile coordinates):
 *   A = (8, 28)  — west apex (where Ayala Ave meets Paseo de Roxas)
 *   B = (72, 8)  — northeast corner (Makati Ave meets Paseo de Roxas / The Shops)
 *   C = (72, 48) — southeast corner (Makati Ave meets Ayala Ave)
 *
 * The triangle is elongated, pointing west like the real ATG.
 */
const TRI_A = { x: 8, y: 28 }    // west apex
const TRI_B = { x: 72, y: 8 }    // northeast
const TRI_C = { x: 72, y: 48 }   // southeast

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

// Distance from a point to a line segment (for road borders)
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  let param = ((px - ax) * dx + (py - ay) * dy) / lenSq
  param = Math.max(0, Math.min(1, param))
  return Math.hypot(px - (ax + param * dx), py - (ay + param * dy))
}

function isRoad(x, y) {
  const roadWidth = 2.5
  const dAB = distToSegment(x, y, TRI_A.x, TRI_A.y, TRI_B.x, TRI_B.y) // Paseo de Roxas (north)
  const dBC = distToSegment(x, y, TRI_B.x, TRI_B.y, TRI_C.x, TRI_C.y) // Makati Ave (east)
  const dCA = distToSegment(x, y, TRI_C.x, TRI_C.y, TRI_A.x, TRI_A.y) // Ayala Ave (southwest)
  return Math.min(dAB, dBC, dCA) < roadWidth
}

function isSidewalk(x, y) {
  const swWidth = 4.5
  const dAB = distToSegment(x, y, TRI_A.x, TRI_A.y, TRI_B.x, TRI_B.y)
  const dBC = distToSegment(x, y, TRI_B.x, TRI_B.y, TRI_C.x, TRI_C.y)
  const dCA = distToSegment(x, y, TRI_C.x, TRI_C.y, TRI_A.x, TRI_A.y)
  return Math.min(dAB, dBC, dCA) < swWidth
}

// Distance from point to triangle center, used for zone assignment
const CENTER = { x: (TRI_A.x + TRI_B.x + TRI_C.x) / 3, y: (TRI_A.y + TRI_B.y + TRI_C.y) / 3 }

/**
 * Assign zone IDs based on geographic position within the triangle.
 * Returns zone 1-7 or 0 if outside.
 */
function getZone(x, y) {
  if (!inTriangle(x, y)) return 0
  if (isRoad(x, y)) return 0

  // Zone 6: The Shops / Pyramid Steps — northeast corner
  if (x >= 62 && y <= 18) return 6

  // Zone 1: Makati Ave Edge — right side, below Zone 6
  if (x >= 64 && y > 18) return 1

  // Zone 2: Blackbird / Southeast — lower-right
  if (x >= 50 && y >= 35) return 2

  // Zone 5: Paseo de Roxas Edge & Underpass — along north edge
  if (y <= 16 && x < 62) return 5

  // Zone 7: Playground — northwest area
  if (x <= 25 && y <= 28) return 7

  // Zone 4: Fountain & Exchange Plaza — southwest
  if (x <= 30 && y > 28) return 4

  // Zone 3: Central Gardens — everything else
  return 3
}

// --- STEP 1: Fill the ground layer ---

for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    if (isRoad(x, y)) {
      // Alternate road and road-with-lines
      set(ground, x, y, (x + y) % 8 === 0 ? T.ROAD_LINE : T.ROAD)
    } else if (!inTriangle(x, y)) {
      // Outside the triangle: road/city
      set(ground, x, y, T.ROAD)
    } else if (isSidewalk(x, y)) {
      set(ground, x, y, T.SIDEWALK)
    } else {
      const zone = getZone(x, y)
      switch (zone) {
        case 1: // Makati Ave Edge — sidewalk and terraced area
          set(ground, x, y, (x + y) % 3 === 0 ? T.STONE_PATH : T.SIDEWALK)
          break
        case 2: // Blackbird area — tree-lined paths
          set(ground, x, y, (x + y) % 5 === 0 ? T.STONE_PATH : T.GRASS_DARK)
          break
        case 3: // Central Gardens — lush green with paths
          if ((x % 12 === 0 || y % 10 === 0) && Math.abs(x - y) % 3 !== 0) {
            set(ground, x, y, T.STONE_PATH)
          } else {
            set(ground, x, y, Math.random() < 0.3 ? T.GRASS_DARK : T.GRASS_LIGHT)
          }
          break
        case 4: // Exchange Plaza — stone plaza
          set(ground, x, y, (x + y) % 4 === 0 ? T.STONE_PATH : T.PLAZA)
          break
        case 5: // Paseo de Roxas edge
          set(ground, x, y, (x + y) % 3 === 0 ? T.STONE_PATH : T.GRASS_MED)
          break
        case 6: // The Shops / Pyramid Steps
          set(ground, x, y, (x + y) % 2 === 0 ? T.STEPS : T.PLAZA)
          break
        case 7: // Playground area
          if (x % 4 < 2 && y % 4 < 2) {
            set(ground, x, y, T.PLAYGROUND)
          } else {
            set(ground, x, y, T.GRASS_MED)
          }
          break
        default:
          set(ground, x, y, T.GRASS_LIGHT)
      }
    }
  }
}

// --- STEP 2: Place objects ---

// Place trees throughout the Central Gardens (Zone 3)
for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    const zone = getZone(x, y)
    if (zone === 3 && Math.random() < 0.06 && get(ground, x, y) !== t(T.STONE_PATH)) {
      set(objects, x, y, T.TREE_TRUNK)
      // Canopy overhead
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (getZone(x + dx, y + dy) === 3) {
            set(overhead, x + dx, y + dy, T.TREE_CANOPY)
          }
        }
      }
    }
    // Blackbird area — denser trees
    if (zone === 2 && Math.random() < 0.08 && get(ground, x, y) !== t(T.STONE_PATH)) {
      set(objects, x, y, T.TREE_TRUNK)
      set(overhead, x, y, T.CANOPY_DENSE)
    }
    // Playground area — scattered trees
    if (zone === 7 && Math.random() < 0.03) {
      set(objects, x, y, T.TREE_TRUNK)
      set(overhead, x, y, T.TREE_CANOPY)
    }
    // Paseo edge — some trees
    if (zone === 5 && Math.random() < 0.04 && get(ground, x, y) !== t(T.STONE_PATH)) {
      set(objects, x, y, T.TREE_TRUNK)
      set(overhead, x, y, T.TREE_CANOPY)
    }
  }
}

// Hedges along boundaries between zones
for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    const zone = getZone(x, y)
    if (zone === 0) continue
    // Check if adjacent to a different zone (not 0) — place hedge
    const neighbors = [getZone(x - 1, y), getZone(x + 1, y), getZone(x, y - 1), getZone(x, y + 1)]
    const differentZone = neighbors.some(n => n !== 0 && n !== zone)
    if (differentZone && Math.random() < 0.15 && get(objects, x, y) === 0) {
      set(objects, x, y, T.SHRUB)
    }
  }
}

// Benches along paths in Central Gardens
for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    if (getZone(x, y) === 3 && get(ground, x, y) === t(T.STONE_PATH) && Math.random() < 0.02) {
      if (get(objects, x, y) === 0) {
        set(objects, x, y, T.BENCH)
      }
    }
  }
}

// Place specific landmarks

// Fountain in Zone 4 (southwest, ~x:20, y:35)
fillArea(objects, 18, 34, 4, 4, T.FOUNTAIN_EDGE)
fillArea(ground, 19, 35, 2, 2, T.WATER)

// Starbucks in Zone 6 (northeast, below pyramid steps)
fillArea(objects, 65, 14, 4, 3, T.STARBUCKS)

// Tower buildings flanking The Shops
fillArea(objects, 67, 9, 3, 3, T.TOWER)
fillArea(objects, 67, 18, 3, 3, T.TOWER)

// Blackbird / Nielson Tower in Zone 2
fillArea(objects, 55, 40, 4, 4, T.BUILDING)

// Monument in Zone 7 (northwest apex)
fillArea(objects, 12, 25, 2, 2, T.MONUMENT)

// Dining area near Blackbird (Manam)
fillArea(objects, 60, 42, 3, 2, T.DINING)

// Boulder / public art in central gardens
set(objects, 40, 28, T.BOULDER)
set(objects, 45, 32, T.ART)
set(objects, 38, 22, T.ART)

// Flower beds near walkways
for (const [fx, fy] of [[35, 25], [42, 20], [48, 30], [33, 32], [55, 22]]) {
  if (getZone(fx, fy) >= 1) {
    set(objects, fx, fy, T.FLOWER_BED)
  }
}

// Escalator at Paseo underpass (Zone 5, ~x:25, y:12)
fillArea(objects, 24, 12, 2, 2, T.ESCALATOR)

// Playground sculptures in Zone 7
set(objects, 16, 20, T.ART) // Carabao
set(objects, 20, 22, T.ART) // Hornbill

// Lampposts along main paths
for (let x = 15; x < 70; x += 10) {
  for (let y = 10; y < 50; y += 10) {
    if (getZone(x, y) >= 1 && get(objects, x, y) === 0 && get(ground, x, y) === t(T.STONE_PATH)) {
      set(objects, x, y, T.LAMPPOST)
    }
  }
}

// --- STEP 3: Build Tiled JSON ---

// Object layer with spawn points and POIs
const objectPoints = [
  { name: 'spawn_mammacat', x: 68, y: 38 },      // Zone 1: Makati Ave edge, Sto. Tomas corner
  { name: 'spawn_blacky', x: 26, y: 13 },         // Zone 5: top of escalator
  { name: 'poi_starbucks', x: 66, y: 15 },        // Zone 6: Starbucks
  { name: 'poi_fountain', x: 20, y: 36 },         // Zone 4: fountain
  { name: 'poi_feeding_station_1', x: 38, y: 26 },// Zone 3: central gardens
  { name: 'poi_feeding_station_2', x: 50, y: 24 },// Zone 3: central gardens
  { name: 'poi_monument', x: 13, y: 26 },         // Zone 7: Ninoy Aquino monument
  { name: 'poi_blackbird', x: 56, y: 41 },        // Zone 2: Blackbird restaurant
  { name: 'poi_playground', x: 18, y: 21 },       // Zone 7: playground
  { name: 'poi_dining', x: 61, y: 43 },           // Zone 2: Manam
  { name: 'poi_pyramid_steps', x: 65, y: 12 },    // Zone 6: pyramid steps
]

// Build collision property for tiles that block movement
// Roads, buildings, hedges, tree trunks, water, towers, monument, fountain edge
const collisionTiles = new Set([
  T.ROAD, T.ROAD_LINE, T.BUILDING, T.HEDGE, T.TREE_TRUNK,
  T.WATER, T.TOWER, T.FOUNTAIN_EDGE, T.MONUMENT, T.STARBUCKS,
])

const tileProperties = []
for (let i = 0; i < TILE_SIZE; i++) {
  if (collisionTiles.has(i)) {
    tileProperties.push({
      id: i,
      properties: [{ name: 'collides', type: 'bool', value: true }]
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
      imageheight: 128,
      imagewidth: 256,
      margin: 0,
      name: 'park-tiles',
      spacing: 0,
      tilecount: 32,
      tilewidth: TILE_SIZE,
      tileheight: TILE_SIZE,
      tiles: tileProperties,
    }
  ],
  layers: [
    {
      id: 1,
      name: 'ground',
      type: 'tilelayer',
      width: MAP_W,
      height: MAP_H,
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      data: ground,
    },
    {
      id: 2,
      name: 'objects',
      type: 'tilelayer',
      width: MAP_W,
      height: MAP_H,
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      data: objects,
    },
    {
      id: 3,
      name: 'overhead',
      type: 'tilelayer',
      width: MAP_W,
      height: MAP_H,
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      data: overhead,
    },
    {
      id: 4,
      name: 'spawns',
      type: 'objectgroup',
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      objects: objectPoints.map((pt, i) => ({
        id: i + 1,
        name: pt.name,
        type: '',
        x: pt.x * TILE_SIZE,
        y: pt.y * TILE_SIZE,
        width: TILE_SIZE,
        height: TILE_SIZE,
        visible: true,
      })),
    }
  ],
}

const outDir = join(__dirname, '..', 'public', 'assets', 'tilemaps')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'atg.json')
writeFileSync(outPath, JSON.stringify(tiledMap, null, 2))
console.log(`Created ${outPath}`)
console.log(`Map: ${MAP_W}x${MAP_H} tiles (${MAP_W * TILE_SIZE}x${MAP_H * TILE_SIZE} px)`)
console.log(`Spawn points: ${objectPoints.map(p => p.name).join(', ')}`)
