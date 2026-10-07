import Phaser from "phaser";
import { placesOfType, type MapPlace } from "../utils/mapPlaces";

/** Above the day/night overlay (depth 50), so the light reads through the dark. */
const LIGHT_DEPTH = 51;
const POOL_TINT = 0xffd9a0;
const POOL_ALPHA = 0.32;
const HEAD_ALPHA = 0.7;

/**
 * Warm pools of light under the park's lamp posts (`lamp` places) that fade
 * in through the evening and out after dawn. Purely visual.
 */
export class NightLights {
  private readonly pools: Phaser.GameObjects.Image[] = [];
  private readonly heads: Phaser.GameObjects.Image[] = [];
  private level = -1;

  constructor(scene: Phaser.Scene, places: ReadonlyArray<MapPlace>) {
    if (!scene.textures.exists("light_glow")) return;
    for (const lamp of placesOfType(places, "lamp")) {
      // lamp place = tile centre; the post's foot is 11 px lower, the lantern 9 px higher
      const pool = scene.add.image(lamp.x, lamp.y + 8, "light_glow").setDepth(LIGHT_DEPTH).setScale(1.5, 1.1);
      const head = scene.add.image(lamp.x, lamp.y - 9, "light_glow").setDepth(LIGHT_DEPTH).setScale(0.22);
      for (const img of [pool, head]) img.setBlendMode(Phaser.BlendModes.ADD).setTint(POOL_TINT).setVisible(false);
      this.pools.push(pool);
      this.heads.push(head);
    }
  }

  /** 0 = daylight (lamps off) .. 1 = full night. */
  setLevel(level: number): void {
    const l = Math.round(Math.max(0, Math.min(1, level)) * 50) / 50; // only touch sprites when it visibly changes
    if (l === this.level) return;
    this.level = l;
    for (const img of this.pools) img.setVisible(l > 0).setAlpha(l * POOL_ALPHA);
    for (const img of this.heads) img.setVisible(l > 0).setAlpha(l * HEAD_ALPHA);
  }

  destroy(): void {
    for (const img of [...this.pools, ...this.heads]) img.destroy();
    this.pools.length = 0;
    this.heads.length = 0;
  }
}
