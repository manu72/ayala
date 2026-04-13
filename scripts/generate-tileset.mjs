/**
 * Generates the park-tiles.png tileset for Ayala Triangle Gardens.
 *
 * 32x32 tiles arranged in an 8-column grid.
 * Each tile index maps to a terrain/object type.
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
const ROWS = 4
const WIDTH = TILE * COLS
const HEIGHT = TILE * ROWS

// Tile indices (0-based, matching the map generator)
// Row 0
const TILES = {
  GRASS_LIGHT:    0,  // light green lawn
  GRASS_DARK:     1,  // darker green (garden beds, dense area)
  STONE_PATH:     2,  // beige/tan walkway
  ROAD:           3,  // dark grey asphalt (impassable)
  WATER:          4,  // blue fountain water
  BUILDING:       5,  // grey concrete building
  PLAZA:          6,  // light grey stone floor
  HEDGE:          7,  // dark green hedge (collision)
  // Row 1
  TREE_TRUNK:     8,  // brown tree trunk (collision)
  TREE_CANOPY:    9,  // overhead canopy green
  SAND:           10, // sandy/mulch area
  PLAYGROUND:     11, // colorful playground surface
  FLOWER_BED:     12, // colorful garden flowers
  BENCH:          13, // wooden bench
  STEPS:          14, // pyramid steps (stone, distinct)
  STARBUCKS:      15, // green-tinted building (Starbucks)
  // Row 2
  ROAD_LINE:      16, // road with white line markings
  ESCALATOR:      17, // escalator / underpass entry
  FOUNTAIN_EDGE:  18, // fountain stone edge
  BOULDER:        19, // decorative boulder
  MONUMENT:       20, // monument stone
  DINING:         21, // restaurant outdoor area (white umbrella)
  SIDEWALK:       22, // light concrete sidewalk
  DIRT:           23, // dirt/earth patch
  // Row 3
  GRASS_MED:      24, // medium green
  CANOPY_DENSE:   25, // very dense canopy (darker)
  TOWER:          26, // tall building/tower
  HELIPAD:        27, // helipad circle
  SHRUB:          28, // ornamental shrub
  ART:            29, // public art installation
  LAMPPOST:       30, // lamp post
  EMPTY:          31, // empty/transparent
}

function fillTile(png, tileIdx, r, g, b) {
  const col = tileIdx % COLS
  const row = Math.floor(tileIdx / COLS)
  const ox = col * TILE
  const oy = row * TILE
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 0; dx < TILE; dx++) {
      const idx = (png.width * (oy + dy) + (ox + dx)) << 2
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
      png.data[idx + 3] = 255
    }
  }
}

function fillRect(png, x, y, w, h, r, g, b) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx
      const py = y + dy
      if (px >= 0 && px < png.width && py >= 0 && py < png.height) {
        const idx = (png.width * py + px) << 2
        png.data[idx] = r
        png.data[idx + 1] = g
        png.data[idx + 2] = b
        png.data[idx + 3] = 255
      }
    }
  }
}

function addNoise(png, tileIdx, intensity = 15) {
  const col = tileIdx % COLS
  const row = Math.floor(tileIdx / COLS)
  const ox = col * TILE
  const oy = row * TILE
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 0; dx < TILE; dx++) {
      const idx = (png.width * (oy + dy) + (ox + dx)) << 2
      const noise = Math.floor(Math.random() * intensity * 2) - intensity
      png.data[idx] = Math.max(0, Math.min(255, png.data[idx] + noise))
      png.data[idx + 1] = Math.max(0, Math.min(255, png.data[idx + 1] + noise))
      png.data[idx + 2] = Math.max(0, Math.min(255, png.data[idx + 2] + noise))
    }
  }
}

const png = new PNG({ width: WIDTH, height: HEIGHT })

// Initialize to transparent
for (let i = 0; i < png.data.length; i += 4) {
  png.data[i] = 0
  png.data[i + 1] = 0
  png.data[i + 2] = 0
  png.data[i + 3] = 0
}

// Fill base colors
fillTile(png, TILES.GRASS_LIGHT, 120, 180, 80)
fillTile(png, TILES.GRASS_DARK, 60, 120, 45)
fillTile(png, TILES.STONE_PATH, 190, 175, 150)
fillTile(png, TILES.ROAD, 55, 55, 60)
fillTile(png, TILES.WATER, 70, 130, 190)
fillTile(png, TILES.BUILDING, 140, 140, 145)
fillTile(png, TILES.PLAZA, 180, 178, 170)
fillTile(png, TILES.HEDGE, 35, 90, 35)
fillTile(png, TILES.TREE_TRUNK, 90, 60, 30)
fillTile(png, TILES.TREE_CANOPY, 50, 110, 50)
fillTile(png, TILES.SAND, 200, 180, 140)
fillTile(png, TILES.PLAYGROUND, 60, 140, 160)
fillTile(png, TILES.FLOWER_BED, 80, 150, 60)
fillTile(png, TILES.BENCH, 140, 100, 50)
fillTile(png, TILES.STEPS, 170, 165, 155)
fillTile(png, TILES.STARBUCKS, 0, 100, 60)
fillTile(png, TILES.ROAD_LINE, 55, 55, 60)
fillTile(png, TILES.ESCALATOR, 120, 125, 130)
fillTile(png, TILES.FOUNTAIN_EDGE, 160, 155, 145)
fillTile(png, TILES.BOULDER, 130, 125, 115)
fillTile(png, TILES.MONUMENT, 160, 150, 140)
fillTile(png, TILES.DINING, 200, 195, 185)
fillTile(png, TILES.SIDEWALK, 175, 170, 165)
fillTile(png, TILES.DIRT, 140, 115, 75)
fillTile(png, TILES.GRASS_MED, 90, 155, 65)
fillTile(png, TILES.CANOPY_DENSE, 35, 85, 35)
fillTile(png, TILES.TOWER, 160, 165, 175)
fillTile(png, TILES.HELIPAD, 100, 100, 105)
fillTile(png, TILES.SHRUB, 55, 110, 45)
fillTile(png, TILES.ART, 170, 120, 80)
fillTile(png, TILES.LAMPPOST, 110, 110, 100)
fillTile(png, TILES.EMPTY, 0, 0, 0)
// Make EMPTY transparent
{
  const col = TILES.EMPTY % COLS
  const row = Math.floor(TILES.EMPTY / COLS)
  const ox = col * TILE
  const oy = row * TILE
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 0; dx < TILE; dx++) {
      const idx = (png.width * (oy + dy) + (ox + dx)) << 2
      png.data[idx + 3] = 0
    }
  }
}

// Add texture/detail to important tiles

// Road line markings (white dashes on road)
{
  const col = TILES.ROAD_LINE % COLS
  const row = Math.floor(TILES.ROAD_LINE / COLS)
  const ox = col * TILE
  const oy = row * TILE
  for (let dx = 12; dx < 20; dx++) {
    fillRect(png, ox + dx, oy + 2, 1, 8, 220, 220, 220)
    fillRect(png, ox + dx, oy + 22, 1, 8, 220, 220, 220)
  }
}

// Tree trunk: brown center with bark detail
{
  const col = TILES.TREE_TRUNK % COLS
  const row = Math.floor(TILES.TREE_TRUNK / COLS)
  const ox = col * TILE
  const oy = row * TILE
  fillRect(png, ox + 10, oy + 2, 12, 28, 100, 65, 35)
  fillRect(png, ox + 12, oy + 0, 8, 32, 85, 55, 25)
}

// Bench: brown planks with supports
{
  const col = TILES.BENCH % COLS
  const row = Math.floor(TILES.BENCH / COLS)
  const ox = col * TILE
  const oy = row * TILE
  fillRect(png, ox + 4, oy + 12, 24, 3, 120, 80, 35)
  fillRect(png, ox + 4, oy + 17, 24, 3, 120, 80, 35)
  fillRect(png, ox + 6, oy + 10, 3, 12, 90, 90, 90)
  fillRect(png, ox + 23, oy + 10, 3, 12, 90, 90, 90)
}

// Steps: horizontal lines for step edges
{
  const col = TILES.STEPS % COLS
  const row = Math.floor(TILES.STEPS / COLS)
  const ox = col * TILE
  const oy = row * TILE
  for (let i = 0; i < 4; i++) {
    fillRect(png, ox, oy + i * 8, TILE, 1, 145, 140, 130)
  }
}

// Flower bed: add colored dots
{
  const col = TILES.FLOWER_BED % COLS
  const row = Math.floor(TILES.FLOWER_BED / COLS)
  const ox = col * TILE
  const oy = row * TILE
  const flowers = [[255, 100, 120], [255, 200, 50], [200, 100, 255], [255, 150, 80]]
  for (let i = 0; i < 8; i++) {
    const fx = Math.floor(Math.random() * 28) + 2
    const fy = Math.floor(Math.random() * 28) + 2
    const c = flowers[i % flowers.length]
    fillRect(png, ox + fx, oy + fy, 3, 3, c[0], c[1], c[2])
  }
}

// Playground: swirling blue/green pattern
{
  const col = TILES.PLAYGROUND % COLS
  const row = Math.floor(TILES.PLAYGROUND / COLS)
  const ox = col * TILE
  const oy = row * TILE
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 0; dx < TILE; dx++) {
      const wave = Math.sin(dx * 0.3 + dy * 0.2) * 0.5 + 0.5
      const r = Math.floor(40 + wave * 30)
      const g = Math.floor(120 + wave * 40)
      const b = Math.floor(140 + (1 - wave) * 40)
      const idx = (png.width * (oy + dy) + (ox + dx)) << 2
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
    }
  }
}

// Water: wave-like pattern
{
  const col = TILES.WATER % COLS
  const row = Math.floor(TILES.WATER / COLS)
  const ox = col * TILE
  const oy = row * TILE
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 0; dx < TILE; dx++) {
      const wave = Math.sin(dx * 0.4 + dy * 0.3) * 0.5 + 0.5
      const r = Math.floor(50 + wave * 30)
      const g = Math.floor(110 + wave * 30)
      const b = Math.floor(170 + wave * 30)
      const idx = (png.width * (oy + dy) + (ox + dx)) << 2
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
    }
  }
}

// Escalator: metal look with grooves
{
  const col = TILES.ESCALATOR % COLS
  const row = Math.floor(TILES.ESCALATOR / COLS)
  const ox = col * TILE
  const oy = row * TILE
  for (let i = 0; i < 8; i++) {
    fillRect(png, ox + 2, oy + i * 4, 28, 1, 90, 95, 100)
  }
}

// Add noise to natural tiles for organic feel
const noisyTiles = [
  TILES.GRASS_LIGHT, TILES.GRASS_DARK, TILES.GRASS_MED,
  TILES.SAND, TILES.DIRT, TILES.STONE_PATH,
]
noisyTiles.forEach(t => addNoise(png, t, 10))

const buffer = PNG.sync.write(png)
const outPath = join(outDir, 'park-tiles.png')
writeFileSync(outPath, buffer)
console.log(`Created ${outPath}`)

// Also export tile indices for the map generator
const tilesJson = JSON.stringify(TILES, null, 2)
writeFileSync(join(__dirname, 'tile-indices.json'), tilesJson)
console.log('Created scripts/tile-indices.json')
