/**
 * Generates an improved park-tiles.png tileset for Ayala Triangle Gardens.
 *
 * Every tile has subtle texture and variation -- no flat solid colors.
 * 32x32 tiles arranged in an 8-column grid.
 *
 * Run: node scripts/generate-tileset.mjs
 */

import { PNG } from 'pngjs'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'assets', 'tilesets')
mkdirSync(outDir, { recursive: true })

const TILE = 32
const COLS = 8
const ROWS = 5
const WIDTH = TILE * COLS
const HEIGHT = TILE * ROWS

// Tile indices
const TILES = {
  GRASS_LIGHT:    0,
  GRASS_DARK:     1,
  STONE_PATH:     2,
  ROAD:           3,
  WATER:          4,
  BUILDING:       5,
  PLAZA:          6,
  HEDGE:          7,

  TREE_TRUNK:     8,
  TREE_CANOPY:    9,
  SAND:           10,
  PLAYGROUND:     11,
  FLOWER_BED:     12,
  BENCH:          13,
  STEPS:          14,
  STARBUCKS:      15,

  ROAD_LINE:      16,
  ESCALATOR:      17,
  FOUNTAIN_EDGE:  18,
  BOULDER:        19,
  MONUMENT:       20,
  DINING:         21,
  SIDEWALK:       22,
  DIRT:           23,

  GRASS_MED:      24,
  CANOPY_DENSE:   25,
  TOWER:          26,
  HELIPAD:        27,
  SHRUB:          28,
  ART:            29,
  LAMPPOST:       30,
  EMPTY:          31,

  // Row 4 — new transition/variant tiles
  GRASS_FLOWER:   32,
  GRASS_TO_PATH:  33,
  PATH_TO_PLAZA:  34,
  ROAD_EDGE:      35,
  ROAD_SOLID_LINE:36,
  GLASS_FACADE:   37,
  ROOF:           38,
  WATER_EDGE:     39,
}

const png = new PNG({ width: WIDTH, height: HEIGHT })

// Init transparent
for (let i = 0; i < png.data.length; i += 4) {
  png.data[i] = 0; png.data[i+1] = 0; png.data[i+2] = 0; png.data[i+3] = 0
}

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return
  const idx = (WIDTH * y + x) << 2
  png.data[idx] = r; png.data[idx+1] = g; png.data[idx+2] = b; png.data[idx+3] = a
}

function getPixel(x, y) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return [0,0,0,0]
  const idx = (WIDTH * y + x) << 2
  return [png.data[idx], png.data[idx+1], png.data[idx+2], png.data[idx+3]]
}

function fillRect(x0, y0, w, h, r, g, b, a = 255) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      setPixel(x0+dx, y0+dy, r, g, b, a)
}

function tileOrigin(idx) {
  return { x: (idx % COLS) * TILE, y: Math.floor(idx / COLS) * TILE }
}

// Seeded random for reproducibility
let seed = 42
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return (seed >> 16) / 32768
}

function noise(base, intensity) {
  return Math.max(0, Math.min(255, base + Math.floor((rand() - 0.5) * 2 * intensity)))
}

/**
 * Fill a tile with a base color + per-pixel noise for organic texture.
 */
function fillTileTextured(idx, r, g, b, intensity = 12) {
  const { x: ox, y: oy } = tileOrigin(idx)
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 0; dx < TILE; dx++) {
      setPixel(ox+dx, oy+dy, noise(r, intensity), noise(g, intensity), noise(b, intensity))
    }
  }
}

/**
 * Draw a circle (filled) onto the tileset.
 */
function fillCircle(cx, cy, radius, r, g, b, a = 255) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx*dx + dy*dy <= radius*radius) {
        setPixel(cx+dx, cy+dy, noise(r, 8), noise(g, 8), noise(b, 8), a)
      }
    }
  }
}

// ──────────────────────────────────────
// GRASS TILES — lush greens with variation
// ──────────────────────────────────────

