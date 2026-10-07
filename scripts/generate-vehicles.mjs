/**
 * Generates public/assets/sprites/vehicles.png + vehicles.json: a Phaser 3
 * JSON-hash atlas of top-down traffic sprites for TrafficSystem and the story
 * drop-off cars (GameScene intro, ColonyDynamicsSystem dumping events).
 *
 * Pixel art at the map's real scale (16 px per metre), viewed straight down
 * with the nose pointing EAST (+x), so a sprite's rotation is simply its
 * heading. Shading is symmetric about the long axis (no baked light
 * direction) because the sprites rotate; the game adds a world-fixed drop
 * shadow at runtime. Models: sedan, hatchback, SUV, taxi, jeepney, P2P/city
 * bus and motorbike with rider, in several baked colours each, plus the story
 * cars (`story_suv*`, `story_corolla`). No randomness: output is identical on
 * every run. Never hand-edit the outputs.
 *
 * Run: node scripts/generate-vehicles.mjs
 */

import { PNG } from 'pngjs'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'assets', 'sprites')
mkdirSync(outDir, { recursive: true })

const PX_PER_M = 16
const ATLAS_MAX_W = 512
const PAD = 2

// ──────────── colour helpers ────────────

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255]
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const INK = [10, 11, 16]
const darker = (c, t) => mix(c, INK, t)
const lighter = (c, t) => mix(c, [255, 255, 255], t)

const GLASS = hex(0x26323f)
const GLASS_DARK = hex(0x18202a)
const GLASS_HI = hex(0x5d7890)
const GLASS_MID = hex(0x34465a)
const RAIL = hex(0x2e3136)
const RAIL_DARK = hex(0x1c1d21)
const TYRE = hex(0x18191c)
const HEAD = hex(0xfff2b8)
const HEAD_HOT = hex(0xfffbe6)
const TAIL = hex(0xd8352f)
const TAIL_DARK = hex(0x8e1f1c)
const CHROME = hex(0xd5dbe1)
const CHROME_DARK = hex(0x8d969f)

/** Outline for a body colour: a deep shade of it, so white cars get grey edges and red ones dark red. */
const outlineOf = (c) => darker(c, 0.72)

// ──────────── canvas ────────────

class Canvas {
  constructor(w, h) {
    this.w = w
    this.h = h
    this.px = new Array(w * h).fill(null)
    /** Edge distance of the centre row(s). */
    this.emax = Math.floor((h - 1) / 2)
  }
  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h
  }
  get(x, y) {
    return this.inside(x, y) ? this.px[y * this.w + x] : null
  }
  set(x, y, c) {
    if (this.inside(x, y)) this.px[y * this.w + x] = c ? [c[0], c[1], c[2], c[3] ?? 255] : null
  }
  /** Paint row-pair `e` (edge distance: 0 = outermost rows) at column x, mirrored about the long axis. */
  sym(x, e, c) {
    this.set(x, e, c)
    this.set(x, this.h - 1 - e, c)
  }
  symIfEmpty(x, e, c) {
    if (!this.get(x, e)) this.sym(x, e, c)
  }
}

/**
 * Inset (in rows) of a rounded corner `k` columns in from the end, for an
 * elliptical corner `rx` columns long and `ry` rows deep.
 */
function cornerInset(k, rx, ry) {
  if (k >= rx) return 0
  const t = (rx - k - 0.5) / rx
  return Math.round(ry * (1 - Math.sqrt(Math.max(0, 1 - t * t))))
}

/**
 * Body silhouette `len` columns long starting at column x0, inset `m` rows
 * from the frame edges, with rounded corners and an optional nose taper.
 * Returns the mask test (x, e) => boolean.
 */
function bodyMask(cv, { x0 = 0, len, m, rear, front, taper = null }) {
  return (x, e) => {
    const lx = x - x0
    if (lx < 0 || lx >= len) return false
    let inset = Math.max(cornerInset(lx, rear[0], rear[1]), cornerInset(len - 1 - lx, front[0], front[1]))
    if (taper) inset = Math.max(inset, taper(lx))
    return e >= m + inset && e <= cv.emax
  }
}

