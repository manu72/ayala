import { describe, expect, it, vi } from "vitest";

// DayNightCycle (imported for its phase table) extends Phaser's EventEmitter.
vi.mock("phaser", () => ({ default: { Events: { EventEmitter: class {} } } }));

import type Phaser from "phaser";
import { TrafficSystem, type TrafficClock } from "../../src/systems/TrafficSystem";
import { VEHICLE_CLASSES } from "../../src/data/vehicles";
import type { MapPlace } from "../../src/utils/mapPlaces";

interface ImageMock {
  x: number;
  y: number;
  rotation: number;
  flipX: boolean;
  alpha: number;
  visible: boolean;
  depth: number;
  destroyed: boolean;
  texture: string;
  frame: string;
  tint: number | null;
  [method: string]: unknown;
}

function makeScene(view = { x: 0, y: 0, width: 5000, height: 1000 }) {
  const images: ImageMock[] = [];
  const add = {
    image: (_x: number, _y: number, texture: string, frame: string) => {
      const img = {
        x: 0,
        y: 0,
        rotation: 0,
        flipX: false,
        alpha: 1,
        visible: true,
        depth: 0,
        destroyed: false,
        texture,
        frame,
        tint: null,
      } as ImageMock;
      const chain = (fn: (...a: never[]) => void) => (...a: never[]) => (fn(...a), img);
      Object.assign(img, {
        setDepth: chain((d: number) => (img.depth = d)),
        setFrame: chain((f: string) => (img.frame = f)),
        setTint: chain((t: number) => (img.tint = t)),
        setVisible: chain((v: boolean) => (img.visible = v)),
        setPosition: chain((x: number, y: number) => ((img.x = x), (img.y = y))),
        setRotation: chain((r: number) => (img.rotation = r)),
        setFlipX: chain((f: boolean) => (img.flipX = f)),
        setAlpha: chain((a: number) => (img.alpha = a)),
        setOrigin: chain(() => undefined),
        setBlendMode: chain(() => undefined),
        destroy: () => (img.destroyed = true),
      });
      images.push(img);
      return img;
    },
  };
  const scene = { add, cameras: { main: { worldView: view } } } as unknown as Phaser.Scene;
  return { scene, images, view };
}

/** Two 4000 px one-way carriageways: eastbound along y=200 and westbound along y=600. */
const places: MapPlace[] = [
  { name: "traffic_east", type: "traffic", x: 0, y: 200, props: { lanes: 2 }, polyline: [{ x: 0, y: 200 }, { x: 4000, y: 200 }] },
  { name: "traffic_west", type: "traffic", x: 4000, y: 600, props: { lanes: 2 }, polyline: [{ x: 4000, y: 600 }, { x: 0, y: 600 }] },
  { name: "bench_a", type: "bench", x: 10, y: 10, props: {} },
];

const RUSH: TrafficClock = { currentPhase: "dawn", phaseProgress: 0.5 }; // 08:00
const NIGHT: TrafficClock = { currentPhase: "night", phaseProgress: 0.5 }; // 01:30

/** Deterministic PRNG so runs are repeatable. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Vehicle bodies (depth 4); their pooled shadows sit just below. */
const cars = (images: ImageMock[]) => images.filter((i) => i.depth === 4);
const beams = (images: ImageMock[]) => images.filter((i) => i.texture === "light_beam");
const shown = (images: ImageMock[]) => images.filter((i) => i.visible && !i.destroyed);
const shownCars = (images: ImageMock[]) => cars(shown(images));
const LENGTH_BY_FRAME = new Map(
  Object.values(VEHICLE_CLASSES).flatMap((c) => c.frames.map((f) => [f, c.length] as const)),
);
const lengthOf = (img: ImageMock) => LENGTH_BY_FRAME.get(img.frame) ?? Number.NaN;

