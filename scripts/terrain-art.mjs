/**
 * Pixel painters for the Ayala Triangle Gardens ground art (dev-only, used by
 * generate-map.mjs and generate-tileset.mjs). Pure functions, no randomness:
 * every texture is a hash of (terrain, pixel, variant).
 *
 * One light direction everywhere: light from the north-west (top-left), so
 * lit edges face up-left and shadows fall down-right.
 *
 * Dual-grid autotiling: an art tile's four CORNERS sit on four cell centres.
 * Each corner carries
 *   t   — the cell's ground terrain (for road/building cells: the nearest
 *         ground terrain, i.e. what would be there without the road/building),
 *   r   — the nearest raised terrain (building/tower/Starbucks/glass),
 *   sdR — signed distance to the nearest road edge, in cells (<0 on asphalt),
 *   sdB — signed distance to the nearest building edge, in cells (<0 inside),
 *   fl  — the stair/escalator flight the cell belongs to (or null).
 * Signed distances interpolate exactly, so kerbs and rooflines follow the
 * real OpenStreetMap lines at any angle; ground terrains blend by bilinear
 * corner weight (organic lawn edges). Cell centres always keep the class the
 * game collides with.
 */

export const TILE = 32

/** Art terrains (visual only; collision stays on the gameplay ground layer). */
export const A = {
  GRASS: 0, GRASS_MED: 1, PATH: 2, PLAZA: 3, SIDEWALK: 4, ROAD: 5, BUILDING: 6, TOWER: 7,
  WATER: 8, STEPS: 9, ESCALATOR: 10, PLAYGROUND: 11, STARBUCKS: 12, GLASS: 13, CITY: 14, MEDIAN: 15,
}

// prio: saddle resolver between ground terrains; h: height for bevels/short shadows; soft: organic edge amount
const PROPS = [
  { prio: 1.0, h: 1, soft: 3.2 }, // GRASS
  { prio: 1.0, h: 1, soft: 3.2 }, // GRASS_MED
  { prio: 1.08, h: 1, soft: 0.6 }, // PATH
  { prio: 1.06, h: 1, soft: 0 }, // PLAZA
  { prio: 1.1, h: 1.25, soft: 0 }, // SIDEWALK
  { prio: 1.0, h: 0, soft: 0 }, // ROAD
  { prio: 1.0, h: 3, soft: 0 }, // BUILDING
  { prio: 1.0, h: 5, soft: 0 }, // TOWER
  { prio: 1.12, h: 0.4, soft: 0 }, // WATER
  { prio: 1.1, h: 1, soft: 0 }, // STEPS
  { prio: 1.12, h: 1, soft: 0 }, // ESCALATOR
  { prio: 1.05, h: 1.05, soft: 0 }, // PLAYGROUND
  { prio: 1.0, h: 3, soft: 0 }, // STARBUCKS
  { prio: 1.0, h: 4, soft: 0 }, // GLASS
  { prio: 1.08, h: 1.25, soft: 0 }, // CITY pavement
  { prio: 1.0, h: 1.25, soft: 0 }, // MEDIAN (kerbed grass strip)
]
const GREEN = new Set([A.GRASS, A.GRASS_MED, A.MEDIAN])
const PAVED = new Set([A.PATH, A.PLAZA, A.SIDEWALK, A.CITY, A.STEPS, A.PLAYGROUND, A.ESCALATOR])
/** Terrains whose texture runs over 64 px (needs the tile's phase); the rest repeat every 32 px. */
const PHASED = new Set([A.GRASS, A.GRASS_MED, A.WATER])
export const needsPhase = (t) => PHASED.has(t)

// ─────────────────────────────────────────
// noise
// ─────────────────────────────────────────

