import { describe, it, expect } from "vitest";
import type Phaser from "phaser";
import { buildCamilleEraCareRoutes } from "../../src/utils/camilleCareRoute";

describe("buildCamilleEraCareRoutes", () => {
  it("includes the Manu-only branch so Manu's path is longer than Camille's", () => {
    const FALLBACKS: Record<string, { x: number; y: number }> = {
      spawn_blacky: { x: 400, y: 1000 },
      poi_fountain: { x: 100, y: 100 },
      spawn_ginger: { x: 200, y: 200 },
      poi_fountain_exchange: { x: 300, y: 300 },
      spawn_pedigree: { x: 400, y: 400 },
      poi_water_bowl_3: { x: 500, y: 500 },
      poi_pyramid_steps: { x: 600, y: 600 },
      poi_feeding_station_3: { x: 700, y: 700 },
      spawn_fluffy: { x: 800, y: 800 },
      poi_safe_sleep_central: { x: 900, y: 900 },
      spawn_jayco: { x: 1000, y: 1000 },
      poi_starbucks_water: { x: 1100, y: 1100 },
      spawn_jayco_jr: { x: 1200, y: 1200 },
      poi_water_bowl_2: { x: 1300, y: 1300 },
      poi_library: { x: 1400, y: 1400 },
      poi_water_bowl_1: { x: 1500, y: 1500 },
      poi_feeding_station_1: { x: 1600, y: 1600 },
      spawn_tiger: { x: 1700, y: 1700 },
      poi_escalator: { x: 1800, y: 1800 },
    };

    const find = (name: string): Phaser.Types.Tilemaps.TiledObject | undefined => {
      const p = FALLBACKS[name];
      return p
        ? ({ id: 1, name, type: "", x: p.x, y: p.y, width: 32, height: 32, visible: true } as Phaser.Types.Tilemaps.TiledObject)
        : undefined;
    };

    const { camille, manu, kish } = buildCamilleEraCareRoutes(find);
    expect(manu.length).toBeGreaterThan(camille.length);
    expect(manu.length - camille.length).toBe(3);
    expect(kish.length).toBe(camille.length);
  });
});
