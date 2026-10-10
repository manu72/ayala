/**
 * Generates the traffic sound effects played when cars react to Mamma Cat on
 * the road (AudioSystem.playTyreScreech / playCarHorn):
 *
 *   public/assets/sounds/tyre_screech.wav  rubber squeal of a hard stop
 *   public/assets/sounds/car_horn.wav      two-tone "beep-beeep"
 *
 * Pure synthesis: no samples, no dependencies, 16-bit PCM mono WAV written by
 * hand. All randomness comes from a seeded PRNG, so output is byte-identical
 * on every run. The WAVs are committed; never hand-edit them, change this
 * script and re-run it.
 *
 * Run: node scripts/generate-sfx.mjs
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'assets', 'sounds')
mkdirSync(outDir, { recursive: true })

const SR = 44100
const TAU = Math.PI * 2
/** Output peak: -3 dBFS. */
const PEAK = 10 ** (-3 / 20)

// ──────────── dsp helpers ────────────

/** mulberry32: tiny seeded PRNG, uniform in [0, 1). */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const white = (rand) => rand() * 2 - 1

/** Smooth random control signal: white noise through two one-pole low-passes at `hz`, peak-scaled to ±1. */
function wobble(n, hz, rand) {
  const a = 1 - Math.exp((-TAU * hz) / SR)
  const out = new Float64Array(n)
  let s1 = 0
  let s2 = 0
  let peak = 1e-9
  for (let i = 0; i < n; i++) {
    s1 += (white(rand) - s1) * a
    s2 += (s1 - s2) * a
    out[i] = s2
    peak = Math.max(peak, Math.abs(s2))
  }
  for (let i = 0; i < n; i++) out[i] /= peak
  return out
}

/** Topology-preserving state-variable band-pass (unity gain at centre); safe to sweep per sample. */
function bandpass() {
  let ic1 = 0
  let ic2 = 0
  return (x, fc, q) => {
    const g = Math.tan((Math.PI * fc) / SR)
    const k = 1 / q
    const a1 = 1 / (1 + g * (g + k))
    const a2 = g * a1
    const a3 = g * a2
    const v3 = x - ic2
    const v1 = a1 * ic1 + a2 * v3
    const v2 = ic2 + a2 * ic1 + a3 * v3
    ic1 = 2 * v1 - ic1
    ic2 = 2 * v2 - ic2
    return k * v1
  }
}

/** One-pole low-pass at `hz`. */
function lowpass(hz) {
  const a = 1 - Math.exp((-TAU * hz) / SR)
  let s = 0
  return (x) => (s += (x - s) * a)
}

const rms = (buf) => Math.sqrt(buf.reduce((acc, v) => acc + v * v, 0) / buf.length)

/** Scale a buffer in place to unit RMS so mix levels below are relative loudness. */
function unitRms(buf) {
  const r = rms(buf) || 1
  for (let i = 0; i < buf.length; i++) buf[i] /= r
  return buf
}

/** Raised-cosine ramp 0→1 over x in [0, 1]. */
const ramp = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * x))

/** DC-block, normalise to PEAK, then force 3 ms fades at both ends so playback never clicks. */
function master(buf) {
  let x1 = 0
  let y1 = 0
  for (let i = 0; i < buf.length; i++) {
    const y = buf[i] - x1 + 0.995 * y1
    x1 = buf[i]
    y1 = y
    buf[i] = y
  }
  const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 1e-9)
  for (let i = 0; i < buf.length; i++) buf[i] *= PEAK / peak
  const edge = Math.round(0.003 * SR)
  for (let i = 0; i < edge; i++) {
    const g = ramp(i / edge)
    buf[i] *= g
    buf[buf.length - 1 - i] *= g
  }
  return buf
}

function writeWav(name, samples) {
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    data.writeInt16LE(Math.round(v * 32767), i * 2)
  }
  const h = Buffer.alloc(44)
  h.write('RIFF', 0, 'ascii')
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVE', 8, 'ascii')
  h.write('fmt ', 12, 'ascii')
  h.writeUInt32LE(16, 16) // fmt chunk size
  h.writeUInt16LE(1, 20) // PCM
  h.writeUInt16LE(1, 22) // mono
  h.writeUInt32LE(SR, 24)
  h.writeUInt32LE(SR * 2, 28) // byte rate
  h.writeUInt16LE(2, 32) // block align
  h.writeUInt16LE(16, 34) // bits per sample
  h.write('data', 36, 'ascii')
  h.writeUInt32LE(data.length, 40)
  const path = join(outDir, name)
  writeFileSync(path, Buffer.concat([h, data]))
  console.log(`wrote ${path} (${((samples.length / SR) * 1000).toFixed(0)} ms, ${44 + data.length} bytes)`)
}