export function hash(x, y, s = 0) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}
const wrap = (v, p) => ((v % p) + p) % p
/** Smooth value noise, periodic over `period` px (cell must divide it). */
export function pnoise(u, v, cell, s = 0, period = 64) {
  const per = period / cell, fx = u / cell, fy = v / cell
  const x0 = Math.floor(fx), y0 = Math.floor(fy)
  const sx = (fx - x0) ** 2 * (3 - 2 * (fx - x0)), sy = (fy - y0) ** 2 * (3 - 2 * (fy - y0))
  const h = (x, y) => hash(wrap(x, per), wrap(y, per), s * 31 + cell)
  const top = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * sx
  const bot = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * sx
  return top + (bot - top) * sy
}
const fbm64 = (u, v, s) => 0.45 * pnoise(u, v, 32, s) + 0.3 * pnoise(u, v, 16, s + 1) + 0.15 * pnoise(u, v, 8, s + 2) + 0.1 * pnoise(u, v, 4, s + 3)
const fbm32 = (u, v, s) => 0.55 * pnoise(u, v, 16, s, 32) + 0.3 * pnoise(u, v, 8, s + 1, 32) + 0.15 * pnoise(u, v, 4, s + 2, 32)
const px = (u, v, s, period = 64) => hash(wrap(Math.floor(u), period), wrap(Math.floor(v), period), s)

const clamp = (x) => (x < 0 ? 0 : x > 255 ? 255 : Math.round(x))
const shade = (c, d) => [c[0] + d, c[1] + d, c[2] + d]
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

// ─────────────────────────────────────────
// textures. (U, V): texture coords (64-periodic for PHASED terrains, else
// tile-local); (u, v): coords inside the tile for sparse per-tile features.
// `variant` only adds sparse features inside one tile, never changes the
// continuous fields, so neighbouring tiles always join.
// ─────────────────────────────────────────

function grass(base, U, V, variant) {
  let c = shade(base, (fbm64(U, V, 100) - 0.5) * 16)
  const r = px(U, V, 103)
  if (r < 0.1) c = shade(c, -18) // blade shadows
  else if (r < 0.15) c = mix(c, [168, 205, 110], 0.4) // sunlit tips
  if (px(U, V - 1, 103) < 0.1 && r >= 0.1) c = shade(c, -7) // blades are 2 px tall
  if (variant === 5 && px(U, V, 108) < 0.012) c = px(U, V, 109) < 0.5 ? [240, 228, 120] : [244, 236, 236] // a few daisies
  if (variant === 4 && px(U, V, 110) < 0.05) c = mix(c, [150, 140, 84], 0.5) // dry patch
  return c
}

/** Running-bond pavers (w x h stones), 32-periodic. */
function pavers(u, v, w, h, base, joint, s, wear) {
  const row = Math.floor(v / h)
  const off = row % 2 ? w / 2 : 0
  const col = Math.floor(wrap(u + off, TILE) / w)
  const lu = wrap(u + off, TILE) % w, lv = v % h
  if (lu === 0 || lv === 0) return joint
  let c = shade(base, (hash(wrap(col, TILE / w), wrap(row, TILE / h), s) - 0.5) * 12)
  if (lv === 1 || lu === 1) c = shade(c, 9) // lit NW lip of each stone
  if (lv === h - 1 || lu === w - 1) c = shade(c, -7)
  c = shade(c, (px(u, v, s + 5, 32) - 0.5) * 7)
  if (wear) c = shade(c, (fbm32(u, v, s + 9) - 0.45) * wear) // foot polish / grime
  return c
}

function asphalt(u, v, variant) {
  let c = shade([68, 69, 73], (fbm32(u, v, 300) - 0.5) * 8)
  const r = px(u, v, 301, 32)
  if (r < 0.06) c = shade(c, 14) // aggregate
  else if (r < 0.12) c = shade(c, -9)
  if (variant === 1 && Math.hypot(u - 19, v - 12) < 4 + pnoise(u, v, 4, 302, 32) * 3) c = mix(c, [44, 42, 42], 0.35) // oil drip
  if (variant === 2 && u > 6 && u < 26 && v > 8 && v < 20) c = shade(c, -5 + (px(u, v, 303, 32) - 0.5) * 6) // patched repair
  if (variant === 3) {
    const cy = 16 + Math.round(Math.sin(u * 0.35) * 3 + pnoise(u, v, 8, 304, 32) * 4 - 2)
    if (v === cy && u > 3 && u < 29) c = shade(c, -16) // hairline crack
  }
  return c
}

function water(U, V) {
  const k = (2 * Math.PI) / 64
  const w = Math.sin(k * 2 * (U + V) + pnoise(U, V, 16, 410) * 4) * 0.6 + (fbm64(U, V, 420) - 0.5) * 0.8
  let c = mix([48, 114, 158], [66, 140, 180], Math.max(0, Math.min(1, (w + 1) / 2)))
  if (w > 0.72) c = mix(c, [176, 216, 232], 0.45) // ripple crests, lit from the NW
  if (px(U, V, 400) < 0.003) c = [235, 248, 250] // sparkles
  return c
}