// Light grass with blade-like texture
function drawGrass(idx, baseR, baseG, baseB) {
  fillTileTextured(idx, baseR, baseG, baseB, 10)
  const { x: ox, y: oy } = tileOrigin(idx)
  // Scattered darker grass blades
  for (let i = 0; i < 20; i++) {
    const bx = ox + Math.floor(rand() * 30) + 1
    const by = oy + Math.floor(rand() * 30) + 1
    const shade = Math.floor(rand() * 20) - 10
    setPixel(bx, by, baseR - 15 + shade, baseG - 10 + shade, baseB - 20 + shade)
    setPixel(bx, by - 1, baseR - 20 + shade, baseG - 5 + shade, baseB - 25 + shade)
  }
}

drawGrass(TILES.GRASS_LIGHT, 105, 170, 65)
drawGrass(TILES.GRASS_DARK, 55, 115, 40)
drawGrass(TILES.GRASS_MED, 80, 145, 55)

// Grass with flowers
drawGrass(TILES.GRASS_FLOWER, 105, 170, 65)
{
  const { x: ox, y: oy } = tileOrigin(TILES.GRASS_FLOWER)
  const colors = [[255, 240, 80], [255, 180, 200], [255, 255, 255], [255, 150, 50]]
  for (let i = 0; i < 6; i++) {
    const fx = ox + Math.floor(rand() * 28) + 2
    const fy = oy + Math.floor(rand() * 28) + 2
    const c = colors[Math.floor(rand() * colors.length)]
    setPixel(fx, fy, c[0], c[1], c[2])
    setPixel(fx+1, fy, c[0]-20, c[1]-20, c[2]-20)
  }
}

// ──────────────────────────────────────
// PATH TILES — stone walkways with paving grid
// ──────────────────────────────────────

function drawStonePath(idx, baseR, baseG, baseB) {
  fillTileTextured(idx, baseR, baseG, baseB, 8)
  const { x: ox, y: oy } = tileOrigin(idx)
  // Paving stone grid lines
  for (let dx = 0; dx < TILE; dx++) {
    setPixel(ox+dx, oy, baseR-25, baseG-25, baseB-25)
    setPixel(ox+dx, oy+15, baseR-20, baseG-20, baseB-20)
    setPixel(ox+dx, oy+TILE-1, baseR-25, baseG-25, baseB-25)
  }
  for (let dy = 0; dy < TILE; dy++) {
    setPixel(ox, oy+dy, baseR-25, baseG-25, baseB-25)
    setPixel(ox+15, oy+dy, baseR-20, baseG-20, baseB-20)
    setPixel(ox+TILE-1, oy+dy, baseR-25, baseG-25, baseB-25)
  }
}

drawStonePath(TILES.STONE_PATH, 185, 175, 155)
drawStonePath(TILES.PLAZA, 195, 190, 178)

// Grass-to-path transition
drawGrass(TILES.GRASS_TO_PATH, 105, 170, 65)
{
  const { x: ox, y: oy } = tileOrigin(TILES.GRASS_TO_PATH)
  // Right half transitions to dirt/path
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 16; dx < TILE; dx++) {
      const blend = (dx - 16) / 16
      const gr = 105, gg = 170, gb = 65
      const pr = 160, pg = 145, pb = 110
      setPixel(ox+dx, oy+dy,
        noise(Math.round(gr + (pr-gr) * blend), 8),
        noise(Math.round(gg + (pg-gg) * blend), 8),
        noise(Math.round(gb + (pb-gb) * blend), 8))
    }
  }
}

// Path-to-plaza transition
drawStonePath(TILES.PATH_TO_PLAZA, 188, 180, 162)
{
  const { x: ox, y: oy } = tileOrigin(TILES.PATH_TO_PLAZA)
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 16; dx < TILE; dx++) {
      const blend = (dx - 16) / 16
      setPixel(ox+dx, oy+dy,
        noise(Math.round(188 + (195-188) * blend), 6),
        noise(Math.round(180 + (190-180) * blend), 6),
        noise(Math.round(162 + (178-162) * blend), 6))
    }
  }
}