/** Fill a mask with paint(x, e) and draw its 1 px outline. Returns the boundary test. */
function fillWithOutline(cv, mask, paint, outline) {
  const isEdge = (x, e) => {
    if (!mask(x, e)) return false
    const y = e
    // Neighbours in frame space (e is symmetric, so test the top half only).
    const nb = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]
    return nb.some(([nx, ny]) => {
      if (nx < 0 || nx >= cv.w || ny < 0) return true
      const ne = Math.min(ny, cv.h - 1 - ny)
      return !mask(nx, ne)
    })
  }
  for (let x = 0; x < cv.w; x++) {
    for (let e = 0; e <= cv.emax; e++) {
      if (!mask(x, e)) continue
      cv.sym(x, e, isEdge(x, e) ? outline : paint(x, e))
    }
  }
  return isEdge
}

// ──────────── passenger cars (sedan / hatch / SUV / taxi) ────────────

/**
 * Body layout along the car, rear (x = 0) to nose. `glass` stations:
 * rear-glass start, roof start, windscreen start, windscreen end.
 * `insets` (rows in from the body edge): rear-glass base, roof, windscreen
 * base, so both glasses flare out from the roof like real ones seen from above.
 * `taper`: [rear, front] lengths over which the body is one row narrower.
 */
const CAR_MODELS = {
  sedan: {
    len: 72,
    width: 29,
    rear: [5, 3],
    front: [8, 4],
    taper: [7, 16],
    glass: [12, 21, 40, 52],
    insets: [2, 4, 1],
    wheels: [
      [9, 19],
      [53, 63],
    ],
    mirror: 49,
    head: [3, 7],
    tail: [2, 6],
  },
  hatch: {
    len: 64,
    width: 28,
    rear: [5, 3],
    front: [8, 4],
    taper: [5, 14],
    glass: [3, 11, 35, 47],
    insets: [2, 4, 1],
    wheels: [
      [7, 16],
      [47, 56],
    ],
    mirror: 44,
    head: [3, 7],
    tail: [2, 6],
  },
  suv: {
    len: 77,
    width: 30,
    rear: [4, 2],
    front: [6, 3],
    taper: [4, 12],
    glass: [3, 8, 47, 58],
    insets: [3, 4, 1],
    wheels: [
      [9, 21],
      [58, 70],
    ],
    mirror: 55,
    head: [2, 7],
    tail: [2, 6],
    rails: true,
  },
}

/**
 * @param model key of CAR_MODELS
 * @param o {body, roof?, sign?, stripe?, spare?}
 */