function roof(u, v, variant, base, panel) {
  let c = shade(base, (fbm32(u, v, 500) - 0.5) * 8 + (px(u, v, 501, 32) - 0.5) * 6)
  if (v % panel === 0) c = shade(c, -12)
  if (v % panel === 1) c = shade(c, 6)
  if (variant === 2 && hash(u >> 5, v >> 5, 507) < 0.35) {
    // occasional rooftop unit: lit NW faces, shadow SE
    if (u >= 9 && u < 21 && v >= 9 && v < 19) c = u === 9 || v === 9 ? [200, 200, 204] : u === 20 || v === 18 ? [110, 112, 118] : [168, 170, 176]
    else if (u >= 21 && u < 24 && v >= 11 && v < 21) c = shade(c, -26)
    else if (v >= 19 && v < 22 && u >= 11 && u < 24) c = shade(c, -26)
  }
  return c
}

function playground(u, v) {
  let c = shade([188, 98, 74], (fbm32(u, v, 600) - 0.5) * 10)
  const r = px(u, v, 601, 32)
  if (r < 0.14) c = shade(c, 26)
  else if (r < 0.24) c = shade(c, -20)
  else if (r < 0.27) c = [92, 150, 102]
  else if (r < 0.29) c = [230, 200, 90]
  return c
}

/**
 * Flight geometry at world pixel (wx, wy): treads run across `down` at any
 * angle; depth 0 (top) .. 1 (bottom).
 */
function flightAt(fl, wx, wy) {
  const dx = wx - fl.top[0], dy = wy - fl.top[1]
  return { along: dx * fl.down[0] + dy * fl.down[1], across: -dx * fl.down[1] + dy * fl.down[0], depth: Math.max(0, Math.min(1, (dx * fl.down[0] + dy * fl.down[1]) / fl.len)) }
}

function steps(fl, wx, wy) {
  const g = flightAt(fl, wx, wy)
  const k = wrap(Math.floor(g.along), 10)
  let c = shade([198, 192, 178], (hash(Math.floor(wx / 2), Math.floor(wy / 2), 700) - 0.5) * 6)
  if (k <= 1) c = [228, 222, 208] // nosing catches the light
  else if (k >= 8) c = k === 9 ? [112, 106, 98] : [146, 140, 130] // riser drop on the downhill side
  return shade(c, fl.flat ? -12 : -g.depth * 60)
}

function escalator(fl, wx, wy) {
  const g = flightAt(fl, wx, wy)
  let c = wrap(Math.floor(g.across), 2) ? [150, 154, 162] : [118, 122, 130]
  if (wrap(Math.floor(g.along), 16) === 0) c = [176, 180, 188] // comb plates
  // the underpass mouth: the lower third falls away into the dark
  const dark = g.depth < 0.6 ? g.depth * 60 : 36 + (g.depth - 0.6) * 280
  return shade(c, -Math.min(140, dark))
}

/** Colour of terrain t. ctx: { variant, phase: [px, py], fl, wx, wy }. */
export function texel(t, u, v, ctx) {
  const vr = ctx.variant ?? 0
  const U = u + TILE * (ctx.phase?.[0] ?? 0), V = v + TILE * (ctx.phase?.[1] ?? 0)
  switch (t) {
    case A.GRASS: return grass([110, 168, 70], U, V, vr)
    case A.GRASS_MED: return grass([92, 150, 62], U, V, vr)
    case A.MEDIAN: return shade(grass([96, 152, 64], u, v, 0), 0)
    case A.PATH: return pavers(u, v, 16, 8, [198, 190, 172], [156, 148, 132], 200, 14)
    case A.PLAZA: return pavers(u, v, 16, 16, [210, 204, 190], [174, 168, 154], 210, 8)
    case A.SIDEWALK: return pavers(u, v, 16, 16, [178, 176, 170], [146, 144, 138], 220, 10)
    case A.CITY: return pavers(u, v, 8, 8, [170, 168, 162], [144, 142, 136], 230, 6)
    case A.ROAD: return asphalt(u, v, vr)
    case A.WATER: return water(U, V)
    case A.BUILDING: return roof(u, v, vr, [156, 150, 142], 8)
    case A.TOWER: return roof(u, v, vr, [136, 142, 154], 16)
    case A.STARBUCKS: return roof(u, v, vr, [46, 104, 80], 8)
    case A.GLASS: {
      // glazed mall canopy seen from above: blue-grey panes in a 16 px mullion grid, a soft sky sheen
      if (u % 16 === 0 || v % 16 === 0) return [70, 80, 90]
      const sheen = (pnoise(u, v, 16, 520, 32) - 0.5) * 30 + (wrap(u - v, 32) < 3 ? 22 : 0)
      return shade([104, 132, 150], sheen)
    }
    case A.STEPS: return ctx.fl ? steps(ctx.fl, ctx.wx, ctx.wy) : pavers(u, v, 32, 8, [196, 190, 176], [118, 112, 104], 240, 0)
    case A.ESCALATOR: return ctx.fl ? escalator(ctx.fl, ctx.wx, ctx.wy) : [130, 134, 140]
    case A.PLAYGROUND: return playground(u, v)
    default: return [255, 0, 255]
  }
}

