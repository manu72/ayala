/**
 * Top-down vehicle catalogue for the `vehicles` atlas drawn by
 * scripts/generate-vehicles.mjs (16 px per metre, nose pointing east, so a
 * sprite's rotation is its heading and it is never mirrored). Pure data plus
 * the weighted pick ambient traffic uses; tests/data/vehicles.test.ts keeps
 * the sizes in step with public/assets/sprites/vehicles.json.
 */

export const VEHICLE_ATLAS = "vehicles";

export interface VehicleModel {
  frame: string;
  /** Bumper to bumper, px (the frame width). */
  length: number;
  /** Side to side, px (the frame height): how much road it needs to pass something. */
  width: number;
  /** Motorbikes: squeeze past Mamma Cat through gaps a car can't use. */
  agile?: boolean;
}

export type VehicleClass = "sedan" | "hatch" | "suv" | "taxi" | "jeepney" | "bus" | "moto";

interface ClassSpec {
  length: number;
  width: number;
  agile?: boolean;
  /** Share of traffic on Ayala Avenue / Paseo de Roxas. */
  weight: number;
  /** Share on other roads (defaults to `weight`): buses run mostly on the two main avenues. */
  sideRoadWeight?: number;
  frames: readonly string[];
}

export const VEHICLE_CLASSES: Readonly<Record<VehicleClass, ClassSpec>> = {
  sedan: {
    length: 72,
    width: 33,
    weight: 0.3,
    frames: ["sedan_white", "sedan_silver", "sedan_black", "sedan_red", "sedan_blue", "sedan_grey", "sedan_maroon", "sedan_beige"],
  },
  hatch: { length: 64, width: 32, weight: 0.14, frames: ["hatch_white", "hatch_red", "hatch_yellow", "hatch_teal", "hatch_silver"] },
  suv: { length: 77, width: 34, weight: 0.18, frames: ["suv_white", "suv_silver", "suv_black", "suv_green", "suv_navy", "suv_bronze"] },
  taxi: { length: 72, width: 33, weight: 0.12, frames: ["taxi"] },
  jeepney: { length: 104, width: 36, weight: 0.12, frames: ["jeepney_a", "jeepney_b", "jeepney_c", "jeepney_d"] },
  bus: { length: 192, width: 44, weight: 0.04, sideRoadWeight: 0.004, frames: ["bus_a", "bus_b"] },
  moto: { length: 32, width: 13, agile: true, weight: 0.1, frames: ["moto_a", "moto_b", "moto_c", "moto_d"] },
};

/** Story drop-off cars (intro cinematic and dumping events), same atlas. */
export const STORY_VEHICLES = {
  suv: { frame: "story_suv", length: 80, width: 34 },
  corolla: { frame: "story_corolla", length: 64, width: 32 },
} as const satisfies Record<string, VehicleModel>;

/** Dumping events 2+ cycle through these SUV colours (the old silver-SUV tint cycle, baked). */
export const STORY_SUV_COLOUR_CYCLE: readonly string[] = [
  "story_suv_black",
  "story_suv_yellow",
  "story_suv_green",
  "story_suv_orange",
  "story_suv_blue",
  "story_suv",
];

const CLASS_LIST = Object.values(VEHICLE_CLASSES);

/** Weighted random ambient vehicle (two rng draws: class, then colour). */
export function pickVehicle(rng: () => number, mainRoad: boolean): VehicleModel {
  const weightOf = (c: ClassSpec) => (mainRoad ? c.weight : (c.sideRoadWeight ?? c.weight));
  const total = CLASS_LIST.reduce((sum, c) => sum + weightOf(c), 0);
  let roll = rng() * total;
  let spec = CLASS_LIST[CLASS_LIST.length - 1] ?? VEHICLE_CLASSES.sedan;
  for (const c of CLASS_LIST) {
    roll -= weightOf(c);
    if (roll < 0) {
      spec = c;
      break;
    }
  }
  const frame = spec.frames[Math.min(spec.frames.length - 1, Math.floor(rng() * spec.frames.length))] ?? spec.frames[0] ?? "sedan_white";
  return { frame, length: spec.length, width: spec.width, ...(spec.agile ? { agile: true } : {}) };
}