function drawCar(model, o) {
  const s = CAR_MODELS[model]
  const m = 2
  const spare = o.spare ? 3 : 0
  const cv = new Canvas(s.len + spare, s.width + 2 * m)
  const B = o.body
  const O = outlineOf(B)
  const flank = darker(B, 0.24)
  const flank2 = darker(B, 0.1)
  const shoulder = lighter(B, 0.14)
  const roofB = o.roof ?? lighter(B, 0.08)
  const roofEdge = o.roof ? lighter(o.roof, 0.06) : B
  const roofHi = o.roof ? lighter(o.roof, 0.14) : lighter(B, 0.18)
  const [g0, g1, g2, g3] = s.glass.map((v) => v + spare)
  const [inRear, inRoof, inWind] = s.insets
  const x0 = spare
  const lerp = (a, b, t) => a + (b - a) * t

  // Greenhouse (glass + roof) inset from the body edge, per column.
  const gInset = (x) => {
    if (x < g0 || x >= g3) return Infinity
    let v
    if (x < g1) v = lerp(inRear, inRoof, (x - g0) / Math.max(1, g1 - g0 - 1))
    else if (x < g2) v = inRoof
    else v = lerp(inRoof, inWind, (x - g2) / Math.max(1, g3 - g2 - 1))
    v = Math.round(v)
    if (x === g0 || x === g3 - 1) v += 1 // soften the greenhouse corners
    return v
  }

  const [tr, tf] = s.taper
  const mask = bodyMask(cv, {
    x0,
    len: s.len,
    m,
    rear: s.rear,
    front: s.front,
    taper: (lx) => (lx < tr || lx >= s.len - tf ? 1 : 0),
  })
  const paint = (x, e) => {
    const k = e - m
    const gi = gInset(x)
    if (k >= gi) {
      // Greenhouse.
      const r = k - gi // 0 = side window / glass edge row
      if (x < g1) {
        // Rear glass: dark lip against the boot, a soft reflection band.
        if (x === g0 || r === 0) return GLASS_DARK
        if (x === g0 + 2 && r >= 2) return GLASS_HI
        return GLASS
      }
      if (x >= g2) {
        // Windscreen: shadowed under the roof edge, sky reflection towards the bonnet.
        if (x === g2 || r === 0) return GLASS_DARK
        if (x >= g3 - 3 && r >= 1) return x === g3 - 1 ? GLASS_DARK : GLASS_MID
        if (x === g2 + 3 && r >= 2) return GLASS_HI
        return GLASS
      }
      // Roof between the thin side windows.
      if (r === 0) return GLASS
      if (r === 1 || x === g1 || x === g2 - 1) return roofEdge
      if (e >= cv.emax - 2) return roofHi
      return roofB
    }
    if (k === 1) return flank // flanks fall away from the top surface
    if (k === 2) return o.stripe ?? flank2
    if (k === gi - 1 && x >= g0 && x < g3) return shoulder // waistline catching the light
    return B
  }
  const edge = fillWithOutline(cv, mask, paint, O)
  const interior = (x, e) => mask(x, e) && !edge(x, e)

  // Lamps follow the rounded corners: headlights at the nose, tail lights at the rear.
  for (let e = m + s.head[0]; e < m + s.head[1]; e++) {
    let x = cv.w - 1
    while (x > 0 && !interior(x, e)) x--
    cv.sym(x, e, e > m + s.head[0] ? HEAD_HOT : HEAD)
    cv.sym(x - 1, e, HEAD)
  }
  for (let e = m + s.tail[0]; e < m + s.tail[1]; e++) {
    let x = 0
    while (x < cv.w - 1 && !interior(x, e)) x++
    cv.sym(x, e, TAIL)
    cv.sym(x + 1, e, e === m + s.tail[0] ? TAIL : TAIL_DARK)
  }

  if (s.rails) {
    // Roof rails just inside the side windows.
    for (let x = g1 + 1; x < g2 - 1; x++) cv.sym(x, m + inRoof + 1, x === g1 + 1 || x === g2 - 2 ? RAIL_DARK : RAIL)
  }

  if (o.sign) {
    // Taxi roof sign across the roof, centred.
    const cx = Math.round((g1 + g2) / 2)
    for (let x = cx - 2; x <= cx + 2; x++) {
      for (let e = cv.emax - 5; e <= cv.emax; e++) {
        const border = x === cx - 2 || x === cx + 2 || e === cv.emax - 5
        cv.sym(x, e, border ? hex(0x3b2f12) : x === cx + 1 ? hex(0xfff3a6) : hex(0xf4c430))
      }
    }
  }

  // Tyres just peeking out under the flanks.
  for (const [a, b] of s.wheels) {
    for (let x = a + x0 + 1; x < b + x0 - 1; x++) cv.symIfEmpty(x, m - 1, TYRE)
  }

  // Side mirrors at the base of the A-pillars.
  const mx = s.mirror + x0
  for (const [dx, e, c] of [
    [0, m - 1, B],
    [1, m - 1, B],
    [0, m - 2, O],
    [1, m - 2, flank],
    [-1, m - 1, O],
  ])
    cv.symIfEmpty(mx + dx, e, c)

  if (o.spare) {
    // Tailgate spare wheel (the story SUV's Jimny-style rear), centred on the axis.
    for (let x = 0; x <= spare; x++) {
      for (let e = cv.emax - 5; e <= cv.emax; e++) {
        if (x === 0 && e < cv.emax - 3) continue
        if (cv.get(x, e) && x === spare) continue
        const hub = e >= cv.emax - 1 && x >= 1
        cv.sym(x, e, hub ? hex(0x6b7178) : TYRE)
      }
    }
  }
  return cv
}

