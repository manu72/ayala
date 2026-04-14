/**
 * Generates placeholder cat spritesheets for Mamma Cat and Blacky.
 *
 * Layout: 128x160 PNG (4 cols x 5 rows of 32x32 frames)
 *   Row 0: walk down  (4 frames)
 *   Row 1: walk left  (4 frames)
 *   Row 2: walk right (4 frames)
 *   Row 3: walk up    (4 frames)
 *   Row 4: idle       (4 frames, subtle variation)
 *
 * Run: node scripts/generate-sprites.mjs
 */

import { PNG } from 'pngjs'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'assets', 'sprites')
mkdirSync(outDir, { recursive: true })

const FRAME = 32
const COLS = 4
const ROWS = 5
const WIDTH = FRAME * COLS
const HEIGHT = FRAME * ROWS

function setPixel(png, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return
  const idx = (png.width * y + x) << 2
  png.data[idx] = r
  png.data[idx + 1] = g
  png.data[idx + 2] = b
  png.data[idx + 3] = a
}

function fillRect(png, x0, y0, w, h, r, g, b, a = 255) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(png, x0 + dx, y0 + dy, r, g, b, a)
    }
  }
}

/**
 * Draw a simple cat silhouette in a 32x32 frame.
 * bodyColor: [r, g, b] for body
 * patchColor: [r, g, b] | null for optional patches
 * direction: 'down' | 'left' | 'right' | 'up'
 * frame: 0-3 for walk animation offset
 */
function drawCat(png, fx, fy, bodyColor, patchColor, direction, frame) {
  const ox = fx * FRAME
  const oy = fy * FRAME
  const [br, bg, bb] = bodyColor

  // Body (oval-ish): centered at 16,18 size 16x12
  fillRect(png, ox + 8, oy + 14, 16, 12, br, bg, bb)

  // Head: centered at 16,10 size 12x10
  fillRect(png, ox + 10, oy + 6, 12, 10, br, bg, bb)

  // Ears: two triangular nubs
  fillRect(png, ox + 10, oy + 3, 4, 4, br, bg, bb)
  fillRect(png, ox + 18, oy + 3, 4, 4, br, bg, bb)

  // Inner ears (pink)
  fillRect(png, ox + 11, oy + 4, 2, 2, 255, 150, 170)
  fillRect(png, ox + 19, oy + 4, 2, 2, 255, 150, 170)

  // Eyes based on direction
  const eyeColor = [40, 200, 80]
  if (direction === 'down' || direction === 'idle') {
    fillRect(png, ox + 12, oy + 9, 2, 2, ...eyeColor)
    fillRect(png, ox + 18, oy + 9, 2, 2, ...eyeColor)
    // Nose
    setPixel(png, ox + 15, oy + 12, 255, 150, 170)
    setPixel(png, ox + 16, oy + 12, 255, 150, 170)
  } else if (direction === 'up') {
    // No eyes visible from behind, show ear backs
  } else if (direction === 'left') {
    fillRect(png, ox + 11, oy + 9, 2, 2, ...eyeColor)
    setPixel(png, ox + 13, oy + 12, 255, 150, 170)
  } else if (direction === 'right') {
    fillRect(png, ox + 19, oy + 9, 2, 2, ...eyeColor)
    setPixel(png, ox + 18, oy + 12, 255, 150, 170)
  }

  // Tail
  const tailOffset = (frame % 2) * 2
  if (direction === 'down') {
    fillRect(png, ox + 22, oy + 16 + tailOffset, 3, 6, br, bg, bb)
    fillRect(png, ox + 24, oy + 14 + tailOffset, 2, 4, br, bg, bb)
  } else if (direction === 'up') {
    fillRect(png, ox + 22, oy + 12 + tailOffset, 3, 6, br, bg, bb)
    fillRect(png, ox + 24, oy + 10 + tailOffset, 2, 4, br, bg, bb)
  } else if (direction === 'left') {
    fillRect(png, ox + 22, oy + 14 + tailOffset, 6, 3, br, bg, bb)
  } else if (direction === 'right') {
    fillRect(png, ox + 4, oy + 14 + tailOffset, 6, 3, br, bg, bb)
  } else {
    fillRect(png, ox + 23, oy + 12, 3, 8, br, bg, bb)
    fillRect(png, ox + 25, oy + 8, 2, 5, br, bg, bb)
  }

  // Legs with walk animation
  const legOffset = Math.floor(frame / 2) === 0 ? 0 : 1
  fillRect(png, ox + 10, oy + 24 + legOffset, 3, 4 - legOffset, br, bg, bb)
  fillRect(png, ox + 14, oy + 24 - legOffset, 3, 4 + legOffset, br, bg, bb)
  fillRect(png, ox + 18, oy + 24 + legOffset, 3, 4 - legOffset, br, bg, bb)

  // Paws (dark tips)
  fillRect(png, ox + 10, oy + 27, 3, 1, br * 0.6, bg * 0.6, bb * 0.6)
  fillRect(png, ox + 14, oy + 27, 3, 1, br * 0.6, bg * 0.6, bb * 0.6)
  fillRect(png, ox + 18, oy + 27, 3, 1, br * 0.6, bg * 0.6, bb * 0.6)

  // Patches for Mamma Cat (black spots on white)
  if (patchColor) {
    const [pr, pg, pb] = patchColor
    fillRect(png, ox + 9, oy + 15, 5, 4, pr, pg, pb)
    fillRect(png, ox + 18, oy + 17, 4, 3, pr, pg, pb)
    fillRect(png, ox + 12, oy + 7, 4, 3, pr, pg, pb)
  }
}

function generateSpritesheet(filename, bodyColor, patchColor) {
  const png = new PNG({ width: WIDTH, height: HEIGHT })

  // Transparent background
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      setPixel(png, x, y, 0, 0, 0, 0)
    }
  }

  const directions = ['down', 'left', 'right', 'up', 'idle']

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      drawCat(png, col, row, bodyColor, patchColor, directions[row], col)
    }
  }

  const buffer = PNG.sync.write(png)
  const path = join(outDir, filename)
  writeFileSync(path, buffer)
  console.log(`Created ${path}`)
}

// Mamma Cat: white body with black patches
generateSpritesheet('mammacat.png', [230, 230, 230], [40, 40, 40])

// Blacky: solid dark/black cat
generateSpritesheet('blacky.png', [30, 30, 35], null)

console.log('Done — placeholder sprites generated.')
