/**
 * Write an RGBA image as an 8-bit palette PNG (median-cut to <= 256 colours).
 * Pixel-art tile atlases compress several times smaller this way than as
 * truecolour. Dev-only helper for the generator scripts.
 */

import { deflateSync } from 'zlib'

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/**
 * Palette: one fully transparent entry, up to TRANSLUCENT_SLOTS for translucent
 * pixels (the shade layer: one colour at many alphas, so it gets its own smooth
 * ramp), the rest median-cut + k-means over the opaque colours.
 */
const TRANSLUCENT_SLOTS = 32
function quantize(rgba) {
  const counts = new Map()
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3]
    const key = a === 0 ? 0 : ((rgba[i] << 24) | (rgba[i + 1] << 16) | (rgba[i + 2] << 8) | a) >>> 0
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const opaque = [], translucent = []
  for (const [k, n] of counts) {
    if (k === 0) continue
    const c = [k >>> 24, (k >>> 16) & 255, (k >>> 8) & 255, k & 255]
    ;(c[3] === 255 ? opaque : translucent).push({ k, c, n })
  }
  const t = quantizeGroup(translucent, Math.min(TRANSLUCENT_SLOTS, translucent.length))
  const o = quantizeGroup(opaque, 255 - t.palette.length)
  const palette = [[0, 0, 0, 0], ...t.palette, ...o.palette]
  const indexOf = new Map([[0, 0]])
  for (const [k, i] of t.indexOf) indexOf.set(k, 1 + i)
  for (const [k, i] of o.indexOf) indexOf.set(k, 1 + t.palette.length + i)
  return { palette, indexOf }
}

/** Median cut + k-means polish over one group of colours ({ k, c: [r,g,b,a], n }). */
function quantizeGroup(colors, slots) {
  if (!colors.length || slots <= 0) return { palette: [], indexOf: new Map() }
  let boxes = [colors]
  const range = (box, ch) => { let lo = 255, hi = 0; for (const { c } of box) { lo = Math.min(lo, c[ch]); hi = Math.max(hi, c[ch]) } return hi - lo }
  while (boxes.length < slots) {
    // split the box with the biggest weighted spread
    let bi = -1, bs = 0, bch = 0
    boxes.forEach((box, i) => {
      if (box.length < 2) return
      const n = box.reduce((a, x) => a + x.n, 0)
      for (let ch = 0; ch < 4; ch++) { const s = range(box, ch) * Math.sqrt(n); if (s > bs) { bs = s; bi = i; bch = ch } }
    })
    if (bi < 0) break
    const box = boxes[bi].sort((p, q) => p.c[bch] - q.c[bch])
    const total = box.reduce((a, x) => a + x.n, 0)
    let acc = 0, cut = 1
    for (let i = 0; i < box.length - 1; i++) { acc += box[i].n; if (acc >= total / 2) { cut = i + 1; break } }
    boxes.splice(bi, 1, box.slice(0, cut), box.slice(cut))
  }
  let palette = boxes.map((box) => {
    const n = box.reduce((a, x) => a + x.n, 0)
    return [0, 1, 2, 3].map((ch) => box.reduce((a, x) => a + x.c[ch] * x.n, 0) / n)
  })
  // k-means polish: reassign every colour to its nearest entry (luma-weighted), re-average
  const dist = (c, p) => 3 * (c[0] - p[0]) ** 2 + 6 * (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2 + 4 * (c[3] - p[3]) ** 2
  const nearest = (c) => {
    let bi = 0, bd = Infinity
    for (let i = 0; i < palette.length; i++) { const d = dist(c, palette[i]); if (d < bd) { bd = d; bi = i } }
    return bi
  }
  for (let iter = 0; iter < 6; iter++) {
    const sum = palette.map(() => [0, 0, 0, 0, 0])
    for (const x of colors) { const i = nearest(x.c); for (let ch = 0; ch < 4; ch++) sum[i][ch] += x.c[ch] * x.n; sum[i][4] += x.n }
    palette = palette.map((p, i) => (sum[i][4] ? sum[i].slice(0, 4).map((v) => v / sum[i][4]) : p))
  }
  palette = palette.map((p) => p.map(Math.round))
  const indexOf = new Map()
  for (const x of colors) indexOf.set(x.k, nearest(x.c))
  return { palette, indexOf }
}

export function encodeIndexedPng(width, height, rgba) {
  const { palette, indexOf } = quantize(rgba)
  // transparent entries first so tRNS stays short
  const order = palette.map((_, i) => i).sort((a, b) => (palette[a][3] === 255) - (palette[b][3] === 255))
  const remap = new Uint8Array(palette.length); order.forEach((old, i) => { remap[old] = i })
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, a = rgba[i + 3]
      const key = a === 0 ? 0 : ((rgba[i] << 24) | (rgba[i + 1] << 16) | (rgba[i + 2] << 8) | a) >>> 0
      raw[y * (width + 1) + 1 + x] = remap[indexOf.get(key)]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 3
  const plte = Buffer.from(order.flatMap((i) => palette[i].slice(0, 3)))
  const alphas = order.map((i) => palette[i][3])
  const lastT = alphas.findLastIndex((a) => a !== 255)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('PLTE', plte),
    ...(lastT >= 0 ? [chunk('tRNS', Buffer.from(alphas.slice(0, lastT + 1)))] : []),
    chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}
