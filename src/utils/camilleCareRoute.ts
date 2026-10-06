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

/** Fallback world positions if a POI is missing from the tilemap; mirrors the shipped atg.json spawns (world px, tile centres). */
const FALLBACK: Record<string, { x: number; y: number }> = {
  spawn_blacky: { x: 3536, y: 2480 },
  poi_fountain: { x: 3600, y: 3536 },
  spawn_ginger: { x: 3696, y: 3536 },
  poi_fountain_exchange: { x: 3312, y: 3888 },
  spawn_pedigree: { x: 6448, y: 4656 },
  poi_water_bowl_3: { x: 6032, y: 3920 },
  poi_pyramid_steps: { x: 7152, y: 3152 },
  poi_feeding_station_3: { x: 7280, y: 2896 },
  spawn_fluffy: { x: 7184, y: 2896 },
  poi_safe_sleep_central: { x: 6384, y: 3056 },
  spawn_jayco: { x: 7088, y: 3280 },
  poi_starbucks_water: { x: 6480, y: 2928 },
  spawn_jayco_jr: { x: 6512, y: 3184 },
  poi_water_bowl_2: { x: 7184, y: 2480 },
  poi_library: { x: 4560, y: 2224 },
  poi_water_bowl_1: { x: 4656, y: 2384 },
  poi_feeding_station_1: { x: 4304, y: 2480 },
  spawn_tiger: { x: 4080, y: 2864 },
  poi_escalator: { x: 3440, y: 2480 },
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
 * A story evening can adopt an ambient care visit that is still on its rounds
 * (on the real-scale park the dawn circuit outlasts the day) instead of
 * deleting it mid-park and respawning it at the underpass. Not if it is
 * already a story visit, being torn down, or walking out of the park.
 */
export function canAdoptAmbientCareGroup(state: {
  camille: { visible: boolean; isExitingPark: boolean } | null;
  encounterActive: boolean;
  teardownPending: boolean;
}): boolean {
  return Boolean(state.camille?.visible && !state.camille.isExitingPark && !state.encounterActive && !state.teardownPending);
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