// ─────────────────────────────────────────
// dual-grid tile painter
// ─────────────────────────────────────────

const LIGHT = [-Math.SQRT1_2, -Math.SQRT1_2] // direction towards the light (up-left)
const family = (t) => (t === A.GRASS || t === A.GRASS_MED ? -1 : t)
const famSoft = (f) => (f === -1 ? PROPS[A.GRASS].soft : PROPS[f].soft)

/**
 * Paint one art tile. corners = [TL, TR, BL, BR] (see header).
 * opts: { variant, phase: [x, y] tile parity, origin: [x, y] world px of the
 * tile's top-left (only needed for stair/escalator flights) }.
 * Returns RGBA Uint8Array(32*32*4), fully opaque.
 */
export function paintTile(corners, { variant = 0, phase = [0, 0], origin = [0, 0] } = {}) {
  const out = new Uint8Array(TILE * TILE * 4)
  const ts = [...new Set(corners.map((c) => c.t))]
  const fams = [...new Set(ts.map(family))]
  const P0 = phase[0] * TILE, P1 = phase[1] * TILE
  const sdR = corners.map((c) => c.sdR ?? 1), sdB = corners.map((c) => c.sdB ?? 1), sdW = corners.map((c) => c.sdW ?? 1), sdF = corners.map((c) => c.sdF ?? 1)
  const anyRoad = sdR.some((s) => s < 1), anyBld = sdB.some((s) => s < 1), anyWater = sdW.some((s) => s < 1), anyFlight = sdF.some((s) => s < 1)
  const roadAll = sdR.every((s) => s <= -1), bldAll = sdB.every((s) => s <= -1)
  // interiors (all asphalt, all roof, or one ground terrain) may take a variant
  const uniform = !corners.some((c) => c.fl) && (roadAll || (!anyRoad && (bldAll || (!anyBld && !anyWater && !anyFlight && ts.length === 1))))
  const raisedOf = corners.map((c) => c.r ?? A.BUILDING)

  const weights = (x, y) => {
    const fx = x / TILE, fy = y / TILE
    return [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy]
  }
  // bilinear value and gradient (per px) of a corner field
  const field = (vals, x, y) => {
    const fx = x / TILE, fy = y / TILE
    const val = vals[0] * (1 - fx) * (1 - fy) + vals[1] * fx * (1 - fy) + vals[2] * (1 - fx) * fy + vals[3] * fx * fy
    const gx = ((vals[1] - vals[0]) * (1 - fy) + (vals[3] - vals[2]) * fy) / TILE
    const gy = ((vals[2] - vals[0]) * (1 - fx) + (vals[3] - vals[1]) * fx) / TILE
    return [val, gx, gy]
  }
  const score = (t, x, y) => {
    const w = weights(x, y)
    let s = 0
    for (let k = 0; k < 4; k++) if (corners[k].t === t) s += w[k]
    return s * PROPS[t].prio
  }
  const famScore = (f, x, y) => {
    let s = 0
    for (const t of ts) if (family(t) === f) s += score(t, x, y)
    return s
  }
  const n = (id, x, y) => (pnoise(x + P0, y + P1, 8, 40 + id) - 0.5) * 0.09 + (pnoise(x + P0, y + P1, 4, 60 + id) - 0.5) * 0.04
  // organic wobble only where BOTH sides are soft (lawn/lawn, lawn/path); hard edges stay crisp
  const famJitter = (a, b, x, y) => {
    const amp = Math.min(famSoft(a), famSoft(b))
    return amp ? amp * (n(a + 2, x, y) - n(b + 2, x, y)) : 0
  }
  const nearest = (vals, x, y) => {
    const w = weights(x, y)
    let best = 0
    for (let k = 1; k < 4; k++) if (w[k] > w[best]) best = k
    return vals[best]
  }
  const flAt = (x, y) => {
    const w = weights(x, y)
    let best = null, bw = -1
    for (let k = 0; k < 4; k++) if (corners[k].fl && w[k] > bw) { bw = w[k]; best = corners[k].fl }
    return best
  }

  for (let v = 0; v < TILE; v++)
    for (let u = 0; u < TILE; u++) {
      const x = u + 0.5, y = v + 0.5
      const wx = origin[0] + x, wy = origin[1] + y
      const ctx = { variant: uniform ? variant : 0, phase, fl: flAt(x, y), wx, wy }
      const r = px(u + P0, v + P1, 900)
      let c

      const [vR, gRx, gRy] = anyRoad ? field(sdR, x, y) : [1, 0, 0]
      const [vB, gBx, gBy] = anyBld ? field(sdB, x, y) : [1, 0, 0]
      const [vW, gWx, gWy] = anyWater ? field(sdW, x, y) : [1, 0, 0]
      const [vF] = anyFlight ? field(sdF, x, y) : [1]
      const dR = vR * TILE, dB = vB * TILE, dW = vW * TILE, dF = vF * TILE // px; <0 inside

      if (dR < 0) {
        // asphalt, with a gutter along the kerb
        c = texel(A.ROAD, u, v, ctx)
        if (dR > -1.5) c = [44, 44, 48]
        else if (dR > -3.5) c = shade(c, -8)
      } else if (dB < 0) {
        // roof, parapet lit on the NW edges and shaded on the SE ones
        const t = nearest(raisedOf, x, y)
        c = texel(t, u, v, ctx)
        const g = Math.hypot(gBx, gBy) || 1e-6
        const facing = (gBx / g) * LIGHT[0] + (gBy / g) * LIGHT[1] // outward normal vs light
        if (dB > -2) c = shade(c, facing > 0 ? 30 : -30)
        else if (dB > -3) c = shade(c, facing > 0 ? 12 : -12)
      } else if (dW < 0) {
        // pool: the NW inner wall shades the water, the far wall is lit
        c = texel(A.WATER, u, v, ctx)
        const g = Math.hypot(gWx, gWy) || 1e-6
        const facing = (gWx / g) * LIGHT[0] + (gWy / g) * LIGHT[1]
        if (dW > -4 && facing > 0) c = shade(c, -34 - dW * 6)
        else if (dW > -2 && facing <= 0) c = shade(c, 18)
      } else if (dF < 0 && ctx.fl) {
        // stairs / escalator, with cheek walls along the sides
        const flKind = corners.reduce((best, c, k) => (c.fl && weights(x, y)[k] > best[1] ? [c.flKind ?? A.STEPS, weights(x, y)[k]] : best), [A.STEPS, -1])[0]
        c = texel(flKind, u, v, ctx)
        if (dF > -2) c = flKind === A.ESCALATOR ? [34, 34, 40] : shade([170, 164, 152], dF > -1 ? -24 : 0)
      } else {
        // ground terrains
        let f1 = fams[0], f2 = null
        if (fams.length > 1) {
          let s1 = -Infinity, s2 = -Infinity
          for (const f of fams) {
            const s = famScore(f, x, y)
            if (s > s1) { s2 = s1; f2 = f1; s1 = s; f1 = f } else if (s > s2) { s2 = s; f2 = f }
          }
          if (s1 - s2 + famJitter(f1, f2, x, y) < 0) [f1, f2] = [f2, f1]
        }
        const pickIn = (f) => {
          if (f !== -1) return f
          const g = ts.includes(A.GRASS), m = ts.includes(A.GRASS_MED)
          if (!(g && m)) return g ? A.GRASS : A.GRASS_MED
          return score(A.GRASS, x, y) - score(A.GRASS_MED, x, y) + 6 * (n(0, x, y) - n(1, x, y)) >= 0 ? A.GRASS : A.GRASS_MED
        }
        const t1 = pickIn(f1)
        c = texel(t1, u, v, ctx)
        if (f2 !== null && f2 !== f1) {
          const e = 0.5
          const D = (xx, yy) => famScore(f1, xx, yy) - famScore(f2, xx, yy) + famJitter(f1, f2, xx, yy)
          const gx = (D(x + e, y) - D(x - e, y)) / (2 * e), gy = (D(x, y + e) - D(x, y - e)) / (2 * e)
          const g = Math.hypot(gx, gy) || 1e-6
          const facing = (-gx / g) * LIGHT[0] + (-gy / g) * LIGHT[1] // >0: this edge of t1 faces the light
          c = edge(c, t1, pickIn(f2), D(x, y) / g, facing, u + P0, v + P1)
        }
        // stone coping round pools, kerb against the road
        if (dW < 4) c = dW < 1 ? [190, 184, 172] : dW < 3 ? shade([236, 232, 222], (r - 0.5) * 6) : [150, 144, 132]
        else if (dR < 3) {
          const g = Math.hypot(gRx, gRy) || 1e-6
          const towardRoadLit = (-gRx / g) * LIGHT[0] + (-gRy / g) * LIGHT[1] // kerb face points at the road
          c = dR < 1 ? (towardRoadLit > 0.2 ? [226, 224, 218] : [150, 148, 144]) : shade([206, 204, 198], (r - 0.5) * 8)
        } else if (dB < 9) {
          // building foot: dark plinth, short contact shadow on the lee (SE) side
          const g = Math.hypot(gBx, gBy) || 1e-6
          const lee = (-gBx / g) * LIGHT[0] + (-gBy / g) * LIGHT[1] // >0: the building lies towards the light
          const ht = PROPS[nearest(raisedOf, x, y)].h
          if (dB < 1.5) c = [84, 82, 90]
          else if (lee > 0.1 && dB < Math.min(9, 2 + ht * 1.4)) c = shade(c, -36)
        }
      }
      const o = (v * TILE + u) * 4
      out[o] = clamp(c[0]); out[o + 1] = clamp(c[1]); out[o + 2] = clamp(c[2]); out[o + 3] = 255
    }
  return out
}