// ──────────── tyre screech ────────────

/**
 * A hard stop: a stick-slip squeal (wandering, fluttering fundamental with
 * saturated harmonics, plus a second tyre squealing in and out a little
 * sharper) over rubber-scrub noise through a jittery resonant band-pass. Pitch
 * and band slide down as the car sheds speed; the squeal dies in a short tail
 * as it stops.
 */
function tyreScreech() {
  const rand = rng(0x5c4ee7)
  const DUR = 0.82
  const n = Math.round(DUR * SR)

  const drift = wobble(n, 9, rand) // slow wander of the squeal pitch
  const flutter = wobble(n, 60, rand) // fast stick-slip pitch flutter
  const driftB = wobble(n, 7, rand)
  const gateB = wobble(n, 5, rand) // second tyre catches and releases
  const rough = wobble(n, 30, rand) // ragged amplitude
  const bandJitter = wobble(n, 14, rand)

  const squeal = new Float64Array(n)
  const scrub = new Float64Array(n)
  const sizzle = new Float64Array(n)
  const band = bandpass()
  const hiss = bandpass()
  let phA = 0
  let phB = 0
  for (let i = 0; i < n; i++) {
    const speed = 1 - i / n // constant deceleration to rest
    const fA = 1720 + 420 * speed + 170 * drift[i] + 60 * flutter[i]
    const fB = fA * 1.12 + 90 * driftB[i]
    phA += (TAU * fA) / SR
    phB += (TAU * fB) / SR
    const toneA = Math.sin(phA) + 0.4 * Math.sin(2 * phA + 0.6) + 0.16 * Math.sin(3 * phA + 1.9)
    const toneB = Math.sin(phB) + 0.3 * Math.sin(2 * phB + 1.1)
    const levelB = 0.15 + 0.35 * Math.max(0, gateB[i])
    squeal[i] = Math.tanh(1.7 * (toneA + levelB * toneB))

    const noise = white(rand)
    scrub[i] = band(noise, 2650 + 600 * speed + 380 * bandJitter[i], 6)
    sizzle[i] = hiss(noise, 5600, 1.3)
  }
  unitRms(squeal)
  unitRms(scrub)
  unitRms(sizzle)

  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const speed = 1 - i / n
    // ~10 ms bite, loudest at the first lock-up, ~200 ms dying tail as the car stops.
    const env = ramp(t / 0.01) * (0.8 + 0.2 * speed) * ramp((DUR - t) / 0.2) ** 0.8
    const am = 1 + 0.5 * rough[i]
    out[i] = env * am * (squeal[i] + 0.6 * scrub[i] + 0.12 * sizzle[i])
  }
  return master(out)
}

// ──────────── car horn ────────────

/**
 * Classic dual-disc car horn: a low and a high tone a bit under a major third
 * apart, each a buzzy harmonic stack shaped by a horn-bell resonance around
 * 2.5 kHz and lightly saturated, then gently low-passed. Played as a short
 * "beep" and a longer "beeep" with soft edges.
 */