describe("TrafficSystem", () => {
  it("builds one lane per lane of every traffic place and fills them by time of day", () => {
    const rush = makeScene();
    const traffic = new TrafficSystem(rush.scene, places, { maxCars: 40, rng: seeded() });
    expect(traffic.laneCount).toBe(4);
    for (let i = 0; i < 1800; i++) traffic.update(1000 / 60, RUSH);
    expect(traffic.carCount).toBeGreaterThan(25);
    expect(traffic.carCount).toBeLessThanOrEqual(40);

    const night = makeScene();
    const quiet = new TrafficSystem(night.scene, places, { maxCars: 40, rng: seeded() });
    for (let i = 0; i < 1800; i++) quiet.update(1000 / 60, NIGHT);
    expect(quiet.carCount).toBeLessThanOrEqual(4);
  });

  it("switches headlights on after dusk (one beam per visible car, off by day)", () => {
    const night = makeScene();
    const traffic = new TrafficSystem(night.scene, places, { maxCars: 40, rng: seeded() });
    const dusk: TrafficClock = { currentPhase: "evening", phaseProgress: 0.6 }; // ~19:30, evening rush
    for (let i = 0; i < 600; i++) traffic.update(1000 / 60, dusk);
    const lit = beams(night.images).filter((b) => b.visible && !b.destroyed);
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.length).toBe(shownCars(night.images).length);
    for (const b of lit) expect(b.depth).toBeGreaterThan(50); // above the night overlay
    const day = makeScene();
    const dayTraffic = new TrafficSystem(day.scene, places, { maxCars: 40, rng: seeded() });
    for (let i = 0; i < 600; i++) dayTraffic.update(1000 / 60, { currentPhase: "day", phaseProgress: 0.5 });
    expect(beams(day.images)).toHaveLength(0);
  });

  it("drives cars in their lane's direction at depth 4, nose first, in the right-hand lanes", () => {
    const { scene, images } = makeScene();
    const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: seeded() });
    traffic.update(16, RUSH);
    for (let i = 0; i < 60; i++) traffic.update(16, RUSH);
    const before = shownCars(images).map((img) => ({ img, x: img.x }));
    traffic.update(100, RUSH);
    expect(before.length).toBeGreaterThan(0);
    for (const { img, x } of before) {
      expect(img.depth).toBe(4);
      expect(img.flipX).toBe(false);
      if (img.y < 400) {
        // eastbound: kerb (right of travel) is south, lanes at y = 200 +/- 26.4; nose-east art unrotated
        expect(img.x).toBeGreaterThanOrEqual(x);
        expect(img.rotation).toBeCloseTo(0);
        expect([173.6, 226.4].some((y) => Math.abs(img.y - y) < 0.01)).toBe(true);
      } else {
        expect(img.x).toBeLessThanOrEqual(x);
        expect(Math.abs(img.rotation)).toBeCloseTo(Math.PI);
        expect([573.6, 626.4].some((y) => Math.abs(img.y - y) < 0.01)).toBe(true);
      }
    }
  });

  it("draws top-down atlas frames, never mirrored, each with a world-fixed shadow just below it", () => {
    const { scene, images } = makeScene();
    const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: seeded() });
    const frames = new Set<string>();
    for (let i = 0; i < 900; i++) {
      traffic.update(1000 / 30, RUSH);
      for (const img of shownCars(images)) frames.add(img.frame);
    }
    expect(cars(images).length).toBeGreaterThan(0);
    for (const img of images) {
      expect(img.texture).toBe("vehicles");
      expect(LENGTH_BY_FRAME.has(img.frame)).toBe(true);
      expect(img.flipX).toBe(false);
    }
    // Mixed traffic: cars, jeepneys and motorbikes all turn up.
    for (const prefix of ["sedan_", "jeepney_", "moto_"]) expect([...frames].some((f) => f.startsWith(prefix))).toBe(true);

    const shadows = images.filter((i) => i.depth === 3.99);
    expect(shadows).toHaveLength(cars(images).length); // one pooled shadow per pooled car
    for (const shadow of shadows) {
      expect(shadow.depth).toBeLessThan(4);
      expect(shadow.depth).toBeGreaterThan(3.9);
      expect(shadow.tint).toBe(0x000000);
    }
    // Each visible car has a shadow with its frame and heading, offset (+3, +4) in world space at 0.28 of its alpha.
    for (const car of shownCars(images)) {
      const shadow = shown(shadows).find((s) => Math.abs(s.x - car.x - 3) < 1e-9 && Math.abs(s.y - car.y - 4) < 1e-9);
      expect(shadow).toBeDefined();
      expect(shadow?.frame).toBe(car.frame);
      expect(shadow?.rotation).toBeCloseTo(car.rotation);
      expect(shadow?.alpha).toBeCloseTo(car.alpha * 0.28);
    }
  });

  it("hides cars outside the camera view but keeps simulating them", () => {
    const { scene, images, view } = makeScene({ x: 0, y: 0, width: 300, height: 300 });
    const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: seeded() });
    for (let i = 0; i < 600; i++) traffic.update(16, RUSH);
    for (const img of shownCars(images)) {
      // Culled by the body, not the centre: a bus can be drawn while its centre is just off-screen.
      expect(img.x).toBeLessThan(view.width + 48 + lengthOf(img) / 2);
      expect(img.y).toBeLessThan(view.height + 48 + lengthOf(img) / 2);
    }
    expect(traffic.carCount).toBeGreaterThan(shownCars(images).length);
  });

  it("reserve() clears the stretch at once, queues traffic before it, and release() lets it flow", () => {
    const { scene, images } = makeScene();
    const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: seeded() });
    for (let i = 0; i < 600; i++) traffic.update(16, RUSH);
    const point = { x: 2000, y: 200 };
    // Any car body overlapping x = 2000 +/- 298 is in the stretch; a centre within 260 always is.
    const near = (img: ImageMock) => Math.abs(img.x - point.x) < 260 && Math.abs(img.y - point.y) < 100;

    traffic.reserve(point, 300);
    expect(shown(images).filter(near)).toHaveLength(0); // synchronous: works with update() frozen
    for (let i = 0; i < 1200; i++) {
      traffic.update(16, RUSH);
      expect(shown(images).filter(near)).toHaveLength(0);
    }
    const queued = shown(images).filter((img) => Math.abs(img.y - 200) < 100 && img.x < 1700 && img.x > 1500);
    expect(queued.length).toBeGreaterThan(0);

    traffic.release();
    for (let i = 0; i < 300; i++) traffic.update(16, RUSH);
    expect(shown(images).filter(near).length).toBeGreaterThan(0);
  });

  it("setVisible(false) hides everything immediately; destroy() frees every image", () => {
    const { scene, images } = makeScene();
    const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: seeded() });
    for (let i = 0; i < 120; i++) traffic.update(16, RUSH);
    expect(shown(images).length).toBeGreaterThan(0);
    traffic.setVisible(false);
    expect(shown(images)).toHaveLength(0);
    traffic.update(16, RUSH);
    expect(shown(images)).toHaveLength(0);
    traffic.setVisible(true);
    traffic.update(16, RUSH);
    expect(shown(images).length).toBeGreaterThan(0);
    for (const img of shown(images)) expect(img.alpha).toBeLessThan(0.1); // fades back in, no pop

    traffic.destroy();
    expect(images.every((img) => img.destroyed)).toBe(true);
    traffic.update(16, RUSH);
    expect(traffic.carCount).toBe(0);
  });

  it("ignores a stale release token so an overlapping reservation stays in place", () => {
    const { scene, images } = makeScene();
    const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: seeded() });
    for (let i = 0; i < 600; i++) traffic.update(16, RUSH);
    const point = { x: 2000, y: 200 };
    const near = (img: ImageMock) => Math.abs(img.x - point.x) < 260 && Math.abs(img.y - point.y) < 100;
    const first = traffic.reserve(point, 300);
    const second = traffic.reserve(point, 300); // e.g. a second dumping event before the first car left
    traffic.release(first);
    for (let i = 0; i < 600; i++) {
      traffic.update(16, RUSH);
      expect(shown(images).filter(near)).toHaveLength(0);
    }
    traffic.release(second);
    for (let i = 0; i < 300; i++) traffic.update(16, RUSH);
    expect(shown(images).filter(near).length).toBeGreaterThan(0);
  });

  it("waits for the camera's first render before prewarming (worldView is empty until then)", () => {
    const view = { x: 0, y: 0, width: 0, height: 0 };
    const { scene } = makeScene(view);
    const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: seeded() });
    traffic.update(16, RUSH);
    expect(traffic.carCount).toBe(0); // nothing simulated until the camera has rendered once
    Object.assign(view, { x: 1500, y: 0, width: 1000, height: 1000 });
    traffic.update(16, RUSH);
    expect(traffic.carCount).toBeGreaterThan(20);
  });

  it("prewarms the roads at load but never materialises a car inside the camera view", () => {
    const view = { x: 1500, y: 0, width: 1000, height: 1000 };
    const { scene, images } = makeScene(view);
    const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: seeded() });
    traffic.update(16, RUSH);
    expect(traffic.carCount).toBeGreaterThan(20);
    // Widen the camera and redraw without moving anything: every prewarmed car is outside the old view.
    Object.assign(view, { x: -100, y: -100, width: 4200, height: 900 });
    traffic.update(0, RUSH);
    expect(shown(images).length).toBeGreaterThan(20);
    for (const img of shown(images)) expect(img.x < 1500 - 48 || img.x > 2500 + 48).toBe(true);
  });

  it("points every car nose-first along diagonal lanes in both directions", () => {
    const diagonal: MapPlace[] = [
      // Makati Ave-like: south-south-west, and its northbound twin.
      { name: "sw", type: "traffic", x: 3000, y: 0, props: { lanes: 2 }, polyline: [{ x: 3000, y: 0 }, { x: 1000, y: 4000 }] },
      { name: "ne", type: "traffic", x: 1200, y: 4000, props: { lanes: 2 }, polyline: [{ x: 1200, y: 4000 }, { x: 3200, y: 0 }] },
    ];
    const { scene, images } = makeScene({ x: 0, y: 0, width: 4000, height: 4000 });
    const traffic = new TrafficSystem(scene, diagonal, { maxCars: 30, rng: seeded(3) });
    const last = new Map<ImageMock, { x: number; y: number }>();
    let checked = 0;
    for (let i = 0; i < 1500; i++) {
      traffic.update(1000 / 60, RUSH);
      for (const img of shownCars(images)) {
        const prev = last.get(img);
        last.set(img, { x: img.x, y: img.y });
        const moved = prev ? Math.hypot(img.x - prev.x, img.y - prev.y) : 0;
        if (!prev || moved < 1 || moved > 20) continue; // skip first sighting and pool reuse
        // The art faces east, so the nose is (cos r, sin r) and nothing is ever mirrored.
        const nx = Math.cos(img.rotation);
        const ny = Math.sin(img.rotation);
        expect((nx * (img.x - prev.x) + ny * (img.y - prev.y)) / moved).toBeGreaterThan(0.99);
        expect(img.flipX).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("never overlaps cars in a lane and never grows the image pool past the cap, through churn and reservations", () => {
    const short: MapPlace[] = [
      { name: "a", type: "traffic", x: 0, y: 200, props: { lanes: 1 }, polyline: [{ x: 0, y: 200 }, { x: 1500, y: 200 }] },
      { name: "b", type: "traffic", x: 1500, y: 400, props: { lanes: 1 }, polyline: [{ x: 1500, y: 400 }, { x: 0, y: 400 }] },
    ];
    const { scene, images } = makeScene({ x: -100, y: 0, width: 1700, height: 600 });
    const traffic = new TrafficSystem(scene, short, { maxCars: 12, rng: seeded(11) });
    for (let i = 0; i < 6000; i++) {
      if (i % 900 === 300) traffic.reserve({ x: 300 + (i % 7) * 120, y: 300 }, 250, i % 2 ? 300 : 0);
      if (i % 900 === 700) traffic.release();
      traffic.update(i % 97 === 0 ? 400 : 1000 / 60, RUSH); // with the odd frame hitch
      expect(traffic.carCount).toBeLessThanOrEqual(12);
      for (const y of [200, 400]) {
        const lane = shownCars(images)
          .filter((img) => img.y === y)
          .sort((p, q) => p.x - q.x);
        // Bumper to bumper at least MIN_GAP (16 px), whatever the two vehicles' real lengths.
        lane.forEach((b, k) => {
          const a = lane[k - 1];
          if (a) expect(b.x - a.x - (lengthOf(a) + lengthOf(b)) / 2).toBeGreaterThanOrEqual(16 - 1e-6);
        });
      }
    }
    expect(cars(images).length).toBeLessThanOrEqual(12);
    expect(images.length).toBeLessThanOrEqual(24); // plus one shadow each
  });

  it("fades cars out over fadeOutMs when reserving with a fade", () => {
    const { scene, images } = makeScene();
    const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: seeded() });
    const point = { x: 2000, y: 200 };
    const near = (img: ImageMock) => Math.abs(img.x - point.x) < 260 && Math.abs(img.y - point.y) < 100;
    // Drive until a car body is well inside the stretch.
    for (let i = 0; i < 3000 && !shown(images).some((img) => near(img) && Math.abs(img.x - point.x) < 150); i++) {
      traffic.update(16, RUSH);
    }
    expect(shown(images).filter(near).length).toBeGreaterThan(0);

    traffic.reserve(point, 300, 300);
    expect(shown(images).filter(near).length).toBeGreaterThan(0); // not instant
    for (let i = 0; i < 6; i++) traffic.update(16, RUSH);
    const fading = shown(images).filter(near);
    expect(fading.length).toBeGreaterThan(0);
    for (const img of fading) expect(img.alpha).toBeLessThan(0.8);
    for (let i = 0; i < 20; i++) traffic.update(16, RUSH);
    expect(shown(images).filter(near)).toHaveLength(0);
  });

  it("survives degenerate traffic places without NaN positions", () => {
    const junk: MapPlace[] = [
      { name: "empty", type: "traffic", x: 0, y: 0, props: {}, polyline: [] },
      { name: "dot", type: "traffic", x: 5, y: 5, props: { lanes: 3 }, polyline: [{ x: 5, y: 5 }] },
      { name: "same", type: "traffic", x: 5, y: 5, props: { lanes: 2 }, polyline: [{ x: 5, y: 5 }, { x: 5, y: 5 }] },
      { name: "dupes", type: "traffic", x: 0, y: 300, props: { lanes: "abc" }, polyline: [{ x: 0, y: 300 }, { x: 0, y: 300 }, { x: 900, y: 300 }, { x: 900, y: 300 }] },
      { name: "none", type: "traffic", x: 0, y: 0, props: { lanes: 0 } },
    ];
    expect(() => new TrafficSystem(makeScene().scene, [], {}).update(16, RUSH)).not.toThrow();
    const { scene, images } = makeScene();
    const traffic = new TrafficSystem(scene, junk, { bounds: { width: 1000, height: 1000 }, rng: seeded() });
    expect(traffic.lanesFor("same")).toBe(0);
    expect(traffic.lanesFor("dupes")).toBe(2);
    for (let i = 0; i < 600; i++) traffic.update(16, RUSH);
    expect(traffic.carCount).toBeGreaterThan(0);
    traffic.update(Number.NaN, RUSH);
    traffic.update(16, RUSH);
    traffic.reserve({ x: 500, y: 300 }, 100);
    traffic.update(16, RUSH);
    expect(shown(images).length).toBeGreaterThan(0);
    for (const img of images) expect(Number.isFinite(img.x) && Number.isFinite(img.y) && Number.isFinite(img.rotation)).toBe(true);
  });

  it("drops outer lanes that would leave the road", () => {
    const { scene } = makeScene();
    const roadBand = (_x: number, y: number) => Math.abs(y - 200) < 60 || Math.abs(y - 600) < 30;
    const traffic = new TrafficSystem(scene, places, { isDrivable: roadBand });
    expect(traffic.laneCount).toBe(3);
    expect(traffic.lanesFor("traffic_east")).toBe(2);
    expect(traffic.lanesFor("traffic_west")).toBe(1);
    expect(traffic.lanesFor("nope")).toBe(0);
  });
});