/** Edge treatment for a ground pixel of terrain `t` at distance d (px) from ground terrain `o`. */
function edge(c, t, o, d, facing, u, v) {
  const r = px(u, v, 900 + t * 17 + o)
  // pools: stone coping on the land side, inner shadow on the lit wall
  if (o === A.WATER && t !== A.WATER) {
    if (d < 3) return shade([214, 208, 196], (d < 1 ? -10 : 0) + (r - 0.5) * 8)
    return c
  }
  if (t === A.WATER) {
    if (d < 4 && facing > 0) return shade(c, -34 + d * 6) // NW inner wall shades the water
    if (d < 2 && facing <= 0) return shade(c, 18)
    return c
  }
  // worn lawn edges against paving
  if (GREEN.has(t) && PAVED.has(o)) {
    if (d < 3.2 && r < (1 - d / 3.2) * 0.65) return r < 0.25 ? [146, 122, 86] : [150, 158, 92]
    return c
  }
  if (PAVED.has(t) && GREEN.has(o)) {
    if (d < 1.2) return r < 0.25 ? [96, 150, 62] : shade(c, -20) // edging stones, a stray tuft
    return c
  }
  if (t === A.ESCALATOR && o !== A.ESCALATOR) {
    if (d < 2) return d < 1 ? [34, 34, 40] : [70, 72, 80] // handrail
    return c
  }
  if (t === A.STEPS && o !== A.STEPS) {
    if (d < 2) return shade([170, 164, 152], d < 1 ? -24 : 0) // cheek wall
    return c
  }
  if (t === A.PLAYGROUND && o !== A.PLAYGROUND) {
    if (d < 2) return shade([124, 116, 108], (r - 0.5) * 8) // rubber kerb
    return c
  }
  if (PAVED.has(t) && PAVED.has(o)) {
    if (d < 1) return shade(c, -14)
    return c
  }
  return c
}

