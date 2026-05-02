import type Phaser from "phaser";
import {
  CAMILLE_CARE_ROUTE_ENTRY_BLACKY_PAUSE_MS,
  CAMILLE_CARE_ROUTE_PYRAMID_PAUSE_MS,
  CAMILLE_CARE_ROUTE_WAYPOINT_PAUSE_MS,
} from "../config/gameplayConstants";

/** One waypoint on the Camille-era care circuit with dwell time at arrival. */
export interface CamilleCareWaypoint {
  x: number;
  y: number;
  pauseMs: number;
}

const DEFAULT_PAUSE = CAMILLE_CARE_ROUTE_WAYPOINT_PAUSE_MS;
const PYRAMID_PAUSE = CAMILLE_CARE_ROUTE_PYRAMID_PAUSE_MS;
const ENTRY_BLACKY_PAUSE = CAMILLE_CARE_ROUTE_ENTRY_BLACKY_PAUSE_MS;

/** Fallback world positions if a POI is missing from the tilemap (tile * 32 style). */
/** Matches shipped `public/assets/tilemaps/atg.json` spawns (world px). */
const FALLBACK: Record<string, { x: number; y: number }> = {
  spawn_blacky: { x: 411, y: 1083 },
  poi_fountain: { x: 693, y: 1316 },
  spawn_ginger: { x: 774, y: 1378 },
  poi_fountain_exchange: { x: 526, y: 1914 },
  spawn_pedigree: { x: 1152, y: 2046 },
  poi_water_bowl_3: { x: 2340, y: 1692 },
  poi_pyramid_steps: { x: 2463, y: 346 },
  poi_feeding_station_3: { x: 2816, y: 145 },
  spawn_fluffy: { x: 2818, y: 76 },
  poi_safe_sleep_central: { x: 2462, y: 255 },
  spawn_jayco: { x: 2575, y: 222 },
  poi_starbucks_water: { x: 2373, y: 65 },
  spawn_jayco_jr: { x: 2342, y: 216 },
  poi_water_bowl_2: { x: 2018, y: 166 },
  poi_library: { x: 1418, y: 552 },
  poi_water_bowl_1: { x: 1484, y: 568 },
  poi_feeding_station_1: { x: 1252, y: 542 },
  spawn_tiger: { x: 1056, y: 668 },
  poi_escalator: { x: 450, y: 1050 },
};

function px(obj: Phaser.Types.Tilemaps.TiledObject | null | undefined, fb: number): number {
  return obj?.x ?? fb;
}

function py(obj: Phaser.Types.Tilemaps.TiledObject | null | undefined, fb: number): number {
  return obj?.y ?? fb;
}

function pt(
  name: keyof typeof FALLBACK,
  find: (n: string) => Phaser.Types.Tilemaps.TiledObject | null | undefined,
  pauseMs: number,
): CamilleCareWaypoint {
  const o = find(name);
  const fb = FALLBACK[name];
  if (!fb) {
    throw new Error(`camilleCareRoute: missing fallback for ${String(name)}`);
  }
  return { x: px(o, fb.x), y: py(o, fb.y), pauseMs };
}

function underpassEntry(find: (n: string) => Phaser.Types.Tilemaps.TiledObject | null | undefined): CamilleCareWaypoint {
  const blacky = find("spawn_blacky");
  const fb = FALLBACK.spawn_blacky;
  if (!fb) {
    throw new Error("camilleCareRoute: missing fallback for spawn_blacky");
  }
  return {
    x: px(blacky, fb.x) - 50,
    y: py(blacky, fb.y),
    pauseMs: ENTRY_BLACKY_PAUSE,
  };
}

/**
 * Build Camille / Manu / Kish care-route waypoints from the ATG `spawns` layer.
 * Manu includes the feeding-station-3 / Fluffy branch; Camille and Kish do not.
 */
export function buildCamilleEraCareRoutes(
  find: (name: string) => Phaser.Types.Tilemaps.TiledObject | null | undefined,
): { camille: CamilleCareWaypoint[]; manu: CamilleCareWaypoint[]; kish: CamilleCareWaypoint[] } {
  const entry = underpassEntry(find);

  const sharedHead: CamilleCareWaypoint[] = [
    entry,
    pt("spawn_blacky", find, ENTRY_BLACKY_PAUSE),
    pt("poi_fountain", find, DEFAULT_PAUSE),
    pt("spawn_ginger", find, DEFAULT_PAUSE),
    pt("poi_fountain_exchange", find, DEFAULT_PAUSE),
    pt("spawn_pedigree", find, DEFAULT_PAUSE),
    pt("poi_water_bowl_3", find, DEFAULT_PAUSE),
    pt("poi_pyramid_steps", find, PYRAMID_PAUSE),
  ];

  const manuBranch: CamilleCareWaypoint[] = [
    pt("poi_feeding_station_3", find, DEFAULT_PAUSE),
    pt("spawn_fluffy", find, DEFAULT_PAUSE),
    pt("poi_feeding_station_3", find, DEFAULT_PAUSE),
  ];

  const sharedTail: CamilleCareWaypoint[] = [
    pt("poi_pyramid_steps", find, PYRAMID_PAUSE),
    pt("poi_safe_sleep_central", find, DEFAULT_PAUSE),
    pt("spawn_jayco", find, DEFAULT_PAUSE),
    pt("poi_starbucks_water", find, DEFAULT_PAUSE),
    pt("spawn_jayco_jr", find, DEFAULT_PAUSE),
    pt("poi_water_bowl_2", find, DEFAULT_PAUSE),
    pt("poi_library", find, DEFAULT_PAUSE),
    pt("poi_water_bowl_1", find, DEFAULT_PAUSE),
    pt("poi_feeding_station_1", find, DEFAULT_PAUSE),
    pt("spawn_tiger", find, DEFAULT_PAUSE),
    pt("poi_fountain", find, DEFAULT_PAUSE),
    pt("poi_escalator", find, DEFAULT_PAUSE),
    underpassEntry(find),
    pt("spawn_blacky", find, ENTRY_BLACKY_PAUSE),
  ];

  const camille = [...sharedHead, ...sharedTail];
  const manu = [...sharedHead, ...manuBranch, ...sharedTail];
  const kishOffset = { x: -14, y: 12 };
  const kish = camille.map((w) => ({
    x: w.x + kishOffset.x,
    y: w.y + kishOffset.y,
    pauseMs: w.pauseMs,
  }));

  return { camille, manu, kish };
}
