/**
 * Renders public/assets/tilemaps/atg.json to a PNG for reviewing the map
 * without running the game. Spawns/POIs are drawn as red dots.
 *
 * Run: node scripts/render-map.mjs [out.png] [pxPerTile=4]
 */

import { PNG } from 'pngjs'
import { readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = process.argv[2] ?? join(tmpdir(), 'atg-map.png')
const S = Number(process.argv[3] ?? 4)
const map = JSON.parse(readFileSync(join(root, 'public/assets/tilemaps/atg.json'), 'utf8'))

const sheets = map.tilesets.map((ts) => ({
  ...ts, png: PNG.sync.read(readFileSync(join(root, 'public/assets/tilemaps', ts.image))),
}))
const img = new PNG({ width: map.width * S, height: map.height * S })

function drawTile(gid, tx, ty, offX = 0, offY = 0) {
  const ts = [...sheets].reverse().find((s) => gid >= s.firstgid)
  if (!ts) return
  const local = gid - ts.firstgid
  const m = ts.margin ?? 0, sp = ts.spacing ?? 0
  const sx0 = m + (local % ts.columns) * (ts.tilewidth + sp), sy0 = m + Math.floor(local / ts.columns) * (ts.tileheight + sp)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const si = ((sy0 + Math.floor((y * ts.tileheight) / S)) * ts.png.width + sx0 + Math.floor((x * ts.tilewidth) / S)) * 4
      const a = ts.png.data[si + 3] / 255
      if (!a) continue
      const dx = tx * S + x + offX, dy = ty * S + y + offY
      if (dx < 0 || dy < 0 || dx >= img.width || dy >= img.height) continue
      const di = (dy * img.width + dx) * 4
      for (let c = 0; c < 3; c++) img.data[di + c] = Math.round(ts.png.data[si + c] * a + img.data[di + c] * (1 - a))
      img.data[di + 3] = 255
    }
}

// hidden layers (the gameplay ground) are skipped; offset layers (groundArt, shade) are shifted
for (const layer of map.layers.filter((l) => l.type === 'tilelayer' && l.visible !== false)) {
  const ox = Math.round(((layer.offsetx ?? 0) * S) / map.tilewidth), oy = Math.round(((layer.offsety ?? 0) * S) / map.tileheight)
  layer.data.forEach((gid, i) => gid && drawTile(gid, i % layer.width, Math.floor(i / layer.width), ox, oy))
}

const dot = (x, y, r, rgb) => {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const px = Math.round(x + dx), py = Math.round(y + dy)
      if (dx * dx + dy * dy > r * r || px < 0 || py < 0 || px >= img.width || py >= img.height) continue
      img.data.set([...rgb, 255], (py * img.width + px) * 4)
    }
}
const k = S / map.tilewidth
for (const o of map.layers.find((l) => l.name === 'spawns')?.objects ?? []) dot(o.x * k, o.y * k, Math.max(2, S / 2), [220, 30, 30])

writeFileSync(out, PNG.sync.write(img))
console.log(`Wrote ${out} (${img.width}x${img.height})`)