/** Soft shade tile from corner coverage [TL, TR, BL, BR] in 0..1. RGBA, translucent. */
export function paintShadeTile(flags, phase = [0, 0], alpha = 0.32) {
  const out = new Uint8Array(TILE * TILE * 4)
  const P0 = phase[0] * TILE, P1 = phase[1] * TILE
  for (let v = 0; v < TILE; v++)
    for (let u = 0; u < TILE; u++) {
      const fx = (u + 0.5) / TILE, fy = (v + 0.5) / TILE
      const w = flags[0] * (1 - fx) * (1 - fy) + flags[1] * fx * (1 - fy) + flags[2] * (1 - fx) * fy + flags[3] * fx * fy
      const jit = (pnoise(u + P0, v + P1, 16, 77) - 0.5) * 0.3 + (pnoise(u + P0, v + P1, 8, 78) - 0.5) * 0.14
      const a = Math.max(0, Math.min(1, (w + jit - 0.45) * 3.2 + 0.5))
      const o = (v * TILE + u) * 4
      out[o] = 14; out[o + 1] = 22; out[o + 2] = 40; out[o + 3] = Math.round(a * alpha * 255)
    }
  return out
}

/**
 * Overhead roof tile (shelters): transparent outside the roof outline; a
 * pyramid roof whose facets are lit by their slope towards the NW light.
 * corners: signed distance (cells) to the roof outline; roof: { ring (px),
 * base colour }; origin: tile top-left in world px.
 */