// ──────────── jeepney ────────────

/**
 * Philippine jeepney, 6.5 x 2.0 m: chrome rear step with the open entrance,
 * long striped roof with stainless rails and a luggage rack, split
 * windscreen under a chrome visor, narrow bonnet with chrome horses between
 * separate front fenders, wide chrome bumper.
 */
function drawJeepney({ body, bands, roof }) {
  const len = 104
  const width = 32
  const m = 2
  const cv = new Canvas(len, width + 2 * m)
  const em = cv.emax
  const O = outlineOf(body)
  const DOOR = hex(0x2b2629)
  const xRoofEnd = 82 // windscreen starts here
  const xWindEnd = 87
  const fender = [88, 100]
  const xHoodEnd = 101
  const bandW = bands.reduce((sum, [w]) => sum + w, 0)
  const rackE = m + 3 + bandW + 1

  const mask = (x, e) => {
    if (x < 0 || x >= len) return false
    if (x < 3) return e >= m + 3 + (x === 0 ? 1 : 0) // rear step, narrower than the body
    if (x < xWindEnd) return e >= m + cornerInset(x - 3, 3, 2) + (x >= xRoofEnd ? 1 : 0)
    if (x < xHoodEnd) {
      if (e >= m + 5 + cornerInset(xHoodEnd - 1 - x, 2, 1)) return true // bonnet
      if (x < fender[0] || x >= fender[1] || e > m + 3) return false
      return e >= m + Math.max(cornerInset(x - fender[0], 3, 2), cornerInset(fender[1] - 1 - x, 3, 2))
    }
    return e >= m + 1 + (x === len - 1 ? 1 : 0) // chrome bumper
  }
  const paint = (x, e) => {
    const k = e - m
    if (x < 3) return e >= em - 4 && x >= 1 ? DOOR : x === 2 ? CHROME_DARK : CHROME
    if (x < xRoofEnd) {
      if (k === 1) return CHROME // stainless rail
      if (k === 2) return x === xRoofEnd - 1 ? hex(0xf59f00) : darker(body, 0.15) // amber marker at the front
      if (x <= 4 && e >= em - 4) return DOOR // open rear entrance
      if (x >= 8 && x <= 44 && e >= rackE) {
        // Luggage rack: side bars plus crossbars.
        if (e === rackE || (x - 8) % 6 === 0) return CHROME_DARK
      }
      let r = k - 3
      for (const [w, c] of bands) {
        if (r < w) return c
        r -= w
      }
      return e >= em - 1 && x > 46 ? lighter(roof, 0.12) : roof
    }
    if (x < xWindEnd) {
      if (x === xRoofEnd) return CHROME // visor
      if (k <= 1 || e >= em) return body // pillars and the centre divider
      if (x === xRoofEnd + 2 && k >= 3) return GLASS_HI
      return x === xRoofEnd + 1 ? GLASS_DARK : GLASS
    }
    if (x < xHoodEnd) {
      if (k <= 3) return k === 1 ? darker(body, 0.2) : lighter(body, 0.06) // fender
      if (x >= xHoodEnd - 4 && x <= xHoodEnd - 3 && e === em - 3) return CHROME // the horses
      if (e >= em && x > xWindEnd + 4) return CHROME // bonnet centre trim
      return k === 5 ? darker(body, 0.1) : lighter(body, 0.08)
    }
    return x === len - 1 ? CHROME_DARK : CHROME
  }
  const edge = fillWithOutline(cv, mask, paint, O)
  // Headlights on the fender tips, tail lights at the rear corners.
  for (const [x, e, c] of [
    [fender[1] - 2, m + 2, HEAD_HOT],
    [fender[1] - 3, m + 2, HEAD],
    [3, m + 2, TAIL],
    [3, m + 3, TAIL],
    [4, m + 2, TAIL_DARK],
  ]) {
    if (!edge(x, e)) cv.sym(x, e, c)
  }
  // Chrome mirrors on the fenders; tyres peeking out.
  for (const [x, e, c] of [
    [90, m - 1, CHROME_DARK],
    [90, m - 2, CHROME],
    [91, m - 2, CHROME],
  ])
    cv.symIfEmpty(x, e, c)
  for (const [x0, x1] of [
    [17, 28],
    [89, 99],
  ]) {
    for (let x = x0; x < x1; x++) cv.symIfEmpty(x, m - 1, TYRE)
  }
  return cv
}