// ──────────────────────────────────────
// ROAD TILES — dark asphalt with markings
// ──────────────────────────────────────

fillTileTextured(TILES.ROAD, 50, 50, 55, 6)

// Road with dashed center line
fillTileTextured(TILES.ROAD_LINE, 50, 50, 55, 6)
{
  const { x: ox, y: oy } = tileOrigin(TILES.ROAD_LINE)
  // Dashed white center line
  for (let dy = 2; dy < 10; dy++)
    fillRect(ox+14, oy+dy, 4, 1, 220, 220, 215)
  for (let dy = 22; dy < 30; dy++)
    fillRect(ox+14, oy+dy, 4, 1, 220, 220, 215)
}

// Road with solid edge line
fillTileTextured(TILES.ROAD_SOLID_LINE, 50, 50, 55, 6)
{
  const { x: ox, y: oy } = tileOrigin(TILES.ROAD_SOLID_LINE)
  for (let dy = 0; dy < TILE; dy++)
    fillRect(ox+TILE-3, oy+dy, 2, 1, 220, 220, 215)
}

// Road edge (transition road→sidewalk)
fillTileTextured(TILES.ROAD_EDGE, 50, 50, 55, 6)
{
  const { x: ox, y: oy } = tileOrigin(TILES.ROAD_EDGE)
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 24; dx < TILE; dx++) {
      const blend = (dx - 24) / 8
      setPixel(ox+dx, oy+dy,
        noise(Math.round(50 + (165-50)*blend), 5),
        noise(Math.round(50 + (160-50)*blend), 5),
        noise(Math.round(55 + (155-55)*blend), 5))
    }
  }
}

// Sidewalk — lighter grey with subtle grid
fillTileTextured(TILES.SIDEWALK, 170, 165, 158, 6)
{
  const { x: ox, y: oy } = tileOrigin(TILES.SIDEWALK)
  for (let dx = 0; dx < TILE; dx++) {
    setPixel(ox+dx, oy+15, 155, 150, 143)
  }
  for (let dy = 0; dy < TILE; dy++) {
    setPixel(ox+15, oy+dy, 155, 150, 143)
  }
}

// ──────────────────────────────────────
// WATER — animated-looking waves
// ──────────────────────────────────────
{
  const { x: ox, y: oy } = tileOrigin(TILES.WATER)
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 0; dx < TILE; dx++) {
      const w1 = Math.sin(dx * 0.5 + dy * 0.3) * 0.5 + 0.5
      const w2 = Math.sin(dx * 0.2 - dy * 0.4) * 0.3 + 0.5
      const blend = (w1 + w2) / 2
      setPixel(ox+dx, oy+dy,
        Math.round(40 + blend * 35),
        Math.round(100 + blend * 40),
        Math.round(160 + blend * 40))
    }
  }
}

// Water edge
{
  const { x: ox, y: oy } = tileOrigin(TILES.WATER_EDGE)
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 0; dx < TILE; dx++) {
      const blend = dy / TILE
      const wr = 40 + 35 * Math.sin(dx * 0.5) * 0.5 + 17
      const wg = 100 + 40 * Math.sin(dx * 0.5) * 0.5 + 20
      const wb = 160 + 40 * Math.sin(dx * 0.5) * 0.5 + 20
      setPixel(ox+dx, oy+dy,
        noise(Math.round(155 + (wr-155)*blend), 5),
        noise(Math.round(150 + (wg-150)*blend), 5),
        noise(Math.round(143 + (wb-143)*blend), 5))
    }
  }
}

// ──────────────────────────────────────
// BUILDING TILES
// ──────────────────────────────────────

// Concrete wall with horizontal lines
fillTileTextured(TILES.BUILDING, 140, 140, 145, 5)
{
  const { x: ox, y: oy } = tileOrigin(TILES.BUILDING)
  for (let i = 0; i < 4; i++) {
    const ly = oy + 7 + i * 8
    fillRect(ox, ly, TILE, 1, 125, 125, 130)
  }
}

