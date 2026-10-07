/**
 * Generates park-tiles.png, the base tileset for Ayala Triangle Gardens.
 *
 * Ground tiles use the shared painters in terrain-art.mjs (the same textures
 * the map generator bakes into atg-ground.png), so any place the gameplay
 * ground layer is ever drawn matches the art layer. Object tiles (benches,
 * lamps, café tables) sit on transparency with a soft shadow down-right:
 * one light direction, from the north-west, everywhere.
 *
 * Landmarks that the map now paints itself (monuments, the McMicking
 * portal) and the shelter ROOF tile are left transparent here: the objects /
 * overhead layers keep them for collision and cover, while the ground and
 * roof art layers draw them.
 *
 * 32x32 tiles in an 8-column grid; indices are fixed (scripts/tile-indices.json).
 *
 * Run: node scripts/generate-tileset.mjs
 */

import { PNG } from 'pngjs'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { A, texel, hash } from './terrain-art.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'assets', 'tilesets')
mkdirSync(outDir, { recursive: true })

const TILE = 32
const COLS = 8
const ROWS = 5

// Tile indices (fixed: the map and saves refer to them)
const TILES = {
  GRASS_LIGHT: 0, GRASS_DARK: 1, STONE_PATH: 2, ROAD: 3, WATER: 4, BUILDING: 5, PLAZA: 6, HEDGE: 7,
  TREE_TRUNK: 8, TREE_CANOPY: 9, SAND: 10, PLAYGROUND: 11, FLOWER_BED: 12, BENCH: 13, STEPS: 14, STARBUCKS: 15,
  ROAD_LINE: 16, ESCALATOR: 17, FOUNTAIN_EDGE: 18, BOULDER: 19, MONUMENT: 20, DINING: 21, SIDEWALK: 22, DIRT: 23,
  GRASS_MED: 24, CANOPY_DENSE: 25, TOWER: 26, HELIPAD: 27, SHRUB: 28, ART: 29, LAMPPOST: 30, EMPTY: 31,
  // Row 4 — transition/variant tiles
  GRASS_FLOWER: 32, GRASS_TO_PATH: 33, PATH_TO_PLAZA: 34, ROAD_EDGE: 35, ROAD_SOLID_LINE: 36, GLASS_FACADE: 37, ROOF: 38, WATER_EDGE: 39,
}

const png = new PNG({ width: TILE * COLS, height: TILE * ROWS })
png.data.fill(0)

const origin = (idx) => [(idx % COLS) * TILE, Math.floor(idx / COLS) * TILE]
function put(idx, u, v, c, a = 255) {
  if (u < 0 || v < 0 || u >= TILE || v >= TILE) return
  const [ox, oy] = origin(idx)
  const o = ((oy + v) * png.width + ox + u) * 4
  const t = a / 255, ta = png.data[o + 3] / 255
  const out = t + ta * (1 - t)
  for (let k = 0; k < 3; k++) png.data[o + k] = Math.round(out ? (c[k] * t + png.data[o + k] * ta * (1 - t)) / out : 0)
  png.data[o + 3] = Math.round(out * 255)
}
const rect = (idx, x, y, w, h, c, a) => { for (let v = y; v < y + h; v++) for (let u = x; u < x + w; u++) put(idx, u, v, c, a) }
const ellipse = (idx, cx, cy, rx, ry, c, a) => {
  for (let v = Math.floor(cy - ry); v <= cy + ry; v++)
    for (let u = Math.floor(cx - rx); u <= cx + rx; u++) if (((u + 0.5 - cx) / rx) ** 2 + ((v + 0.5 - cy) / ry) ** 2 <= 1) put(idx, u, v, c, a)
}
const ground = (idx, t, ctx = {}) => { for (let v = 0; v < TILE; v++) for (let u = 0; u < TILE; u++) put(idx, u, v, texel(t, u, v, ctx)) }
const SHADOW = [14, 22, 40]

// ── ground (mirrors the art layer) ──
ground(TILES.GRASS_LIGHT, A.GRASS)
ground(TILES.GRASS_DARK, A.GRASS_MED)
ground(TILES.GRASS_MED, A.GRASS_MED)
ground(TILES.GRASS_FLOWER, A.GRASS, { variant: 5 })
ground(TILES.GRASS_TO_PATH, A.GRASS, { variant: 4 })
ground(TILES.STONE_PATH, A.PATH)
ground(TILES.PATH_TO_PLAZA, A.PATH)
ground(TILES.PLAZA, A.PLAZA)
ground(TILES.SIDEWALK, A.SIDEWALK)
for (const r of [TILES.ROAD, TILES.ROAD_LINE, TILES.ROAD_SOLID_LINE, TILES.ROAD_EDGE]) ground(r, A.ROAD)
ground(TILES.WATER, A.WATER)
ground(TILES.WATER_EDGE, A.WATER)
ground(TILES.FOUNTAIN_EDGE, A.WATER)
ground(TILES.BUILDING, A.BUILDING)
ground(TILES.TOWER, A.TOWER)
ground(TILES.GLASS_FACADE, A.GLASS)
ground(TILES.STARBUCKS, A.STARBUCKS)
ground(TILES.STEPS, A.STEPS)
ground(TILES.ESCALATOR, A.ESCALATOR)
ground(TILES.PLAYGROUND, A.PLAYGROUND)
ground(TILES.SAND, A.PATH)
ground(TILES.DIRT, A.PATH)
ground(TILES.HELIPAD, A.TOWER)