// ──────────── bus ────────────

/**
 * 12 x 2.5 m P2P / city bus: white roof with a livery band, thin side-window
 * strips, roof hatches, a rooftop AC unit, a wide windscreen and mirrors on
 * stalks at the front corners.
 */
function drawBus({ side, band, roof }) {
  const len = 192
  const width = 40
  const m = 2
  const cv = new Canvas(len, width + 2 * m)
  const em = cv.emax
  const O = outlineOf(side)
  const mask = bodyMask(cv, { len, m, rear: [3, 2], front: [4, 3] })
  const xWind = 181
  const ac = [116, 152]
  const paint = (x, e) => {
    const k = e - m
    if (x >= xWind) {
      if (k <= 1 || x >= len - 2) return side
      if (x === xWind) return GLASS_DARK
      if (x === xWind + 3 && k >= 3) return GLASS_HI
      return GLASS
    }
    if (x <= 3) {
      if (k >= 5 && x >= 2) return GLASS // rear window
      return side
    }
    if (k === 1) return side
    if (k === 2) return x > 8 && x < xWind - 4 ? GLASS : side // side windows seen past the roof edge
    if (k === 3) return darker(roof, 0.12)
    if (k === 4 || k === 5) return band
    // Rooftop AC unit with louvres.
    if (x >= ac[0] && x < ac[1] && e >= em - 9) {
      if (x === ac[0] || x === ac[1] - 1 || e === em - 9) return hex(0x7f8790)
      if ((x - ac[0]) % 3 === 0 && e >= em - 7) return hex(0xa9b0b8)
      return hex(0xd3d8dd)
    }
    // Two roof hatches.
    for (const hx of [40, 84]) {
      if (x >= hx && x < hx + 7 && e >= em - 4) return x === hx || x === hx + 6 || e === em - 4 ? hex(0x9aa1a9) : hex(0xc3c9cf)
    }
    return roof
  }
  const edge = fillWithOutline(cv, mask, paint, O)
  for (const [x, e, c] of [
    [len - 2, m + 2, HEAD_HOT],
    [len - 2, m + 3, HEAD],
    [len - 2, m + 4, HEAD],
    [1, m + 2, TAIL],
    [1, m + 3, TAIL],
    [1, m + 4, TAIL_DARK],
  ]) {
    if (!edge(x, e)) cv.sym(x, e, c)
  }
  // Mirrors on stalks reaching forward from the front corners.
  for (const [x, e, c] of [
    [len - 5, m - 1, hex(0x26282c)],
    [len - 4, m - 2, hex(0x26282c)],
    [len - 3, m - 2, hex(0x26282c)],
    [len - 2, m - 2, hex(0x3a3d42)],
  ])
    cv.symIfEmpty(x, e, c)
  for (const [a, b] of [
    [26, 46],
    [154, 168],
  ]) {
    for (let x = a; x < b; x++) cv.symIfEmpty(x, m - 1, TYRE)
  }
  return cv
}

// ──────────── motorbike + rider ────────────

