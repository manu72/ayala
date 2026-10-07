import { describe, expect, it } from "vitest";
import atlas from "../../public/assets/sprites/vehicles.json";
import {
  pickVehicle,
  STORY_SUV_COLOUR_CYCLE,
  STORY_VEHICLES,
  VEHICLE_CLASSES,
  type VehicleClass,
} from "../../src/data/vehicles";

const frames: Record<string, { frame: { w: number; h: number } }> = atlas.frames;

/** Real bumper-to-bumper lengths in metres; the art is 16 px per metre. */
const REAL_LENGTH_M: Record<VehicleClass, number> = {
  sedan: 4.5,
  hatch: 4.0,
  suv: 4.8,
  taxi: 4.5,
  jeepney: 6.5,
  bus: 12,
  moto: 2.0,
};

function seeded(seed = 7): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

describe("vehicle catalogue", () => {
  it("matches the generated atlas frame for frame, at real scale", () => {
    for (const [cls, spec] of Object.entries(VEHICLE_CLASSES) as [VehicleClass, (typeof VEHICLE_CLASSES)[VehicleClass]][]) {
      expect(Math.abs(spec.length / 16 - REAL_LENGTH_M[cls])).toBeLessThan(0.1);
      for (const name of spec.frames) {
        expect(frames[name], name).toBeDefined();
        expect(frames[name]?.frame.w).toBe(spec.length);
        expect(frames[name]?.frame.h).toBe(spec.width);
        expect(frames[name]?.frame.h).toBeLessThan(spec.length); // long axis along x: nose east
      }
    }
    for (const { frame, length, width } of Object.values(STORY_VEHICLES)) {
      expect(frames[frame]?.frame.w).toBe(length);
      expect(frames[frame]?.frame.h).toBe(width);
    }
    for (const frame of STORY_SUV_COLOUR_CYCLE) expect(frames[frame]?.frame.w).toBe(STORY_VEHICLES.suv.length);
    expect(atlas.meta.image).toBe("vehicles.png");
    expect(atlas.meta.size.w).toBeLessThanOrEqual(1024);
  });

  it("every atlas frame is used by traffic or the story cars", () => {
    const used = new Set<string>([
      ...Object.values(VEHICLE_CLASSES).flatMap((c) => c.frames),
      ...Object.values(STORY_VEHICLES).map((v) => v.frame),
      ...STORY_SUV_COLOUR_CYCLE,
    ]);
    expect(Object.keys(frames).filter((f) => !used.has(f))).toEqual([]);
  });

  it("mixes traffic like Makati: mostly cars, jeepneys ~12%, motorbikes ~10%, buses mostly on Ayala/Paseo", () => {
    const share = (mainRoad: boolean) => {
      const rng = seeded(3);
      const counts = new Map<string, number>();
      const n = 20000;
      for (let i = 0; i < n; i++) {
        const { frame } = pickVehicle(rng, mainRoad);
        const cls = frame.split("_")[0] ?? frame;
        counts.set(cls, (counts.get(cls) ?? 0) + 1);
      }
      return (cls: string) => (counts.get(cls) ?? 0) / n;
    };
    const main = share(true);
    const side = share(false);
    expect(main("sedan") + main("hatch") + main("suv")).toBeGreaterThan(0.55);
    expect(main("taxi")).toBeCloseTo(0.12, 1);
    expect(main("jeepney")).toBeCloseTo(0.12, 1);
    expect(main("moto")).toBeCloseTo(0.1, 1);
    expect(main("bus")).toBeCloseTo(0.04, 1);
    expect(side("bus")).toBeLessThan(0.01);
    expect(side("bus")).toBeGreaterThan(0);
  });
});
