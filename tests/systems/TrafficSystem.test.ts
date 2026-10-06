import { describe, expect, it, vi } from "vitest";

// DayNightCycle (imported for its phase table) extends Phaser's EventEmitter.
vi.mock("phaser", () => ({ default: { Events: { EventEmitter: class {} } } }));

import type Phaser from "phaser";
import { TrafficSystem, type TrafficClock } from "../../src/systems/TrafficSystem";
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
  [method: string]: unknown;
}

function makeScene(view = { x: 0, y: 0, width: 5000, height: 1000 }) {
  const images: ImageMock[] = [];
  const add = {
    image: () => {
      const img = { x: 0, y: 0, rotation: 0, flipX: false, alpha: 1, visible: true, depth: 0, destroyed: false } as ImageMock;
      const chain = (fn: (...a: never[]) => void) => (...a: never[]) => (fn(...a), img);
      Object.assign(img, {
        setDepth: chain((d: number) => (img.depth = d)),
        setTexture: chain(() => {}),
        setDisplaySize: chain(() => {}),
        setTint: chain(() => {}),
        clearTint: chain(() => {}),
        setVisible: chain((v: boolean) => (img.visible = v)),
        setPosition: chain((x: number, y: number) => ((img.x = x), (img.y = y))),
        setRotation: chain((r: number) => (img.rotation = r)),
        setFlipX: chain((f: boolean) => (img.flipX = f)),
        setAlpha: chain((a: number) => (img.alpha = a)),
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

const shown = (images: ImageMock[]) => images.filter((i) => i.visible && !i.destroyed);

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

  it("drives cars in their lane's direction at depth 4, upright, in the right-hand lanes", () => {
    const { scene, images } = makeScene();
    const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: seeded() });
    traffic.update(16, RUSH);
    for (let i = 0; i < 60; i++) traffic.update(16, RUSH);
    const before = shown(images).map((img) => ({ img, x: img.x }));
    traffic.update(100, RUSH);
    expect(before.length).toBeGreaterThan(0);
    for (const { img, x } of before) {
      expect(img.depth).toBe(4);
      expect(Math.abs(img.rotation)).toBeLessThanOrEqual(Math.PI / 2);
      if (img.y < 400) {
        // eastbound: kerb (right of travel) is south, lanes at y = 200 +/- 26.4; art mirrored to face east
        expect(img.x).toBeGreaterThanOrEqual(x);
        expect(img.flipX).toBe(true);
        expect([173.6, 226.4].some((y) => Math.abs(img.y - y) < 0.01)).toBe(true);
      } else {
        expect(img.x).toBeLessThanOrEqual(x);
        expect(img.flipX).toBe(false);
        expect([573.6, 626.4].some((y) => Math.abs(img.y - y) < 0.01)).toBe(true);
      }
    }
  });

  it("hides cars outside the camera view but keeps simulating them", () => {
    const { scene, images, view } = makeScene({ x: 0, y: 0, width: 300, height: 300 });
    const traffic = new TrafficSystem(scene, places, { maxCars: 40, rng: seeded() });
    for (let i = 0; i < 600; i++) traffic.update(16, RUSH);
    for (const img of shown(images)) {
      expect(img.x).toBeLessThan(view.width + 48);
      expect(img.y).toBeLessThan(view.height + 48);
    }
    expect(traffic.carCount).toBeGreaterThan(shown(images).length);
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
      for (const img of shown(images)) {
        const prev = last.get(img);
        last.set(img, { x: img.x, y: img.y });
        const moved = prev ? Math.hypot(img.x - prev.x, img.y - prev.y) : 0;
        if (!prev || moved < 1 || moved > 20) continue; // skip first sighting and pool reuse
        // The art faces west; flipX turns it east. Nose = rotated (+-1, 0).
        const nose = img.flipX ? 1 : -1;
        const nx = nose * Math.cos(img.rotation);
        const ny = nose * Math.sin(img.rotation);
        expect((nx * (img.x - prev.x) + ny * (img.y - prev.y)) / moved).toBeGreaterThan(0.99);
        expect(Math.abs(img.rotation)).toBeLessThanOrEqual(Math.PI / 2);
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
        const xs = shown(images).filter((img) => img.y === y).map((img) => img.x).sort((p, q) => p - q);
        // Shortest car is 68 px: centres at least 68 + MIN_GAP apart.
        for (let k = 1; k < xs.length; k++) expect((xs[k] ?? 0) - (xs[k - 1] ?? 0)).toBeGreaterThanOrEqual(68 + 16 - 1e-6);
      }
    }
    expect(images.length).toBeLessThanOrEqual(12);
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