// Glass facade
fillTileTextured(TILES.GLASS_FACADE, 120, 140, 165, 5)
{
  const { x: ox, y: oy } = tileOrigin(TILES.GLASS_FACADE)
  // Reflection highlights
  fillRect(ox+4, oy+4, 2, 8, 160, 180, 210)
  fillRect(ox+18, oy+12, 2, 6, 155, 175, 205)
  // Window grid
  for (let dy = 0; dy < TILE; dy += 8)
    fillRect(ox, oy+dy, TILE, 1, 90, 100, 120)
  for (let dx = 0; dx < TILE; dx += 8)
    fillRect(ox+dx, oy, 1, TILE, 90, 100, 120)
}

// Roof
fillTileTextured(TILES.ROOF, 100, 100, 108, 5)

// Tower
fillTileTextured(TILES.TOWER, 155, 158, 168, 4)
{
  const { x: ox, y: oy } = tileOrigin(TILES.TOWER)
  for (let i = 0; i < 4; i++) fillRect(ox, oy+i*8, TILE, 1, 135, 138, 148)
  for (let i = 0; i < 4; i++) fillRect(ox+i*8, oy, 1, TILE, 135, 138, 148)
}

// Starbucks — green tinted
fillTileTextured(TILES.STARBUCKS, 0, 95, 55, 6)
{
  const { x: ox, y: oy } = tileOrigin(TILES.STARBUCKS)
  // Door/window
  fillRect(ox+12, oy+18, 8, 14, 30, 120, 80)
  fillRect(ox+13, oy+19, 6, 12, 60, 150, 100)
}

// ──────────────────────────────────────
// VEGETATION
// ──────────────────────────────────────

// Tree trunk — brown circle on grass
drawGrass(TILES.TREE_TRUNK, 105, 170, 65)
{
  const { x: ox, y: oy } = tileOrigin(TILES.TREE_TRUNK)
  fillCircle(ox+16, oy+16, 5, 85, 55, 25)
  fillCircle(ox+16, oy+16, 3, 70, 45, 20)
  // Bark highlight
  setPixel(ox+14, oy+14, 100, 70, 35)
  setPixel(ox+15, oy+13, 105, 75, 40)
}

// Tree canopy — semi-transparent dark green blob
{
  const { x: ox, y: oy } = tileOrigin(TILES.TREE_CANOPY)
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 0; dx < TILE; dx++) {
      const dist = Math.hypot(dx - 16, dy - 16) / 16
      if (dist < 1.0) {
        const fade = 1 - dist * dist
        const alpha = Math.round(200 * fade)
        setPixel(ox+dx, oy+dy, noise(40, 10), noise(100, 15), noise(40, 10), alpha)
      }
    }
  }
}

// Dense canopy — darker, more opaque
{
  const { x: ox, y: oy } = tileOrigin(TILES.CANOPY_DENSE)
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 0; dx < TILE; dx++) {
      const dist = Math.hypot(dx - 16, dy - 16) / 16
      if (dist < 1.0) {
        const fade = 1 - dist * dist
        const alpha = Math.round(230 * fade)
        setPixel(ox+dx, oy+dy, noise(25, 8), noise(75, 12), noise(25, 8), alpha)
      }
    }
  }
}

// Hedge
fillTileTextured(TILES.HEDGE, 30, 80, 30, 10)
{
  const { x: ox, y: oy } = tileOrigin(TILES.HEDGE)
  // Rounded top edge for bush shape
  for (let dx = 0; dx < TILE; dx++) {
    const h = Math.round(4 * Math.sin(dx / TILE * Math.PI))
    for (let dy = 0; dy < h; dy++) setPixel(ox+dx, oy+dy, 0, 0, 0, 0)
  }
  // Light highlights on top
  for (let dx = 4; dx < 28; dx++)
    setPixel(ox+dx, oy+4, noise(50, 5), noise(100, 8), noise(50, 5))
}

