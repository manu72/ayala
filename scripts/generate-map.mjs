/**
 * Generates the Ayala Triangle Gardens tilemap (Tiled JSON) from OpenStreetMap.
 *
 * Ground plan: scripts/atg-osm.geojson (© OpenStreetMap contributors, ODbL).
 * North up, 2 m per 32 px tile. The park is the triangle inside the three
 * real roads (Paseo de Roxas N, Makati Ave E, Ayala Ave SW); roads collide.
 * Places OSM does not map (sunken plaza, Starbucks waterfall, cat shelter,
 * playground, NE steps, smoking areas) come from PLACES below, located from
 * the developer's knowledge of the park.
 *
 * Trees and plants reuse the stamps in scripts/atg-stamps.json (extracted
 * from the hand-made map) on the trees-pale / plants tilesets.
 *
 * Run: node scripts/generate-map.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { createHash } from 'crypto'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const T = JSON.parse(readFileSync(join(__dirname, 'tile-indices.json'), 'utf8'))
const OSM = JSON.parse(readFileSync(join(__dirname, 'atg-osm.geojson'), 'utf8'))
const { stamps: STAMPS } = JSON.parse(readFileSync(join(__dirname, 'atg-stamps.json'), 'utf8'))

// ─────────────────────────────────────────
// FRAME — local metres: origin at the park's west vertex, x east, y north
// ─────────────────────────────────────────

const TILE_SIZE = 32
const M = 2 // metres per tile
const FRAME = { west: -40, north: 200, east: 540, south: -258 }
const MAP_W = Math.round((FRAME.east - FRAME.west) / M)
const MAP_H = Math.round((FRAME.north - FRAME.south) / M)
const N = MAP_W * MAP_H

const toLocal = ([lon, lat]) => [(lon - 121.021405) * 107700, (lat - 14.556777) * 110600]
const cellOf = ([x, y]) => [Math.floor((x - FRAME.west) / M), Math.floor((FRAME.north - y) / M)]
const centre = (cx, cy) => [FRAME.west + (cx + 0.5) * M, FRAME.north - (cy + 0.5) * M]
const idx = (cx, cy) => cy * MAP_W + cx
const inMap = (cx, cy) => cx >= 0 && cy >= 0 && cx < MAP_W && cy < MAP_H

// Seeded RNG (mulberry32) so the map is reproducible
let seed = 0x5eed1
function rand() {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Smooth value noise in [0,1) at the given cell scale (for lawns and tree clusters)
function noise(cx, cy, scale, salt = 0) {
  const h = (x, y) => { let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(salt, 2246822519); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296 }
  const fx = cx / scale, fy = cy / scale, x0 = Math.floor(fx), y0 = Math.floor(fy)
  const sx = (fx - x0) ** 2 * (3 - 2 * (fx - x0)), sy = (fy - y0) ** 2 * (3 - 2 * (fy - y0))
  const top = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * sx, bot = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * sx
  return top + (bot - top) * sy
}

// ─────────────────────────────────────────
// GEOMETRY
// ─────────────────────────────────────────

function distSeg([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
function distLine(p, line) {
  let d = Infinity
  for (let i = 1; i < line.length; i++) d = Math.min(d, distSeg(p, line[i - 1], line[i]))
  return d
}
function inPoly([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
// Visit every cell whose centre is within the metric bbox of pts (+pad)
function eachCellNear(pts, pad, fn) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  const [cx0, cy0] = cellOf([x0 - pad, y1 + pad]), [cx1, cy1] = cellOf([x1 + pad, y0 - pad])
  for (let cy = Math.max(0, cy0); cy <= Math.min(MAP_H - 1, cy1); cy++)
    for (let cx = Math.max(0, cx0); cx <= Math.min(MAP_W - 1, cx1); cx++) fn(cx, cy, centre(cx, cy))
}
const neighbours4 = (i) => {
  const cx = i % MAP_W, cy = (i - cx) / MAP_W
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => inMap(cx + dx, cy + dy)).map(([dx, dy]) => idx(cx + dx, cy + dy))
}
const paintLine = (line, half, fn) => eachCellNear(line, half, (cx, cy, p) => { if (distLine(p, line) <= half) fn(idx(cx, cy), p) })
const paintPoly = (ring, fn) => eachCellNear(ring, 0, (cx, cy, p) => { if (inPoly(p, ring)) fn(idx(cx, cy), p) })
const paintDisc = (c, r, fn) => eachCellNear([c], r, (cx, cy, p) => { if (Math.hypot(p[0] - c[0], p[1] - c[1]) <= r) fn(idx(cx, cy), p) })

// ─────────────────────────────────────────
// OSM FEATURES (local metres)
// ─────────────────────────────────────────

const features = OSM.features.map((f) => {
  const g = f.geometry
  const rings = g.type === 'Polygon' ? [g.coordinates[0].map(toLocal)]
    : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0].map(toLocal)) : null
  return {
    id: f.properties['@id'], tags: f.properties, type: g.type, rings,
    line: g.type === 'LineString' ? g.coordinates.map(toLocal) : null,
    point: g.type === 'Point' ? toLocal(g.coordinates) : null,
  }
})
const byId = new Map(features.map((f) => [f.id, f]))
const way = (n) => {
  const f = byId.get(`way/${n}`)
  if (!f) throw new Error(`OSM way/${n} missing from atg-osm.geojson`)
  return f
}
const underground = (t) => t.tunnel || t.indoor || Number(t.layer) < 0 || t.location === 'underground'

// Triangle-side carriageways, in driving order, stitched into the park outline.
const CARRIAGEWAYS = {
  paseo_eastbound: [92357001, 184842504, 704909391, 92356999, 705361738, 705361737, 92357005, 705363306, 705361732, 705363304],
  makati_southbound: [705363303, 705369246, 749318776, 1296741771, 25945011, 700695451],
  ayala_westbound: [700684167, 374114345, 704887554, 700877939, 700877940],
}
const stitch = (ids) => ids.flatMap((n, i) => (i ? way(n).line.slice(1) : way(n).line))
const PARK_RING = [
  ...stitch(CARRIAGEWAYS.paseo_eastbound),
  ...stitch(CARRIAGEWAYS.makati_southbound).slice(1),
  ...stitch(CARRIAGEWAYS.ayala_westbound).slice(1),
]

// Far-side carriageways (for traffic lanes)
const FAR_CARRIAGEWAYS = {
  paseo_westbound: [705363305, 32946692, 705363307, 705361740, 92357007, 92356998, 700877938, 92357002],
  makati_northbound: [374114349, 700695449, 1076360324, 1296741772, 705369250, 705369249, 705369247],
  ayala_eastbound: [701644612, 705106530, 701644611, 700696797, 704887555, 4418471],
}

// ─────────────────────────────────────────
// PLACES — local knowledge where OSM is silent (metres, local frame)
// ─────────────────────────────────────────

const PLACES = {
  // The Shops at Ayala Triangle Gardens: stair from the park down to the
  // sunken plaza (lower ground) with the northern Starbucks and its waterfall.
  sunkenPlaza: [[356, 2], [372, -6], [400, 4], [398, 22], [362, 22]],
  mallStairs: { from: [352, -2], to: [372, 14], half: 3 },
  starbucks: [[372, 22], [388, 22], [388, 27], [372, 27]],
  starbucksWaterfall: [[362, 20], [369, 20], [369, 25], [362, 25]],
  mallFacade: [[[360, 22], [400, 22]], [[400, 22], [400, 4]]],
  // Broad steps up to the towers, just inside the Makati Ave / Santo Tomas entrance
  neSteps: { from: [402, -8], to: [410, 16], half: 4 },
  // Triangular cat shelter at the park side of Tower Two, by the Mandarin gap
  catShelter: [[396, 50], [410, 50], [403, 61]],
  // Playground on the north lawn by Openbook (origami carabao + hornbill)
  playground: [[262, 64], [282, 70], [288, 52], [268, 46]],
  // McMicking Memorial water curtain and pool
  mcmickingPool: [[180, -18], [189, -18], [189, -12], [180, -12]],
  mcmickingPortal: [184, -10],
  // Openbook (OSM 'Open Book' public bookcase) — covered shelter
  openbookRoof: [244, 63],
  // Sedeño underpass: escalator beside the OSM stair (way/92001682)
  sedenoEscalator: { from: [178, 51], to: [165, 47.5], half: 1 },
  monuments: { ninoy_aquino: [15, -1], gabriela_silang: [311, -195], sultan_kudarat: [486, 140] },
  // Smoking areas (local knowledge; tweak freely)
  smoking: { smoking_restaurant_row: [352, -86], smoking_tower_one: [92, -50], smoking_tower_two: [398, 112] },
}

// ─────────────────────────────────────────
// CLASSIFY CELLS
// ─────────────────────────────────────────

const K = {
  OUTSIDE: 0, LAWN: 1, ROAD: 2, MEDIAN: 3, SIDEWALK: 4, PATH: 5, PLAZA: 6, BUILDING: 7, TOWER: 8,
  WATER: 9, STEPS: 10, ESCALATOR: 11, PLAYGROUND: 12, STARBUCKS: 13, GLASS: 14,
}
const kind = new Uint8Array(N)
const inPark = new Uint8Array(N)

for (let cy = 0; cy < MAP_H; cy++)
  for (let cx = 0; cx < MAP_W; cx++)
    if (inPoly(centre(cx, cy), PARK_RING)) { inPark[idx(cx, cy)] = 1; kind[idx(cx, cy)] = K.LAWN }

const isTower = (t) => Number(t.height) >= 40 || Number(t['building:levels']) >= 12
const buildingRings = features.filter((f) => f.rings && f.tags.building && f.tags.building !== 'roof' && !underground(f.tags))

// Outside the park: buildings, then roads over everything
for (const b of buildingRings)
  for (const ring of b.rings) paintPoly(ring, (i) => { if (!inPark[i]) kind[i] = isTower(b.tags) ? K.TOWER : K.BUILDING })

const ROAD_CLASSES = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
  'primary_link', 'secondary_link', 'tertiary_link'])
const roads = features.filter((f) => f.line && ROAD_CLASSES.has(f.tags.highway) && !underground(f.tags) && !f.tags.bridge)
const LANE_M = 3.3
for (const r of roads) {
  const lanes = Number(r.tags.lanes) || 2
  const half = (lanes * LANE_M) / 2 + 0.5
  // ponytail: no lane markings yet — ROAD_LINE's vertical dashes read as noise on diagonal roads (Phase 3 repaint)
  paintLine(r.line, half, (i) => { kind[i] = K.ROAD })
}

// Medians: non-road cells squeezed between the two carriageways of a main road
const mainPairs = [['paseo_eastbound', 'paseo_westbound'], ['makati_southbound', 'makati_northbound'], ['ayala_westbound', 'ayala_eastbound']]
const carriagewayLine = (name) => stitch(CARRIAGEWAYS[name] ?? FAR_CARRIAGEWAYS[name])
for (const [a, b] of mainPairs) {
  const la = carriagewayLine(a), lb = carriagewayLine(b)
  eachCellNear([...la, ...lb], 0, (cx, cy, p) => {
    const i = idx(cx, cy)
    if (kind[i] === K.ROAD || inPark[i]) return
    if (distLine(p, la) < 16 && distLine(p, lb) < 16) kind[i] = K.MEDIAN
  })
}

// Park interior
const inside = (f) => f.line ? f.line.some((p) => inPoly(p, PARK_RING)) : f.rings ? f.rings[0].some((p) => inPoly(p, PARK_RING)) : inPoly(f.point, PARK_RING)
const parkPaint = (i, k) => { if (inPark[i] && kind[i] !== K.ROAD) kind[i] = k }

// perimeter pavement: within 4 m of a road
const roadDist = distanceField((i) => kind[i] === K.ROAD)
for (let i = 0; i < N; i++) if (inPark[i] && kind[i] !== K.ROAD && roadDist[i] <= 2) kind[i] = K.SIDEWALK

for (const f of features) {
  const t = f.tags
  if (!inside(f) || underground(t)) continue
  if (f.rings && t.landuse === 'retail') f.rings.forEach((r) => paintPoly(r, (i) => parkPaint(i, K.PLAZA)))
  if (f.rings && t.amenity === 'parking') f.rings.forEach((r) => paintPoly(r, (i) => parkPaint(i, K.SIDEWALK)))
  if (f.rings && t.building === 'roof') f.rings.forEach((r) => paintPoly(r, (i) => parkPaint(i, K.PLAZA)))
  if (f.line && t.highway === 'service') paintLine(f.line, 2.5, (i) => parkPaint(i, K.SIDEWALK))
}
for (const f of features) {
  const t = f.tags
  if (!f.line || !inside(f) || underground(t)) continue
  if (['footway', 'path', 'pedestrian', 'cycleway'].includes(t.highway) && t.footway !== 'crossing') {
    const main = t.lit === 'yes' || t.surface === 'paved' || t.footway === 'sidewalk'
    const half = Math.max(1.5, (Number(t.width) || (main ? 4.5 : 3)) / 2)
    paintLine(f.line, half, (i) => parkPaint(i, t.footway === 'sidewalk' ? K.SIDEWALK : K.PATH))
  }
}
// forecourt plazas around the park's buildings, then the buildings themselves
for (const b of buildingRings.filter(inside))
  for (const ring of b.rings) paintLine([...ring], isTower(b.tags) ? 5 : 3, (i) => { if (inPark[i] && kind[i] === K.LAWN) kind[i] = K.PLAZA })
for (const b of buildingRings.filter(inside))
  for (const ring of b.rings) paintPoly(ring, (i) => parkPaint(i, isTower(b.tags) ? K.TOWER : K.BUILDING))

// hand-placed ground
paintPoly(PLACES.sunkenPlaza, (i) => parkPaint(i, K.PLAZA))
paintLine([PLACES.mallStairs.from, PLACES.mallStairs.to], PLACES.mallStairs.half, (i) => parkPaint(i, K.STEPS))
paintLine([PLACES.neSteps.from, PLACES.neSteps.to], PLACES.neSteps.half, (i) => parkPaint(i, K.STEPS))
paintPoly(PLACES.playground, (i) => parkPaint(i, K.PLAYGROUND))
paintPoly(PLACES.catShelter, (i) => parkPaint(i, K.PLAZA))
for (const seg of PLACES.mallFacade) paintLine(seg, 1, (i) => parkPaint(i, K.GLASS))
paintPoly(PLACES.starbucks, (i) => parkPaint(i, K.STARBUCKS))

// OSM steps (surface ends of underpasses) and the Sedeño escalator
for (const f of features)
  if (f.line && f.tags.highway === 'steps' && !underground(f.tags)) paintLine(f.line, 1.6, (i) => { if (kind[i] !== K.ROAD) kind[i] = inPark[i] ? K.STEPS : kind[i] })
const esc = PLACES.sedenoEscalator
paintLine([esc.from, esc.to], esc.half, (i) => parkPaint(i, K.ESCALATOR))

// water last so pools stay pools
const water = new Uint8Array(N)
for (const f of features)
  if (f.rings && inside(f) && (f.tags.amenity === 'fountain' || f.tags.natural === 'water')) f.rings.forEach((r) => paintPoly(r, (i) => { water[i] = 1 }))
paintPoly(PLACES.mcmickingPool, (i) => { water[i] = 1 })
paintPoly(PLACES.starbucksWaterfall, (i) => { water[i] = 1 })
for (let i = 0; i < N; i++) if (water[i] && inPark[i]) kind[i] = K.WATER

// ─────────────────────────────────────────
// TILES
// ─────────────────────────────────────────

const t = (id) => id + 1
const ground = new Array(N).fill(0)
const objects = new Array(N).fill(0)
const overhead = new Array(N).fill(0)


for (let i = 0; i < N; i++) {
  switch (kind[i]) {
    case K.ROAD: ground[i] = t(T.ROAD); break
    case K.MEDIAN: ground[i] = t(T.GRASS_MED); break
    case K.OUTSIDE: ground[i] = t(roadDist[i] <= 3 ? T.SIDEWALK : T.PLAZA); break
    case K.SIDEWALK: ground[i] = t(T.SIDEWALK); break
    case K.PATH: ground[i] = t(T.STONE_PATH); break
    case K.PLAZA: ground[i] = t(T.PLAZA); break
    case K.BUILDING: ground[i] = t(T.BUILDING); break
    case K.TOWER: ground[i] = t(neighbours4(i).some((n) => kind[n] !== K.TOWER) ? T.GLASS_FACADE : T.TOWER); break
    case K.GLASS: ground[i] = t(T.GLASS_FACADE); break
    case K.WATER: ground[i] = t(neighbours4(i).some((n) => kind[n] !== K.WATER) ? T.WATER_EDGE : T.WATER); break
    case K.STEPS: ground[i] = t(T.STEPS); break
    case K.ESCALATOR: ground[i] = t(T.ESCALATOR); break
    case K.PLAYGROUND: ground[i] = t(T.PLAYGROUND); break
    case K.STARBUCKS: ground[i] = t(T.STARBUCKS); break
    default: ground[i] = t(T.GRASS_LIGHT)
  }
}

// ─────────────────────────────────────────
// TREES — Poisson-ish scatter of the extracted stamps over the lawns
// ─────────────────────────────────────────

const lawn = (i) => kind[i] === K.LAWN || kind[i] === K.MEDIAN
const largeTrees = STAMPS.filter((s) => s.cls === 'large tree')
const smallTrees = STAMPS.filter((s) => s.cls === 'small tree' && s.id.startsWith('s'))
const palms = STAMPS.filter((s) => s.cls === 'palm')
const canopy = new Uint8Array(N)
// landmarks stay visible: no tree canopy over them
const noCanopy = new Uint8Array(N)
for (const p of Object.values(PLACES.monuments)) paintDisc(p, 8, (i) => { noCanopy[i] = 1 })
for (const ring of [PLACES.playground, PLACES.sunkenPlaza, PLACES.mcmickingPool, PLACES.catShelter]) eachCellNear(ring, 3, (cx, cy) => { noCanopy[idx(cx, cy)] = 1 })
paintDisc(PLACES.openbookRoof, 6, (i) => { noCanopy[i] = 1 })
for (let i = 0; i < N; i++) if (kind[i] === K.STEPS || kind[i] === K.ESCALATOR || kind[i] === K.WATER) noCanopy[i] = 1

function placeStamp(stamp, bx, by, { force = false } = {}) {
  const ox = bx - stamp.base[0], oy = by - stamp.base[1]
  if (!force) {
    for (let r = 0; r < stamp.h; r++)
      for (let c = 0; c < stamp.w; c++) {
        if (!stamp.overhead[r][c]) continue
        if (!inMap(ox + c, oy + r) || canopy[idx(ox + c, oy + r)] || noCanopy[idx(ox + c, oy + r)]) return false
      }
  }
  for (let r = 0; r < stamp.h; r++)
    for (let c = 0; c < stamp.w; c++) {
      const x = ox + c, y = oy + r
      if (!inMap(x, y)) continue
      const i = idx(x, y)
      if (stamp.overhead[r][c]) { overhead[i] = stamp.overhead[r][c]; canopy[i] = 1 }
      if (stamp.objects[r][c] && !objects[i]) objects[i] = stamp.objects[r][c]
    }
  return true
}
const pick = (list) => list[Math.floor(rand() * list.length)]

// fixed OSM trees first (park + medians)
for (const f of features) {
  if (f.tags.natural !== 'tree' || !f.point) continue
  const [cx, cy] = cellOf(f.point)
  if (!inMap(cx, cy) || !lawn(idx(cx, cy))) continue
  placeStamp(inPark[idx(cx, cy)] ? pick(largeTrees) : pick([...smallTrees, ...palms]), cx, cy)
}
// scatter: big trees line the walks and gather in groves; open sunny lawns are left between
const pathDist = distanceField((i) => kind[i] === K.PATH || kind[i] === K.SIDEWALK)
const treeBase = (i) => kind[i] === K.LAWN && inPark[i]
for (const [list, tries, wants] of [
  [largeTrees, 40000, (cx, cy, i) => pathDist[i] <= 6 || noise(cx, cy, 14, 1) > 0.36],
  [smallTrees, 6000, (cx, cy) => noise(cx, cy, 10, 2) > 0.72],
]) {
  for (let n = 0; n < tries; n++) {
    const cx = Math.floor(rand() * MAP_W), cy = Math.floor(rand() * MAP_H)
    const i = idx(cx, cy)
    if (!treeBase(i) || !wants(cx, cy, i)) continue
    if (neighbours4(i).some((j) => kind[j] !== K.LAWN)) continue
    placeStamp(pick(list), cx, cy)
  }
}
// median palms / small trees
for (let n = 0; n < 4000; n++) {
  const cx = Math.floor(rand() * MAP_W), cy = Math.floor(rand() * MAP_H)
  if (kind[idx(cx, cy)] === K.MEDIAN && rand() < 0.25) placeStamp(pick([...palms, ...smallTrees.filter((s) => s.w <= 2)]), cx, cy)
}

// lawn shading: darker grass under canopy, flowers and medium grass in the open
for (let i = 0; i < N; i++) {
  if (kind[i] !== K.LAWN) continue
  const cx = i % MAP_W, cy = (i - cx) / MAP_W
  const n = noise(cx, cy, 6, 3)
  if (canopy[i]) ground[i] = t(n < 0.7 ? T.GRASS_DARK : T.GRASS_MED)
  else if (rand() < 0.015) ground[i] = t(T.GRASS_FLOWER)
  else if (n > 0.62) ground[i] = t(T.GRASS_MED)
  if (neighbours4(i).some((j) => kind[j] === K.PATH) && rand() < 0.35) ground[i] = t(T.GRASS_TO_PATH)
}

// ─────────────────────────────────────────
// OBJECTS — furniture, plants, landmarks
// ─────────────────────────────────────────

const benches = [], lamps = [], dining = []
const free = (i) => !objects[i] && !overhead[i]
// benches and lamps along the walks, on the lawn edge
const walkCells = []
for (let i = 0; i < N; i++) if (kind[i] === K.PATH) walkCells.push(i)
for (const i of walkCells) {
  const edge = neighbours4(i).find((j) => kind[j] === K.LAWN && free(j))
  if (edge === undefined) continue
  const r = rand()
  if (r < 0.035) { objects[edge] = t(T.BENCH); benches.push(edge) }
  else if (r < 0.055) { objects[edge] = t(T.LAMPPOST); lamps.push(edge) }
}
// OSM benches
for (const f of features)
  if (f.point && f.tags.amenity === 'bench') {
    const [cx, cy] = cellOf(f.point)
    if (inMap(cx, cy) && inPark[idx(cx, cy)] && kind[idx(cx, cy)] !== K.WATER) { objects[idx(cx, cy)] = t(T.BENCH); benches.push(idx(cx, cy)) }
  }
// al fresco tables: restaurant row frontage and the Starbucks plaza
for (let i = 0; i < N; i++) {
  if (kind[i] !== K.PLAZA || !free(i)) continue
  const nearBuilding = neighbours4(i).some((j) => kind[j] === K.BUILDING || kind[j] === K.STARBUCKS)
  const cx = i % MAP_W, cy = (i - cx) / MAP_W
  const p = centre(cx, cy)
  const restaurantRow = features.some((f) => f.rings && f.tags.landuse === 'retail' && inPoly(p, f.rings[0]))
  if (nearBuilding && (restaurantRow || inPoly(p, PLACES.sunkenPlaza)) && rand() < 0.55) { objects[i] = t(T.DINING); dining.push(i) }
}
// shrubs and flower beds hugging building plazas and path corners
const plants = STAMPS.filter((s) => (s.cls === 'shrub' || s.cls === 'flower bed') && s.w === 1 && s.h === 1)
for (let i = 0; i < N; i++) {
  if (kind[i] !== K.LAWN || !free(i)) continue
  const nearHard = neighbours4(i).some((j) => kind[j] === K.PLAZA || kind[j] === K.BUILDING || kind[j] === K.TOWER)
  if ((nearHard && rand() < 0.3) || rand() < 0.012) objects[i] = pick(plants).objects[0][0]
}
// landmarks
const landmarkCells = {}
for (const [name, p] of Object.entries(PLACES.monuments)) {
  const [cx, cy] = cellOf(p)
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (inMap(cx + dx, cy + dy)) objects[idx(cx + dx, cy + dy)] = t(T.MONUMENT)
  landmarkCells[name] = [cx, cy]
}
{ const [cx, cy] = cellOf(PLACES.mcmickingPortal); objects[idx(cx, cy)] = t(T.ART) }
// covered shelters: Openbook and the cat shelter (overhead roofs give cover)
{ const [cx, cy] = cellOf(PLACES.openbookRoof); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) overhead[idx(cx + dx, cy + dy)] = t(T.ROOF) }
paintPoly(PLACES.catShelter, (i) => { overhead[i] = t(T.ROOF) })

// ─────────────────────────────────────────
// WALKABILITY + VALIDATION
// ─────────────────────────────────────────

const COLLIDES = new Set([T.ROAD, T.ROAD_LINE, T.ROAD_SOLID_LINE, T.ROAD_EDGE, T.BUILDING, T.TOWER, T.GLASS_FACADE,
  T.STARBUCKS, T.WATER, T.MONUMENT, T.HEDGE, T.ROOF, T.TREE_TRUNK])
const collidesGid = (g) => g > 0 && g <= 40 && COLLIDES.has(g - 1)
const blocked = (i) => collidesGid(ground[i]) || collidesGid(objects[i])
// 1-tile clearance, matching the in-game human nav grid
const clear = (cx, cy) => {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) if (!inMap(cx + dx, cy + dy) || blocked(idx(cx + dx, cy + dy))) return false
  return true
}

function distanceField(isSource) {
  const d = new Float32Array(N).fill(Infinity)
  const q = []
  for (let i = 0; i < N; i++) if (isSource(i)) { d[i] = 0; q.push(i) }
  for (let h = 0; h < q.length; h++) {
    const i = q[h]
    for (const j of neighbours4(i)) if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j) }
  }
  return d
}

function nearestCell([x, y], ok) {
  const [sx, sy] = cellOf([x, y])
  for (let r = 0; r < 40; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const cx = sx + dx, cy = sy + dy
        if (inMap(cx, cy) && ok(cx, cy)) return [cx, cy, r]
      }
  throw new Error(`no suitable cell near ${x},${y}`)
}

// ─────────────────────────────────────────
// SPAWNS & POIs (metres → nearest clear walkable cell)
// ─────────────────────────────────────────

const SPAWNS = {
  spawn_mammacat: [397, -42],
  spawn_blacky: [180, 46],
  spawn_tiger: [214, 22],
  spawn_jayco: [402, -4], // at the foot of the pyramid steps: chapter 4 is 'earn your place at the steps'
  spawn_jayco_jr: [366, 2],
  spawn_fluffy: [408, 20],
  spawn_pedigree: [362, -90],
  spawn_ginger: [190, -21],
  spawn_guard: [322, -64], // guards the restaurant scraps (detect 120 px + 80 px leash)
  poi_starbucks: [380, 18],
  poi_starbucks_water: [365, 17],
  poi_shops_supermarket: [394, 14],
  poi_pyramid_steps: [406, 4],
  poi_safe_sleep_central: [358, 10],
  poi_feeding_station_3: [414, 20],
  poi_covered_area: [403, 54],
  poi_feeding_station_2: [398, 46],
  poi_water_bowl_2: [408, 46],
  poi_library: [245, 62],
  poi_water_bowl_1: [250, 52],
  poi_feeding_station_1: [228, 46],
  poi_playground: [272, 64],
  poi_escalator: [175, 46],
  poi_fountain: [184, -21],
  poi_fountain_exchange: [167, -43],
  poi_dining: [262, -29],
  poi_restaurant_scraps: [321, -71],
  poi_restaurant_scraps_manam: [300, -44],
  poi_water_bowl_3: [337, -45],
  poi_blackbird: [333, -80],
  poi_safe_sleep_blackbird: [346, -75],
  poi_safe_sleep: [390, -22],
  poi_starbucks_exchange: [133, -33],
  poi_monument: PLACES.monuments.ninoy_aquino,
  poi_gabriela_silang: PLACES.monuments.gabriela_silang,
}
// landmarks that sit on their monument / island rather than walkable ground
const DECORATIVE = new Set(['poi_monument', 'poi_gabriela_silang'])

const objCell = {}
const snapped = []
{
  const [cx, cy] = nearestCell(SPAWNS.spawn_mammacat, (x, y) => inPark[idx(x, y)] && clear(x, y))
  objCell.spawn_mammacat = [cx, cy]
}
// cells humans can route between: 4-connected component of clearance cells around Mamma Cat's spawn
const navReach = new Uint8Array(N)
{
  const [sx, sy] = objCell.spawn_mammacat
  const q = [idx(sx, sy)]; navReach[q[0]] = 1
  for (let h = 0; h < q.length; h++)
    for (const j of neighbours4(q[h])) {
      const jx = j % MAP_W, jy = (j - jx) / MAP_W
      if (!navReach[j] && clear(jx, jy)) { navReach[j] = 1; q.push(j) }
    }
}
for (const [name, p] of Object.entries(SPAWNS)) {
  if (name === 'spawn_mammacat') continue
  if (DECORATIVE.has(name)) { objCell[name] = cellOf(p); continue }
  const [cx, cy, r] = nearestCell(p, (x, y) => navReach[idx(x, y)])
  objCell[name] = [cx, cy]
  if (r > 2) snapped.push(`${name} moved ${r * M} m to routable ground`)
}

// 'The ginger ones fight over the bench near the fountain' — keep a bench by the Gingers
{
  const [gx, gy] = objCell.spawn_ginger
  const near = (cx, cy) => Math.max(Math.abs(cx - gx), Math.abs(cy - gy))
  if (!benches.some((i) => near(i % MAP_W, Math.floor(i / MAP_W)) <= 3)) {
    const [bx, by] = nearestCell(centre(gx, gy), (x, y) => near(x, y) >= 1 && near(x, y) <= 3 && !blocked(idx(x, y)) && !objects[idx(x, y)] && clear(x, y))
    objects[idx(bx, by)] = t(T.BENCH)
    benches.push(idx(bx, by))
  }
}

// reachability from Mamma Cat's spawn; the park must be sealed by roads
const reach = new Uint8Array(N)
{
  const [sx, sy] = objCell.spawn_mammacat
  const q = [idx(sx, sy)]; reach[q[0]] = 1
  for (let h = 0; h < q.length; h++)
    for (const j of neighbours4(q[h])) if (!reach[j] && !blocked(j)) { reach[j] = 1; q.push(j) }
  const leaks = q.filter((i) => !inPark[i]).length
  if (leaks) throw new Error(`park is not sealed: ${leaks} reachable cells lie outside the roads`)
  for (const [name, [cx, cy]] of Object.entries(objCell))
    if (!DECORATIVE.has(name) && !reach[idx(cx, cy)]) throw new Error(`${name} is not reachable from spawn_mammacat`)
}

// ─────────────────────────────────────────
// PLACES LAYER — data the game reads (traffic, exits, crowd anchors, routes)
// ─────────────────────────────────────────

const px = ([cx, cy]) => [(cx + 0.5) * TILE_SIZE, (cy + 0.5) * TILE_SIZE]
const mToPx = ([x, y]) => [((x - FRAME.west) / M) * TILE_SIZE, ((FRAME.north - y) / M) * TILE_SIZE]
const clearCell = (p) => nearestCell(p, (x, y) => navReach[idx(x, y)])
// crowd anchors must be visible: not under tree canopy or roofs
const openCell = (p) => nearestCell(p, (x, y) => navReach[idx(x, y)] && !overhead[idx(x, y)])

const places = []
const point = (name, type, cell, props = {}) => places.push({ name, type, cell, props })
const polyline = (name, type, ptsPx, props = {}) => places.push({ name, type, ptsPx, props })

// traffic lanes: each carriageway in its real driving direction
for (const [name, ids] of Object.entries({ ...CARRIAGEWAYS, ...FAR_CARRIAGEWAYS })) {
  const line = stitch(ids)
  // narrowest stretch, so every lane stays on asphalt end to end (wider bits are turn lanes)
  const lanes = Math.min(...ids.map((n) => Number(way(n).tags.lanes) || 2))
  polyline(`traffic_${name}`, 'traffic', line.map(mToPx), { lanes, road: way(ids[0]).tags.name ?? name })
}
// exits: underpass mouths, the mall, towers and the at-grade crossing
const EXITS = {
  exit_sedeno_underpass: [176, 48], exit_w_apex_underpass: [44, -22], exit_villar_underpass: [419, 128],
  exit_s_apex_underpass: [294, -186], exit_legazpi_underpass: [253, -163], exit_mall: [392, 18],
  exit_tower_one: [130, -30], exit_tower_two: [425, 100], exit_makati_crossing: [394, -62],
}
for (const [name, p] of Object.entries(EXITS)) point(name, 'exit', clearCell(p))
// chapter-4 'shops' zone: the sunken plaza, Starbucks, mall door and the NE steps
{
  const pts = [...PLACES.sunkenPlaza, PLACES.neSteps.from, PLACES.neSteps.to].map(mToPx)
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const pad = 6 * TILE_SIZE
  places.push({ name: 'zone_shops', type: 'zone', rect: [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad] })
}
// crowd anchors
for (const i of benches) point(`bench_${i}`, 'bench', [i % MAP_W, Math.floor(i / MAP_W)])
for (const i of dining) point(`dining_${i}`, 'dining', [i % MAP_W, Math.floor(i / MAP_W)])
for (const [name, p] of Object.entries(PLACES.smoking)) point(name, 'smoking', openCell(p))
const SELFIE = {
  selfie_pse_fountain: [168, -36], selfie_tower_one_arch: [150, -28], selfie_carabao: [276, 56],
  selfie_gabriela_silang: [305, -186], selfie_tower_two_steps: [404, 0], selfie_mcmicking: [184, -24],
  selfie_openbook: [248, 56],
}
for (const [name, p] of Object.entries(SELFIE)) point(name, 'selfie', openCell(p))
const GUARD_POSTS = {
  guard_tower_one: [138, -38], guard_pse_plaza: [176, -58], guard_restaurant_row_w: [240, -22],
  guard_nielson: [326, -66], guard_shops: [396, 0], guard_tower_two: [420, 112], guard_playground: [262, 54],
  guard_sedeno: [190, 38], guard_w_tip: [54, -4], guard_gabriela: [300, -172], guard_makati_entrance: [396, -46],
}
for (const [name, p] of Object.entries(GUARD_POSTS)) point(name, 'guard_post', clearCell(p))
// picnic spots: open sunny lawn away from paths
{
  const open = []
  for (let i = 0; i < N; i++) {
    const cx = i % MAP_W, cy = (i - cx) / MAP_W
    if (kind[i] === K.LAWN && reach[i] && !canopy[i] && clear(cx, cy) && roadDist[i] > 8) open.push(i)
  }
  const chosen = []
  for (let n = 0; n < 4000 && chosen.length < 24; n++) {
    const i = open[Math.floor(rand() * open.length)]
    if (i === undefined) break
    const cx = i % MAP_W, cy = (i - cx) / MAP_W
    if (chosen.every((j) => Math.hypot((j % MAP_W) - cx, Math.floor(j / MAP_W) - cy) > 10)) chosen.push(i)
  }
  chosen.forEach((i, n) => point(`picnic_${n + 1}`, 'picnic', [i % MAP_W, Math.floor(i / MAP_W)]))
}
// walkways for crowd routing: OSM footways inside the park, plus the hand-placed
// stairs OSM lacks (the mall stair into the sunken plaza and the NE tower steps)
const HAND_WALKS = {
  walk_mall_stairs: [[352, -12], PLACES.mallStairs.from, PLACES.mallStairs.to, [386, 16], EXITS.exit_mall],
  walk_sunken_plaza: [[364, 6], [380, 10], [396, 8]],
  walk_ne_steps: [[398, -40], PLACES.neSteps.from, PLACES.neSteps.to],
}
for (const [name, pts] of Object.entries(HAND_WALKS)) polyline(name, 'walkway', pts.map(mToPx))
for (const f of features) {
  const tg = f.tags
  if (!f.line || !inside(f) || underground(tg) || !['footway', 'path', 'pedestrian', 'steps'].includes(tg.highway)) continue
  polyline(`walk_${f.id.split('/')[1]}`, 'walkway', f.line.map(mToPx))
}
// named routes for the existing ambient humans / snatchers (macro waypoints, A*-routed in game)
const ROUTES = {
  route_jogger_1: [[214, -5], [164, -18], [124, -70], [202, -122], [254, -158], [331, -58], [360, -15], [301, 31], [232, 62], [180, 44], [214, -5]],
  route_jogger_2: [[214, -5], [302, 26], [323, 10], [251, 1], [214, -5]],
  route_jogger_male: [[44, 2], [177, 44], [232, 62], [412, 116], [474, 128], [398, -40], [254, -158], [202, -126], [44, -14], [44, 2]],
  route_dogwalker_1: [[180, 44], [193, 25], [164, -18], [150, -36], [110, -20], [60, -2], [110, 14], [180, 44]],
  route_dogwalker_2: [[323, 10], [360, -15], [331, -58], [276, -33], [251, 1], [323, 10]],
  // night patrols over the lawns, kept well away from the named cats' homes
  route_snatcher_1: [[55, 6], [90, 14], [120, 24], [95, 2], [55, 6]],
  route_snatcher_2: [[255, 28], [290, 40], [318, 22], [285, 6], [255, 28]],
  route_snatcher_3: [[268, -112], [300, -128], [330, -114], [300, -100], [268, -112]],
  route_snatcher_4: [[440, 34], [462, 52], [470, 76], [450, 60], [440, 34]],
}
for (const [name, pts] of Object.entries(ROUTES)) polyline(name, 'route', pts.map((p) => px(clearCell(p))))
// background colony cats: spawn discs on the lawns
const COLONY = { colony_central: [[240, 10], 40], colony_west: [[110, 10], 28], colony_south: [[290, -110], 28], colony_north: [[300, 55], 22], colony_northeast: [[440, 40], 22] }
for (const [name, [p, r]] of Object.entries(COLONY)) point(name, 'colony_zone', clearCell(p), { radius: (r / M) * TILE_SIZE })

// ─────────────────────────────────────────
// TILED JSON OUTPUT
// ─────────────────────────────────────────

const tileProperties = [...COLLIDES].sort((a, b) => a - b).map((id) => ({
  id, properties: [{ name: 'collides', type: 'bool', value: true }],
}))

let nextId = 1
const spawnObjects = Object.entries(objCell).map(([name, cell]) => {
  const [x, y] = px(cell)
  return { id: nextId++, name, type: '', point: true, x, y, width: 0, height: 0, rotation: 0, visible: true }
})
const placeObjects = places.map((pl) => {
  const props = Object.entries(pl.props ?? {}).map(([name, value]) => ({ name, type: typeof value === 'number' ? 'float' : 'string', value }))
  const base = { id: nextId++, name: pl.name, type: pl.type, rotation: 0, visible: true, ...(props.length ? { properties: props } : {}) }
  if (pl.rect) { const [x, y, w, h] = pl.rect; return { ...base, x, y, width: w, height: h } }
  if (pl.ptsPx) {
    const [x0, y0] = pl.ptsPx[0]
    return { ...base, x: x0, y: y0, width: 0, height: 0, polyline: pl.ptsPx.map(([x, y]) => ({ x: +(x - x0).toFixed(1), y: +(y - y0).toFixed(1) })) }
  }
  const [x, y] = px(pl.cell)
  return { ...base, point: true, x, y, width: 0, height: 0 }
})

const tilemap = {
  compressionlevel: -1, height: MAP_H, width: MAP_W, infinite: false,
  orientation: 'orthogonal', renderorder: 'right-down', tilewidth: TILE_SIZE, tileheight: TILE_SIZE,
  tiledversion: '1.10.2', type: 'map', version: '1.10', nextlayerid: 6, nextobjectid: nextId,
  properties: [
    { name: 'source', type: 'string', value: 'OpenStreetMap extract scripts/atg-osm.geojson — © OpenStreetMap contributors (ODbL)' },
    { name: 'metresPerTile', type: 'float', value: M },
    { name: 'mapRevision', type: 'string', value: '__mapRevision__' },
  ],
  tilesets: [
    { columns: 8, firstgid: 1, image: '../tilesets/park-tiles.png', imageheight: 160, imagewidth: 256, margin: 0, name: 'park-tiles', spacing: 0, tilecount: 40, tilewidth: TILE_SIZE, tileheight: TILE_SIZE, tiles: tileProperties },
    { columns: 32, firstgid: 41, image: '../tilesets/trees-pale.png', imageheight: 1024, imagewidth: 1024, margin: 0, name: 'trees-pale', spacing: 0, tilecount: 1024, tilewidth: TILE_SIZE, tileheight: TILE_SIZE },
    { columns: 16, firstgid: 1065, image: '../tilesets/plants.png', imageheight: 1024, imagewidth: 512, margin: 0, name: 'plants', spacing: 0, tilecount: 512, tilewidth: TILE_SIZE, tileheight: TILE_SIZE },
  ],
  layers: [
    { id: 1, name: 'ground', type: 'tilelayer', width: MAP_W, height: MAP_H, x: 0, y: 0, opacity: 1, visible: true, data: '__ground__' },
    { id: 2, name: 'objects', type: 'tilelayer', width: MAP_W, height: MAP_H, x: 0, y: 0, opacity: 1, visible: true, data: '__objects__' },
    { id: 3, name: 'overhead', type: 'tilelayer', width: MAP_W, height: MAP_H, x: 0, y: 0, opacity: 1, visible: true, data: '__overhead__' },
    { id: 4, name: 'spawns', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: spawnObjects },
    { id: 5, name: 'places', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: placeObjects },
  ],
}

// Saves keep positions only on the same map revision, so derive it from the content:
// any regeneration that moves ground or spawns invalidates saved coordinates.
const mapRevision = 'osm-2m-' + createHash('sha1').update(JSON.stringify([MAP_W, MAP_H, ground, objects, spawnObjects])).digest('hex').slice(0, 10)

// one map row per line keeps the file small and diffs readable
const rows = (data) => '[\n' + Array.from({ length: MAP_H }, (_, y) => data.slice(y * MAP_W, (y + 1) * MAP_W).join(',')).join(',\n') + '\n]'
const json = JSON.stringify(tilemap, null, 1)
  .replace('"__ground__"', rows(ground))
  .replace('"__objects__"', rows(objects))
  .replace('"__overhead__"', rows(overhead))
  .replace('"__mapRevision__"', JSON.stringify(mapRevision))

// CI's verify:dist greps dist/ for secret-looking strings; generated names must never trip it
if (/sk-[A-Za-z0-9_-]{10,}/.test(json)) throw new Error('generated atg.json matches the dist secret-leak pattern')

const outDir = join(__dirname, '..', 'public', 'assets', 'tilemaps')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'atg.json'), json + '\n')

const reachable = reach.reduce((a, b) => a + b, 0)
const shaded = reach.reduce((a, r, i) => a + (r && overhead[i] ? 1 : 0), 0)
console.log(`Created public/assets/tilemaps/atg.json — ${MAP_W}x${MAP_H} tiles (${MAP_W * TILE_SIZE}x${MAP_H * TILE_SIZE} px), ${M} m/tile`)
console.log(`Reachable cells: ${reachable}; under canopy/roof: ${Math.round((100 * shaded) / reachable)}%`)
console.log(`Objects: ${spawnObjects.length} spawns/POIs, ${placeObjects.length} places (${benches.length} benches, ${dining.length} tables)`)
for (const s of snapped) console.log(`  note: ${s}`)