describe("Mamma Cat on the road", () => {
  const WIDTH_BY_FRAME = new Map(
    Object.values(VEHICLE_CLASSES).flatMap((c) => c.frames.map((f) => [f, c.width] as const)),
  );
  /** Distance from her centre to the drawn car body (0 when inside it). */
  const gapTo = (img: ImageMock, cat: { x: number; y: number }) => {
    const halfL = lengthOf(img) / 2;
    const halfW = (WIDTH_BY_FRAME.get(img.frame) ?? Number.NaN) / 2;
    const dx = cat.x - img.x;
    const dy = cat.y - img.y;
    const u = dx * Math.cos(img.rotation) + dy * Math.sin(img.rotation);
    const v = -dx * Math.sin(img.rotation) + dy * Math.cos(img.rotation);
    return Math.hypot(Math.max(0, Math.abs(u) - halfL), Math.max(0, Math.abs(v) - halfW));
  };
  /** Both test carriageways are two lanes wide; the pavement starts a lane width off each centre line. */
  const isDrivable = (_x: number, y: number) => Math.abs(y - 200) <= 52.8 || Math.abs(y - 600) <= 52.8;
  const RADIUS = 10;
  /** Separating-axis test on two drawn car bodies (oriented rectangles). */
  const carsOverlap = (a: ImageMock, b: ImageMock) => {
    const box = (img: ImageMock) => ({
      x: img.x,
      y: img.y,
      hl: lengthOf(img) / 2,
      hw: (WIDTH_BY_FRAME.get(img.frame) ?? Number.NaN) / 2,
      ux: Math.cos(img.rotation),
      uy: Math.sin(img.rotation),
    });
    const A = box(a);
    const B = box(b);
    const reach = (r: typeof A, ax: number, ay: number) => r.hl * Math.abs(r.ux * ax + r.uy * ay) + r.hw * Math.abs(-r.uy * ax + r.ux * ay);
    for (const [ax, ay] of [[A.ux, A.uy], [-A.uy, A.ux], [B.ux, B.uy], [-B.uy, B.ux]] as const) {
      if (Math.abs((B.x - A.x) * ax + (B.y - A.y) * ay) >= reach(A, ax, ay) + reach(B, ax, ay)) return false;
    }
    return true;
  };

  it("never drives a car onto her, whether she stands, sits or wanders across the road", () => {
    const { scene, images } = makeScene();
    const her = { x: 2000, y: 226.4, radius: RADIUS, onRoad: true, settled: false };
    const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: seeded(), isDrivable, cat: () => her });
    let worstWhileStill = Infinity;
    let movedOntoHer = 0;
    let carCrashes = 0;
    const passedWhileSitting = new Set<ImageMock>();
    const last = new Map<ImageMock, { x: number; y: number; rotation: number }>();
    const frame = (walking: boolean) => {
      traffic.update(1000 / 60, RUSH);
      for (const img of shownCars(images)) {
        const gap = gapTo(img, her);
        const prev = last.get(img);
        if (!walking) worstWhileStill = Math.min(worstWhileStill, gap);
        // She may walk under a stopped car (cats do); a car touching her must not move.
        if (gap < RADIUS && prev && (prev.x !== img.x || prev.y !== img.y || prev.rotation !== img.rotation)) movedOntoHer++;
        if (her.settled && img.y < 400 && (prev?.x ?? Infinity) < her.x && img.x >= her.x) passedWhileSitting.add(img);
        last.set(img, { x: img.x, y: img.y, rotation: img.rotation });
      }
      const drawn = shownCars(images);
      for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) if (carsOverlap(drawn[i]!, drawn[j]!)) carCrashes++;
    };
    for (let i = 0; i < 20 * 60; i++) frame(false); // standing in the kerb lane
    her.settled = true;
    for (let i = 0; i < 40 * 60; i++) frame(false); // sitting there
    her.settled = false;
    for (let i = 0; i < 8 * 60; i++) {
      her.y = 140 + (130 * i) / (8 * 60); // strolling across both lanes
      frame(true);
    }
    expect(worstWhileStill).toBeGreaterThanOrEqual(RADIUS);
    expect(movedOntoHer).toBe(0);
    expect(carCrashes).toBe(0); // steering round her never runs into the next lane's traffic
    expect(passedWhileSitting.size).toBeGreaterThan(5); // drove round her, not just once
  });

  it("lets motorbikes squeeze past her while cars wait, even when she won't stay put", () => {
    /** 60 s of rush hour with her fidgeting in the kerb lane (never still long enough for cars to go round). */
    const fidget = (rng: () => number) => {
      const { scene, images } = makeScene();
      const her = { x: 2000, y: 226.4, radius: RADIUS, onRoad: true, settled: false };
      const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng, isDrivable, cat: () => her });
      const passed = { moto: 0, other: 0 };
      let movedOntoHer = 0;
      const last = new Map<ImageMock, { x: number; y: number; rotation: number }>();
      for (let i = 0; i < 60 * 60; i++) {
        her.x = Math.floor(i / 90) % 2 === 0 ? 2000 : 2008;
        traffic.update(1000 / 60, RUSH);
        for (const img of shownCars(images)) {
          const prev = last.get(img);
          if (gapTo(img, her) < RADIUS && prev && (prev.x !== img.x || prev.y !== img.y || prev.rotation !== img.rotation)) movedOntoHer++;
          // her lane (kerb lane, y 226.4), including a bike squeezing by on its inside
          if (prev && img.y > 195 && img.y < 300 && prev.x < her.x && img.x >= her.x) passed[img.frame.startsWith("moto") ? "moto" : "other"]++;
          last.set(img, { x: img.x, y: img.y, rotation: img.rotation });
        }
      }
      return { passed, movedOntoHer };
    };
    const bikes = fidget(() => 0.999); // the last vehicle class: every spawn is a motorbike
    expect(bikes.movedOntoHer).toBe(0);
    expect(bikes.passed.moto).toBeGreaterThan(3);
    const mixed = fidget(seeded(3));
    expect(mixed.movedOntoHer).toBe(0);
    expect(mixed.passed.other).toBe(0);
  });

  it("screeches when she darts out just ahead of a moving car, and the driver honks while she stays", () => {
    const { scene, images } = makeScene();
    let her: { x: number; y: number; radius: number; onRoad: boolean; settled: boolean } | null = null;
    const onScreech = vi.fn();
    const onHorn = vi.fn();
    const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: () => 0.05, isDrivable, cat: () => her, onScreech, onHorn });
    let victim: ImageMock | undefined;
    for (let i = 0; i < 1200 && !victim; i++) {
      traffic.update(1000 / 60, RUSH);
      victim = shownCars(images).find((img) => img.y < 400 && img.x > 800 && img.x < 2500);
    }
    expect(victim).toBeDefined();
    her = { x: victim!.x + lengthOf(victim!) / 2 + 30 + RADIUS, y: victim!.y, radius: RADIUS, onRoad: true, settled: false };
    for (let i = 0; i < 90; i++) {
      traffic.update(1000 / 60, RUSH);
      for (const img of shownCars(images)) expect(gapTo(img, her)).toBeGreaterThanOrEqual(RADIUS);
    }
    expect(onScreech).toHaveBeenCalledTimes(1);
    expect(Math.hypot(onScreech.mock.calls[0]![0] - her.x, onScreech.mock.calls[0]![1] - her.y)).toBeLessThan(120);
    expect(onHorn).toHaveBeenCalled();
  });

  it("leaves traffic alone when she is out of the world or well up the pavement", () => {
    const run = (cat?: () => { x: number; y: number; radius: number; onRoad: boolean; settled: boolean } | null) => {
      const { scene, images } = makeScene();
      const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: seeded(), cat });
      for (let i = 0; i < 600; i++) traffic.update(1000 / 60, RUSH);
      return shownCars(images).map((img) => [img.x, img.y, img.rotation]);
    };
    const untouched = run();
    expect(run(() => null)).toEqual(untouched);
    // the road edge is at y = 252.8; she sits on the pavement 37 px beyond it
    expect(run(() => ({ x: 2000, y: 300, radius: RADIUS, onRoad: false, settled: true }))).toEqual(untouched);
  });

  /** Run traffic round her; count any drawn vehicle moving while it touches her, and any two drawn vehicles overlapping. */
  const watch = (opts: {
    rng: () => number;
    clock: TrafficClock;
    seconds: number;
    maxCars?: number;
    her: (frame: number) => { x: number; y: number; radius: number; settled: boolean };
  }) => {
    const { scene, images } = makeScene();
    let her = { ...opts.her(0), onRoad: true };
    const traffic = new TrafficSystem(scene, places, { maxCars: opts.maxCars ?? 40, rng: opts.rng, isDrivable, cat: () => her });
    const last = new Map<ImageMock, { x: number; y: number; rotation: number }>();
    let movedOntoHer = 0;
    let crashes = 0;
    for (let i = 0; i < opts.seconds * 60; i++) {
      her = { ...opts.her(i), onRoad: true };
      traffic.update(1000 / 60, opts.clock);
      const drawn = shownCars(images);
      for (const img of drawn) {
        const prev = last.get(img);
        if (gapTo(img, her) < her.radius && prev && (prev.x !== img.x || prev.y !== img.y || prev.rotation !== img.rotation)) movedOntoHer++;
        last.set(img, { x: img.x, y: img.y, rotation: img.rotation });
      }
      for (let a = 0; a < drawn.length; a++) for (let b = a + 1; b < drawn.length; b++) if (carsOverlap(drawn[a]!, drawn[b]!)) crashes++;
    }
    return { movedOntoHer, crashes, images };
  };
  const DAY: TrafficClock = { currentPhase: "day", phaseProgress: 0.5 };

  it("never swings a bus corner over her as she wakes and settles again beside it", () => {
    // every vehicle a bus (the longest swing), light enough that they get past her; she naps in the inner lane and keeps stirring
    const nap = watch({
      rng: () => 0.88,
      clock: DAY,
      maxCars: 12,
      seconds: 90,
      her: (i) => (Math.floor(i / 37) % 2 === 0 ? { x: 2000, y: 173.6, radius: 12, settled: true } : { x: 2000, y: 173.6, radius: 10, settled: false }),
    });
    expect(nap.movedOntoHer).toBe(0);
    expect(nap.crashes).toBe(0);
  });

  it("never steers one vehicle through another while she wanders between the lanes", () => {
    // she crosses back and forth, pausing at different points across both lanes
    const stops = [150, 185, 205, 240, 200, 170, 230];
    const wander = (i: number) => {
      const leg = Math.floor(i / 150) % stops.length;
      const from = stops[(leg + stops.length - 1) % stops.length]!;
      const to = stops[leg]!;
      const t = Math.min(1, (i % 150) / 40); // walk for 40 frames, then wait
      return { x: 2000, y: from + (to - from) * t, radius: RADIUS, settled: false };
    };
    for (const rng of [seeded(5), () => 0.999 /* all motorbikes */]) {
      const run = watch({ rng, clock: DAY, seconds: 60, her: wander });
      expect(run.movedOntoHer).toBe(0);
      expect(run.crashes).toBe(0);
    }
  });

  it("steers cars in her own lane round her when she sits there and the next lane has gaps", () => {
    const { scene, images } = makeScene();
    const her = { x: 2000, y: 226.4, radius: RADIUS, onRoad: true, settled: true };
    const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: seeded(), isDrivable, cat: () => her });
    const lastX = new Map<ImageMock, number>();
    let passedRound = 0;
    for (let i = 0; i < 60 * 60; i++) {
      traffic.update(1000 / 60, DAY);
      for (const img of shownCars(images)) {
        // between the two lane centres (173.6 and 226.4): a car from her lane passing on its inside
        if ((lastX.get(img) ?? Infinity) < her.x && img.x >= her.x && img.y > 180 && img.y < 215) passedRound++;
        lastX.set(img, img.x);
      }
    }
    expect(passedRound).toBeGreaterThan(2);
  });

  it("keeps cars hidden for a scripted car silent, though they still stop for her", () => {
    const { scene } = makeScene();
    let her: { x: number; y: number; radius: number; onRoad: boolean; settled: boolean } | null = null;
    const onScreech = vi.fn();
    const onHorn = vi.fn();
    const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: () => 0.05, isDrivable, cat: () => her, onScreech, onHorn });
    for (let i = 0; i < 20 * 60; i++) traffic.update(1000 / 60, RUSH);
    traffic.reserve({ x: 2000, y: 240 }, 700, 300); // the dumping car's stretch: cars inside fade out but drive on
    for (let i = 0; i < 30; i++) traffic.update(1000 / 60, RUSH);
    her = { x: 2050, y: 226.4, radius: RADIUS, onRoad: true, settled: false };
    let held = 0;
    for (let i = 0; i < 4 * 60; i++) {
      traffic.update(1000 / 60, RUSH);
      held += (traffic as unknown as { lanes: Array<{ cars: Array<{ blocked?: boolean }> }> }).lanes.some((l) => l.cars.some((c) => c.blocked)) ? 1 : 0;
    }
    expect(held).toBeGreaterThan(0); // a hidden car really did stop for her
    expect(onScreech).not.toHaveBeenCalled();
    expect(onHorn).not.toHaveBeenCalled();
  });

  it("carNear() finds the car touching a point, and nothing between the carriageways or while hidden", () => {
    const { scene, images } = makeScene();
    const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: seeded() });
    for (let i = 0; i < 10 * 60; i++) traffic.update(1000 / 60, RUSH);
    const car = shownCars(images)[0]!;
    const hit = traffic.carNear({ x: car.x, y: car.y }, 0);
    expect(hit).not.toBeNull();
    expect(Math.hypot(hit!.x - car.x, hit!.y - car.y)).toBeLessThan(1);
    expect(hit!.speed).toBeGreaterThanOrEqual(0);
    // body, not centre: 5 px off its flank, or its bumper (eastbound lane, so lateral is y)
    const half = { l: lengthOf(car) / 2, w: (WIDTH_BY_FRAME.get(car.frame) ?? Number.NaN) / 2 };
    const besideFlank = traffic.carNear({ x: car.x, y: car.y + (car.y < 400 ? 1 : -1) * (half.w + 5) }, 10);
    expect(besideFlank?.gap).toBeCloseTo(5, 0);
    expect(traffic.carNear({ x: car.x + half.l + 5, y: car.y }, 4)).toBeNull();
    expect(traffic.carNear({ x: 2000, y: 400 }, 60)).toBeNull(); // 175 px from the nearest lane
    traffic.setVisible(false);
    expect(traffic.carNear({ x: car.x, y: car.y }, 0)).toBeNull();
  });
});