export function paintRoofTile(sd, roof, origin) {
  const out = new Uint8Array(TILE * TILE * 4)
  const ring = roof.ring
  for (let v = 0; v < TILE; v++)
    for (let u = 0; u < TILE; u++) {
      const fx = (u + 0.5) / TILE, fy = (v + 0.5) / TILE
      const d = (sd[0] * (1 - fx) * (1 - fy) + sd[1] * fx * (1 - fy) + sd[2] * (1 - fx) * fy + sd[3] * fx * fy) * TILE
      if (d >= 0) continue
      const wx = origin[0] + u + 0.5, wy = origin[1] + v + 0.5
      // facet = nearest outline edge; its outward normal sets the light
      let best = Infinity, nx = 0, ny = 0
      for (let k = 0; k < ring.length; k++) {
        const [ax, ay] = ring[k], [bx, by] = ring[(k + 1) % ring.length]
        const ex = bx - ax, ey = by - ay, len = Math.hypot(ex, ey) || 1
        const dist = Math.abs((wx - ax) * ey - (wy - ay) * ex) / len
        if (dist < best) { best = dist; nx = ey / len; ny = -ex / len }
      }
      // make the normal point outwards (away from the centroid)
      const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length, cy = ring.reduce((a, p) => a + p[1], 0) / ring.length
      if ((wx - cx) * nx + (wy - cy) * ny < 0) { nx = -nx; ny = -ny }
      const lit = nx * LIGHT[0] + ny * LIGHT[1]
      let c = shade(roof.base, lit * 34)
      if (wrap(Math.floor(best), 6) === 0) c = shade(c, -16) // shingle courses parallel to the eaves
      if (hash(Math.floor(wx), Math.floor(wy), 950) < 0.08) c = shade(c, -10)
      if (d > -2.5) c = shade(c, lit > 0 ? 26 : -36) // eaves
      const o = (v * TILE + u) * 4
      out[o] = clamp(c[0]); out[o + 1] = clamp(c[1]); out[o + 2] = clamp(c[2]); out[o + 3] = 255
    }
  return out
}

// ─────────────────────────────────────────
// decals: one-off landmarks painted over the baked ground (world px)
// ─────────────────────────────────────────