function carHorn() {
  const rand = rng(0x40a2)
  const LEAD = 0.01
  const BEEP1 = 0.2
  const GAP = 0.11
  const BEEP2 = 0.35
  const TAIL = 0.04
  const DUR = LEAD + BEEP1 + GAP + BEEP2 + TAIL
  const n = Math.round(DUR * SR)
  const beeps = [
    [LEAD, BEEP1],
    [LEAD + BEEP1 + GAP, BEEP2],
  ]

  const DRIVE = 1.6
  const tones = [
    { f: 404, gain: 1 },
    { f: 506, gain: 0.85 },
  ].map(({ f, gain }) => {
    const harmonics = []
    for (let k = 1; k * f < 6500; k++) {
      const hz = k * f
      const amp = k ** -0.7 * (0.35 + Math.exp(-(((hz - 2500) / 1100) ** 2)))
      harmonics.push({ k, amp, phase: rand() * TAU })
    }
    // Scale the stack so one period peaks at ±1 before saturation.
    let peak = 1e-9
    for (let j = 0; j < 2048; j++) {
      const ph = (TAU * j) / 2048
      peak = Math.max(peak, Math.abs(harmonics.reduce((s, h) => s + h.amp * Math.sin(h.k * ph + h.phase), 0)))
    }
    for (const h of harmonics) h.amp /= peak
    return { f, gain, harmonics, drift: wobble(n, 4, rand), ph: 0 }
  })

  const lpA = lowpass(5000)
  const lpB = lowpass(5000)
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    let gate = 0
    let sincePress = Infinity
    for (const [start, len] of beeps) {
      const x = t - start
      if (x <= 0 || x >= len) continue
      gate = ramp(x / 0.012) * ramp((len - x) / 0.03)
      sincePress = x
    }
    // Each press starts a touch flat while the diaphragm gets going.
    const scoop = 1 - 0.02 * Math.exp(-sincePress / 0.02)
    let s = 0
    for (const tone of tones) {
      tone.ph += (TAU * tone.f * scoop * (1 + 0.003 * tone.drift[i])) / SR
      let x = 0
      for (const h of tone.harmonics) x += h.amp * Math.sin(h.k * tone.ph + h.phase)
      s += (tone.gain * Math.tanh(DRIVE * x)) / Math.tanh(DRIVE)
    }
    out[i] = gate * lpB(lpA(s))
  }
  return master(out)
}

/**
 * The Sunday Lights show loop (placeholder until a licensed royalty-free track replaces
 * `sunday_lights.wav`): a bright bell arpeggio over a soft fifth pad and a light shaker, 4 bars at
 * 112 bpm, seamless when looped.
 */
function sundayLights() {
  const rand = rng(0x5dae11)
  const BPM = 112
  const beat = 60 / BPM
  const bars = 4
  const n = Math.round(bars * 4 * beat * SR)
  const out = new Float64Array(n)
  const midi = (m) => 440 * 2 ** ((m - 69) / 12)
  // I - vi - IV - V in C, eighth-note arpeggios up and back
  const chords = [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]]
  const pattern = [0, 1, 2, 3, 2, 1, 2, 3]
  const bell = (start, f, amp, decay) => {
    const i0 = Math.round(start * SR)
    const len = Math.min(n, Math.round(decay * 5 * SR))
    for (let k = 0; k < len; k++) {
      const t = k / SR
      const env = Math.min(1, t / 0.004) * Math.exp(-t / decay)
      const v = amp * env * (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * 2.76 * f * t) * Math.exp(-t / (decay * 0.3)) + 0.18 * Math.sin(TAU * 5.4 * f * t) * Math.exp(-t / (decay * 0.15)))
      out[(i0 + k) % n] += v // wrap tails round so the loop is seamless
    }
  }
  for (let bar = 0; bar < bars; bar++) {
    const chord = chords[bar]
    for (let e = 0; e < 8; e++) {
      const t = (bar * 4 + e / 2) * beat
      bell(t, midi(chord[pattern[e]] + 12), e % 2 === 0 ? 0.5 : 0.36, 0.35)
    }
    // pad: root and fifth, a slow swell per bar
    for (let k = 0; k < Math.round(4 * beat * SR); k++) {
      const t = k / SR
      const env = Math.sin(Math.PI * Math.min(1, t / (4 * beat))) * 0.12
      const i = Math.round(bar * 4 * beat * SR) + k
      out[i % n] += env * (Math.sin(TAU * midi(chord[0] - 12) * t) + 0.6 * Math.sin(TAU * midi(chord[0] - 5) * t))
    }
  }
  // shaker on the off-beats
  const hp = bandpass()
  for (let b = 0; b < bars * 8; b++) {
    const i0 = Math.round((b + 0.5) * (beat / 2) * SR)
    for (let k = 0; k < Math.round(0.05 * SR); k++) {
      const t = k / SR
      out[(i0 + k) % n] += 0.08 * Math.exp(-t / 0.012) * hp(white(rand), 7000, 1.2)
    }
  }
  // master() fades the ends; keep the loop seamless by normalising without the edge fade
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 1e-9)
  for (let i = 0; i < n; i++) out[i] *= (PEAK * 0.8) / peak
  return out
}

writeWav('tyre_screech.wav', tyreScreech())
writeWav('car_horn.wav', carHorn())
writeWav('sunday_lights.wav', sundayLights())