// Shrub — smaller green blob on grass
drawGrass(TILES.SHRUB, 105, 170, 65)
{
  const { x: ox, y: oy } = tileOrigin(TILES.SHRUB)
  fillCircle(ox+16, oy+18, 8, 45, 100, 40)
  fillCircle(ox+16, oy+16, 6, 55, 110, 45)
  // Highlight
  fillCircle(ox+14, oy+14, 3, 65, 125, 55)
}

// Flower bed
drawGrass(TILES.FLOWER_BED, 70, 135, 50)
{
  const { x: ox, y: oy } = tileOrigin(TILES.FLOWER_BED)
  const colors = [[255, 90, 110], [255, 200, 50], [220, 100, 255], [255, 150, 80], [255, 255, 100]]
  for (let i = 0; i < 12; i++) {
    const fx = ox + Math.floor(rand() * 28) + 2
    const fy = oy + Math.floor(rand() * 28) + 2
    const c = colors[Math.floor(rand() * colors.length)]
    setPixel(fx, fy, c[0], c[1], c[2])
    setPixel(fx+1, fy, c[0]-30, c[1]-20, c[2]-20)
    setPixel(fx, fy+1, c[0]-20, c[1]-30, c[2]-20)
  }
}

// ──────────────────────────────────────
// FURNITURE / LANDMARKS
// ──────────────────────────────────────

// Bench — wooden slats with metal supports
drawGrass(TILES.BENCH, 105, 170, 65)
{
  const { x: ox, y: oy } = tileOrigin(TILES.BENCH)
  // Metal supports
  fillRect(ox+6, oy+10, 3, 14, 85, 85, 90)
  fillRect(ox+23, oy+10, 3, 14, 85, 85, 90)
  // Wooden slats
  fillRect(ox+5, oy+12, 22, 3, 140, 90, 45)
  fillRect(ox+5, oy+16, 22, 3, 130, 85, 40)
  fillRect(ox+5, oy+20, 22, 3, 135, 88, 42)
  // Shadow
  fillRect(ox+7, oy+24, 18, 2, 80, 130, 50, 120)
}

// Steps
fillTileTextured(TILES.STEPS, 175, 170, 158, 5)
{
  const { x: ox, y: oy } = tileOrigin(TILES.STEPS)
  for (let i = 0; i < 4; i++) {
    const ly = oy + i * 8
    fillRect(ox, ly, TILE, 1, 150, 145, 135)
    fillRect(ox, ly+1, TILE, 1, 190, 185, 172)
  }
}

// Boulder
drawGrass(TILES.BOULDER, 105, 170, 65)
{
  const { x: ox, y: oy } = tileOrigin(TILES.BOULDER)
  fillCircle(ox+16, oy+18, 9, 130, 125, 115)
  fillCircle(ox+14, oy+16, 7, 145, 140, 128)
  // Highlight
  fillCircle(ox+13, oy+14, 3, 160, 155, 145)
}

// Monument
fillTileTextured(TILES.MONUMENT, 155, 148, 138, 5)
{
  const { x: ox, y: oy } = tileOrigin(TILES.MONUMENT)
  // Pedestal shape
  fillRect(ox+8, oy+20, 16, 12, 140, 135, 125)
  fillRect(ox+10, oy+4, 12, 18, 150, 145, 135)
  fillRect(ox+12, oy+2, 8, 4, 160, 155, 145)
}

// Fountain edge
fillTileTextured(TILES.FOUNTAIN_EDGE, 160, 155, 145, 5)
{
  const { x: ox, y: oy } = tileOrigin(TILES.FOUNTAIN_EDGE)
  // Circular stone rim
  fillCircle(ox+16, oy+16, 14, 150, 145, 135)
  fillCircle(ox+16, oy+16, 11, 60, 120, 180) // water inside
}