// ── objects: transparent, shadow down-right ──

// Park bench, facing south: backrest, slatted seat, cast-iron ends
{
  const b = TILES.BENCH
  rect(b, 6, 15, 24, 11, SHADOW, 70) // shadow
  rect(b, 3, 9, 26, 3, [92, 60, 34]) // backrest rail
  rect(b, 3, 9, 26, 1, [140, 96, 56])
  for (const y of [13, 16, 19]) { rect(b, 3, y, 26, 2, [158, 106, 60]); rect(b, 3, y, 26, 1, [190, 136, 82]) }
  for (const x of [2, 28]) { rect(b, x, 8, 2, 14, [52, 54, 58]); rect(b, x, 8, 1, 14, [92, 96, 102]) }
}

// Lamppost: post, lantern head, a long thin shadow
{
  const l = TILES.LAMPPOST
  for (let k = 0; k < 9; k++) put(l, 17 + k, 26 + Math.floor(k / 3), SHADOW, 60)
  ellipse(l, 16, 27, 3, 1.5, SHADOW, 50)
  rect(l, 15, 8, 2, 19, [46, 48, 54])
  rect(l, 15, 8, 1, 19, [96, 100, 108])
  ellipse(l, 16, 7, 4, 3, [36, 38, 44])
  ellipse(l, 15.5, 6.5, 2.5, 2, [252, 236, 168])
  put(l, 14, 5, [255, 252, 230])
}

// Café table under a white parasol, two chairs peeking out
{
  const d = TILES.DINING
  ellipse(d, 19, 19, 12, 11, SHADOW, 70)
  rect(d, 2, 13, 4, 5, [120, 84, 52]); rect(d, 26, 14, 4, 5, [120, 84, 52])
  for (let v = 0; v < TILE; v++)
    for (let u = 0; u < TILE; u++) {
      const dx = u + 0.5 - 16, dy = v + 0.5 - 15
      const r = Math.hypot(dx, dy)
      if (r > 12) continue
      const seg = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 8)
      const lit = -(dx + dy) / 24
      let c = seg % 2 ? [236, 232, 222] : [214, 208, 196]
      c = c.map((x) => x + lit * 30)
      if (r > 11) c = [168, 160, 148]
      put(d, u, v, c)
    }
  ellipse(d, 16, 15, 1.5, 1.5, [90, 86, 80])
}

// Monument, ART (McMicking portal) and ROOF: drawn by the map's art layers; keep transparent
// (they stay on the objects/overhead layers for collision and cover).

// Hedge, shrub, boulder, flower bed, tree pieces: legacy object tiles, kept for completeness
{
  const h = TILES.HEDGE
  rect(h, 2, 4, 30, 28, SHADOW, 60)
  for (let v = 2; v < 30; v++) for (let u = 0; u < 30; u++) put(h, u, v, [44 + hash(u, v, 1) * 26, 96 + hash(u, v, 2) * 30, 44 + hash(u, v, 3) * 20])
  rect(h, 0, 2, 30, 2, [88, 140, 72])
}
{
  const s = TILES.SHRUB
  ellipse(s, 18, 20, 9, 8, SHADOW, 60)
  ellipse(s, 16, 17, 9, 8, [52, 108, 48])
  ellipse(s, 14, 14, 5, 4, [78, 136, 64])
}
{
  const b = TILES.BOULDER
  ellipse(b, 18, 20, 10, 8, SHADOW, 70)
  ellipse(b, 16, 17, 10, 8, [138, 132, 124])
  ellipse(b, 13, 14, 5, 4, [170, 164, 154])
}
{
  const f = TILES.FLOWER_BED
  for (let k = 0; k < 40; k++) {
    const u = Math.floor(hash(k, 1, 31) * 28) + 2, v = Math.floor(hash(k, 2, 31) * 28) + 2
    const c = [[255, 90, 110], [255, 200, 50], [220, 100, 255], [255, 150, 80], [255, 255, 120]][k % 5]
    put(f, u, v, c); put(f, u + 1, v, c.map((x) => x - 40)); put(f, u, v + 1, [60, 120, 50])
  }
}
{
  const t = TILES.TREE_TRUNK
  ellipse(t, 18, 19, 7, 5, SHADOW, 70)
  ellipse(t, 16, 16, 5, 5, [92, 60, 30]); ellipse(t, 15, 15, 2, 2, [128, 90, 52])
}
for (const [idx, base, a] of [[TILES.TREE_CANOPY, [46, 110, 46], 200], [TILES.CANOPY_DENSE, [30, 82, 34], 230]])
  for (let v = 0; v < TILE; v++)
    for (let u = 0; u < TILE; u++) {
      const d = Math.hypot(u - 15.5, v - 15.5) / 16
      if (d < 1) put(idx, u, v, base.map((x) => x + (hash(u, v, idx) - 0.5) * 20 - (u + v - 31) * 0.6), Math.round(a * (1 - d * d)))
    }

const outPath = join(outDir, 'park-tiles.png')
writeFileSync(outPath, PNG.sync.write(png))
console.log(`Created ${outPath} (${COLS}x${ROWS} = ${COLS * ROWS} tiles)`)
writeFileSync(join(__dirname, 'tile-indices.json'), JSON.stringify(TILES, null, 2))
console.log('Created scripts/tile-indices.json')