/**
 * 2.0 x 0.8 m scooter with a helmeted rider, drawn row by row: the top half
 * of the sprite (outermost row first), mirrored about the long axis.
 *   T tyre   b bike   d bike shade   R tail light   Y headlight   s seat
 *   S shirt  k shirt shade   n skin   h helmet   j helmet shade   H helmet shine
 *   v visor
 *   g handlebar   G grip   m mirror
 */
const MOTO_ROWS = [
  '......................m.........',
  '.....................G..........',
  '.............kkkkSSSnG..........',
  '............kSSjjkk..g..........',
  '.......bbbkkSSjhhjdddgbbbb......',
  '.TTTTTRbssSSSShHhhvddgbbbYTTTTT.',
  'TTTTTTRbssSSSShHHhvddgbbbYTTTTTT',
]

function drawMoto({ bike, shirt, helmet }) {
  const cv = new Canvas(32, 13)
  const pal = {
    T: TYRE,
    b: bike,
    d: darker(bike, 0.25),
    R: TAIL,
    Y: HEAD,
    s: hex(0x2c2826),
    S: shirt,
    k: darker(shirt, 0.28),
    n: hex(0xc58c64),
    h: helmet,
    H: lighter(helmet, 0.4),
    j: darker(helmet, 0.3),
    v: hex(0x1d232b),
    g: hex(0x55585e),
    G: hex(0x1c1c1f),
    m: hex(0x9aa0a6),
  }
  MOTO_ROWS.forEach((row, e) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]]
      if (c) cv.sym(x, e, c)
    }
  })
  return cv
}

// ──────────── the catalogue ────────────

const C = {
  white: hex(0xe8ebee),
  pearl: hex(0xf3f1ea),
  silver: hex(0xb3bac2),
  grey: hex(0x737b84),
  black: hex(0x30353d),
  red: hex(0xc8302c),
  maroon: hex(0x7e2833),
  blue: hex(0x2463b5),
  navy: hex(0x283f66),
  beige: hex(0xcbb68c),
  yellow: hex(0xf0c232),
  teal: hex(0x16888a),
  green: hex(0x2f7a4a),
  bronze: hex(0x8f6d47),
  orange: hex(0xd9531a),
}

/** [name, canvas] in atlas order. Frame names are what TrafficSystem / GameScene reference. */
const frames = []
const add = (name, cv) => frames.push({ name, cv })

for (const [n, c] of [
  ['white', C.white],
  ['silver', C.silver],
  ['black', C.black],
  ['red', C.red],
  ['blue', C.blue],
  ['grey', C.grey],
  ['maroon', C.maroon],
  ['beige', C.beige],
])
  add(`sedan_${n}`, drawCar('sedan', { body: c }))
for (const [n, c] of [
  ['white', C.pearl],
  ['red', C.red],
  ['yellow', C.yellow],
  ['teal', C.teal],
  ['silver', C.silver],
])
  add(`hatch_${n}`, drawCar('hatch', { body: c }))
for (const [n, c] of [
  ['white', C.white],
  ['silver', C.silver],
  ['black', C.black],
  ['green', C.green],
  ['navy', C.navy],
  ['bronze', C.bronze],
])
  add(`suv_${n}`, drawCar('suv', { body: c }))
add('taxi', drawCar('sedan', { body: C.white, sign: true, stripe: hex(0x2f8f5b) }))

const J_RED = hex(0xc92a2a)
const J_YEL = hex(0xf2c12e)
const J_BLU = hex(0x1f5fbf)
const J_GRN = hex(0x2b8a3e)
add('jeepney_a', drawJeepney({ body: J_RED, roof: hex(0xe9e5dc), bands: [[2, J_RED], [2, J_YEL], [2, J_BLU]] }))
add('jeepney_b', drawJeepney({ body: J_BLU, roof: CHROME, bands: [[2, J_BLU], [1, hex(0xffffff)], [2, J_RED], [1, J_YEL]] }))
add('jeepney_c', drawJeepney({ body: J_GRN, roof: hex(0xf1e6c8), bands: [[2, J_GRN], [2, J_YEL], [1, J_RED]] }))
add('jeepney_d', drawJeepney({ body: hex(0x7a2fb0), roof: hex(0xe9e5dc), bands: [[2, hex(0x7a2fb0)], [2, hex(0xf08c00)], [2, J_YEL]] }))