// Dining area — tables with white umbrella top
drawStonePath(TILES.DINING, 190, 185, 175)
{
  const { x: ox, y: oy } = tileOrigin(TILES.DINING)
  fillCircle(ox+16, oy+16, 10, 240, 238, 235) // white umbrella
  fillCircle(ox+16, oy+16, 8, 245, 243, 240)
  setPixel(ox+16, oy+16, 80, 80, 85) // pole center
}

// Escalator
fillTileTextured(TILES.ESCALATOR, 115, 118, 122, 4)
{
  const { x: ox, y: oy } = tileOrigin(TILES.ESCALATOR)
  for (let i = 0; i < 8; i++) {
    fillRect(ox+2, oy+i*4, 28, 1, 85, 88, 95)
    fillRect(ox+2, oy+i*4+2, 28, 1, 130, 133, 138)
  }
  // Handrails
  fillRect(ox, oy, 2, TILE, 70, 70, 75)
  fillRect(ox+30, oy, 2, TILE, 70, 70, 75)
}

// Lamppost on grass
drawGrass(TILES.LAMPPOST, 105, 170, 65)
{
  const { x: ox, y: oy } = tileOrigin(TILES.LAMPPOST)
  fillRect(ox+15, oy+8, 2, 20, 60, 60, 65)
  fillCircle(ox+16, oy+6, 3, 240, 230, 180) // lamp head
}

// Art installation
drawGrass(TILES.ART, 105, 170, 65)
{
  const { x: ox, y: oy } = tileOrigin(TILES.ART)
  // Abstract metal sculpture
  fillRect(ox+14, oy+22, 4, 10, 140, 80, 50)
  fillRect(ox+10, oy+10, 12, 14, 175, 125, 85)
  fillRect(ox+12, oy+8, 8, 4, 185, 135, 90)
  // Shadow
  fillRect(ox+12, oy+28, 8, 2, 80, 130, 50, 100)
}

// Sand
fillTileTextured(TILES.SAND, 195, 178, 138, 10)

// Dirt
fillTileTextured(TILES.DIRT, 135, 110, 72, 10)
{
  const { x: ox, y: oy } = tileOrigin(TILES.DIRT)
  // Small pebbles
  for (let i = 0; i < 5; i++) {
    const px = ox + Math.floor(rand() * 28) + 2
    const py = oy + Math.floor(rand() * 28) + 2
    setPixel(px, py, 110, 90, 60)
  }
}

// Playground
{
  const { x: ox, y: oy } = tileOrigin(TILES.PLAYGROUND)
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 0; dx < TILE; dx++) {
      const wave = Math.sin(dx * 0.25 + dy * 0.15) * 0.5 + 0.5
      setPixel(ox+dx, oy+dy,
        noise(Math.round(40 + wave * 30), 6),
        noise(Math.round(120 + wave * 40), 6),
        noise(Math.round(140 + (1-wave) * 40), 6))
    }
  }
}

// Helipad
fillTileTextured(TILES.HELIPAD, 95, 95, 100, 4)
{
  const { x: ox, y: oy } = tileOrigin(TILES.HELIPAD)
  fillCircle(ox+16, oy+16, 12, 100, 100, 105)
  // H marking
  fillRect(ox+10, oy+10, 3, 12, 220, 220, 220)
  fillRect(ox+19, oy+10, 3, 12, 220, 220, 220)
  fillRect(ox+10, oy+15, 12, 3, 220, 220, 220)
}

// Empty tile — fully transparent (already transparent from init)

const buffer = PNG.sync.write(png)
const outPath = join(outDir, 'park-tiles.png')
writeFileSync(outPath, buffer)
console.log(`Created ${outPath} (${COLS}x${ROWS} = ${COLS*ROWS} tiles)`)

const tilesJson = JSON.stringify(TILES, null, 2)
writeFileSync(join(__dirname, 'tile-indices.json'), tilesJson)
console.log('Created scripts/tile-indices.json')