/** Monument on a stepped granite plinth (rect = [x0, y0, x1, y1]); style 'figure' or 'rider'. */
export function monumentDecal(rect, style) {
  const [x0, y0, x1, y1] = rect
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - 2
  const statue = (dx, dy) =>
    style === 'rider'
      ? (dx / 15) ** 2 + (dy / 6.5) ** 2 < 1 || // horse
        (Math.abs(dx + 13) < 3.5 && Math.abs(dy) < 2.5) || // head and neck
        ((dx - 2) / 5) ** 2 + ((dy + 1) / 5) ** 2 < 1 || // rider
        (Math.abs(dx - 2) < 1.5 && dy > -14 && dy < -2) // raised bolo
      : (dx / 9) ** 2 + (dy / 6) ** 2 < 1 || (dx / 4.2) ** 2 + ((dy + 1) / 4.2) ** 2 < 1 || (Math.abs(dx - 8) < 1.6 && dy > -11 && dy < 0) // shoulders, head, raised arm
  return {
    bbox: [x0 - 2, y0 - 2, x1 + 12, y1 + 12],
    paint(wx, wy, c) {
      const ring = Math.min(wx - x0, wy - y0, x1 - 1 - wx, y1 - 1 - wy) // px in from the plinth edge
      if (ring < 1) {
        // cast shadow of plinth and statue, down-right
        if (wx >= x0 + 8 && wx < x1 + 10 && wy >= y0 + 8 && wy < y1 + 10) return shade(c, -44)
        return null
      }
      const n = (hash(Math.floor(wx), Math.floor(wy), 960) - 0.5) * 10
      // two granite steps and the die, each with a lit NW lip and a dark SE lip
      const tier = ring < 6 ? 0 : ring < 11 ? 1 : 2
      const inner = [x0 + [1, 6, 11][tier], y0 + [1, 6, 11][tier], x1 - 1 - [1, 6, 11][tier], y1 - 1 - [1, 6, 11][tier]]
      let p = shade([[176, 170, 160], [156, 150, 142], [132, 126, 120]][tier], n)
      if (wx < inner[0] + 1.5 || wy < inner[1] + 1.5) p = shade(p, 28)
      else if (wx > inner[2] - 1.5 || wy > inner[3] - 1.5) p = shade(p, -30)
      if (tier === 1 && wy > y1 - 9 && Math.abs(wx - (x0 + x1) / 2) < 9) p = [182, 146, 78] // bronze plaque
      const dx = wx - cx, dy = wy - cy
      if (statue(dx, dy)) {
        const lit = -(dx + dy) / 18
        p = shade([88, 66, 44], lit * 46 + n) // bronze, lit from the NW
        if (lit > 0.5) p = [186, 152, 98]
        if (!statue(dx - 1, dy - 1)) p = [206, 176, 120] // NW rim highlight
      } else if (statue(dx - 4, dy - 4)) p = shade(p, -38) // statue's shadow on the die
      return p
    },
  }
}

/** McMicking water curtain: a stone wall with a sheet of falling water on its pool side. */
export function curtainDecal(rect) {
  const [x0, y0, x1, y1] = rect
  return {
    bbox: [x0, y0, x1, y1 + 6],
    paint(wx, wy, c) {
      if (wx < x0 || wx >= x1) return null
      if (wy >= y0 && wy < y0 + 6) return wy < y0 + 2 ? [214, 208, 198] : [150, 144, 136] // wall top, lit lip
      if (wy >= y0 + 6 && wy < y1) return hash(Math.floor(wx), Math.floor(wy / 2), 970) < 0.55 ? [214, 236, 244] : [150, 196, 220] // falling sheet
      if (wy >= y1 && wy < y1 + 6) return hash(Math.floor(wx), Math.floor(wy), 971) < 0.5 - (wy - y1) / 14 ? [236, 246, 250] : null // foam
      return null
    },
  }
}

/**
 * Underpass mouth: where a flight runs into the tunnel, a concrete lintel
 * across the stairs and the dark opening beyond. axis = unit vector pointing
 * down the flight (into the tunnel), at = world px of the lintel's centre,
 * half = half-width (px) across the flight, depth = px of darkness beyond.
 */
export function tunnelMouthDecal(at, axis, half, depth) {
  const [ax, ay] = axis
  const r = half + depth + 8
  return {
    bbox: [at[0] - r, at[1] - r, at[0] + r, at[1] + r],
    paint(wx, wy, c) {
      const dx = wx - at[0], dy = wy - at[1]
      const along = dx * ax + dy * ay, across = -dx * ay + dy * ax
      if (Math.abs(across) > half + 3 || along < -5 || along > depth) return null
      if (Math.abs(across) > half) return along < 0 ? null : [92, 90, 96] // side walls
      if (along < 0) return along < -3 ? [222, 218, 210] : [176, 172, 166] // lintel, lit edge first
      const k = Math.min(1, along / depth)
      return mix(shade(c, -70), [10, 10, 16], 0.55 + 0.45 * k)
    },
  }
}