add('bus_a', drawBus({ side: hex(0x1f4fa0), band: hex(0x3b82d6), roof: hex(0xeef1f3) }))
add('bus_b', drawBus({ side: hex(0x2b8a3e), band: hex(0xf2c12e), roof: hex(0xeef1f3) }))

add('moto_a', drawMoto({ bike: hex(0xc92a2a), shirt: hex(0x2463b5), helmet: hex(0x2b2f36) }))
add('moto_b', drawMoto({ bike: hex(0x1f1f24), shirt: hex(0xd9d4c7), helmet: hex(0xc92a2a) }))
add('moto_c', drawMoto({ bike: hex(0x2463b5), shirt: hex(0x2f7a4a), helmet: hex(0xf0f0f0) }))
add('moto_d', drawMoto({ bike: hex(0xe8ebee), shirt: hex(0xe8590c), helmet: hex(0xf0c232) }))

// Story cars: the drop-off SUV (silver like the old suv_small art, plus the
// colours its dumping-event cycle used to tint it) and the red Corolla
// hatchback with the black roof.
add('story_suv', drawCar('suv', { body: C.silver, spare: true }))
for (const [n, c] of [
  ['black', hex(0x26292f)],
  ['yellow', hex(0xf2c73b)],
  ['green', hex(0x2f9e44)],
  ['orange', hex(0xd9480f)],
  ['blue', hex(0x1c7ed6)],
])
  add(`story_suv_${n}`, drawCar('suv', { body: c, spare: true }))
add('story_corolla', drawCar('hatch', { body: hex(0xd7322b), roof: hex(0x1b1c20) }))

// ──────────── pack + write ────────────

function pack(list) {
  const order = [...list].sort((a, b) => b.cv.h - a.cv.h || b.cv.w - a.cv.w || (a.name < b.name ? -1 : 1))
  let x = PAD
  let y = PAD
  let rowH = 0
  let width = 0
  for (const f of order) {
    if (x + f.cv.w + PAD > ATLAS_MAX_W) {
      x = PAD
      y += rowH + PAD
      rowH = 0
    }
    f.x = x
    f.y = y
    x += f.cv.w + PAD
    rowH = Math.max(rowH, f.cv.h)
    width = Math.max(width, x)
  }
  return { width, height: y + rowH + PAD }
}

const { width, height } = pack(frames)
const png = new PNG({ width, height })
png.data.fill(0)
for (const f of frames) {
  for (let y = 0; y < f.cv.h; y++) {
    for (let x = 0; x < f.cv.w; x++) {
      const c = f.cv.get(x, y)
      if (!c) continue
      const i = ((f.y + y) * width + (f.x + x)) * 4
      png.data[i] = c[0]
      png.data[i + 1] = c[1]
      png.data[i + 2] = c[2]
      png.data[i + 3] = c[3]
    }
  }
}
writeFileSync(join(outDir, 'vehicles.png'), PNG.sync.write(png))

const json = { frames: {}, meta: { image: 'vehicles.png', size: { w: width, h: height }, scale: '1', pxPerMetre: PX_PER_M } }
for (const f of frames) {
  const { w, h } = f.cv
  json.frames[f.name] = {
    frame: { x: f.x, y: f.y, w, h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w, h },
    sourceSize: { w, h },
  }
}
writeFileSync(join(outDir, 'vehicles.json'), JSON.stringify(json, null, 2) + '\n')

console.log(`vehicles.png ${width}x${height}, ${frames.length} frames`)
for (const f of frames) console.log(`  ${f.name.padEnd(18)} ${f.cv.w}x${f.cv.h}`)
