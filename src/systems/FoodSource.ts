import Phaser from "phaser";
import type { StatsSystem } from "./StatsSystem";
import type { TimeOfDay } from "./DayNightCycle";

export type SourceType = "feeding_station" | "fountain" | "restaurant_scraps" | "water_bowl" | "bugs" | "safe_sleep";

interface SourceDef {
  type: SourceType;
  stat: "hunger" | "thirst" | "energy";
  amount: number;
  cooldownMs: number;
  /** If set, only available during these phases. */
  activePhases?: TimeOfDay[];
  /** Indicator character drawn on ground. */
  symbol: string;
  symbolColor: string;
}

const DEFS: Record<SourceType, SourceDef> = {
  feeding_station: {
    type: "feeding_station",
    stat: "hunger",
    amount: 40,
    cooldownMs: 120_000,
    activePhases: ["dawn", "evening"],
    symbol: "🍽",
    symbolColor: "#ff8c00",
  },
  fountain: { type: "fountain", stat: "thirst", amount: 50, cooldownMs: 60_000, symbol: "💧", symbolColor: "#4488ff" },
  restaurant_scraps: {
    type: "restaurant_scraps",
    stat: "hunger",
    amount: 20,
    cooldownMs: 90_000,
    activePhases: ["evening"],
    symbol: "🍖",
    symbolColor: "#cc6600",
  },
  water_bowl: {
    type: "water_bowl",
    stat: "thirst",
    amount: 30,
    cooldownMs: 45_000,
    symbol: "💧",
    symbolColor: "#66aaff",
  },
  bugs: { type: "bugs", stat: "hunger", amount: 5, cooldownMs: 10_000, symbol: "·", symbolColor: "#88aa44" },
  safe_sleep: { type: "safe_sleep", stat: "energy", amount: 100, cooldownMs: 0, symbol: "★", symbolColor: "#ffdd44" },
};

const INTERACT_RANGE = 32;

interface Source {
  type: SourceType;
  x: number;
  y: number;
  marker: Phaser.GameObjects.Text;
  statusLabel: Phaser.GameObjects.Text;
  lastUsedAt: number;
}

/**
 * Manages all interactive food, water, and rest sources on the map.
 * Sources are placed based on map object-layer POIs.
 */
export class FoodSourceManager {
  private scene: Phaser.Scene;
  private sources: Source[] = [];
  private floatingTexts: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Register a source at a world position. */
  addSource(type: SourceType, worldX: number, worldY: number): void {
    const def = DEFS[type];

    const marker = this.scene.add
      .text(worldX, worldY, def.symbol, {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: type === "bugs" ? "8px" : "12px",
        color: def.symbolColor,
        stroke: "#000000",
        strokeThickness: 1,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(2);

    const statusLabel = this.scene.add
      .text(worldX, worldY + 14, "", {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "8px",
        color: "#aaaaaa",
        stroke: "#000000",
        strokeThickness: 1,
        resolution: 2,
      })
      .setOrigin(0.5, 0)
      .setDepth(2);

    this.sources.push({
      type,
      x: worldX,
      y: worldY,
      marker,
      statusLabel,
      // Start sources as immediately available at time ~0 without using -Infinity.
      lastUsedAt: -def.cooldownMs,
    });
  }

  /** Scatter bug sources on non-colliding tiles. */
  addBugSpawns(map: Phaser.Tilemaps.Tilemap, count: number): void {
    const mapW = map.widthInPixels;
    const mapH = map.heightInPixels;
    const objectsLayer = map.getLayer('objects')?.tilemapLayer ?? null;
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 10) {
      attempts++;
      const x = Phaser.Math.Between(100, mapW - 100);
      const y = Phaser.Math.Between(100, mapH - 100);
      if (objectsLayer) {
        const tile = objectsLayer.getTileAtWorldXY(x, y);
        if (tile?.collides) continue;
      }
      this.addSource("bugs", x, y);
      placed++;
    }
  }

  /** Try to interact with the nearest available source in range. Returns true if used. */
  tryInteract(playerX: number, playerY: number, stats: StatsSystem, currentPhase: TimeOfDay, now: number): boolean {
    let nearest: Source | null = null;
    let nearestDist = Infinity;

    for (const src of this.sources) {
      const def = DEFS[src.type];
      // Safe sleep should only restore energy through hold-to-rest (Z), not Space interact.
      if (src.type === "safe_sleep") continue;
      if (def.activePhases && !def.activePhases.includes(currentPhase)) continue;
      if (def.cooldownMs > 0 && now - src.lastUsedAt < def.cooldownMs) continue;

      const dist = Phaser.Math.Distance.Between(playerX, playerY, src.x, src.y);
      if (dist < INTERACT_RANGE && dist < nearestDist) {
        nearest = src;
        nearestDist = dist;
      }
    }

    if (!nearest) return false;

    const def = DEFS[nearest.type];
    const actual = stats.restore(def.stat, def.amount);
    nearest.lastUsedAt = now;

    this.showFloatingText(`+${Math.round(actual)}`, nearest.x, nearest.y - 16, def.symbolColor);

    return true;
  }

  /** Update markers to reflect availability. */
  update(currentPhase: TimeOfDay, now: number): void {
    for (const src of this.sources) {
      const def = DEFS[src.type];

      const phaseOk = !def.activePhases || def.activePhases.includes(currentPhase);
      const cooldownOk = def.cooldownMs <= 0 || now - src.lastUsedAt >= def.cooldownMs;

      if (!phaseOk) {
        src.marker.setAlpha(0.3);
        src.statusLabel.setText("inactive");
      } else if (!cooldownOk) {
        src.marker.setAlpha(0.5);
        const remaining = Math.ceil((def.cooldownMs - (now - src.lastUsedAt)) / 1000);
        src.statusLabel.setText(`${remaining}s`);
      } else {
        src.marker.setAlpha(1);
        src.statusLabel.setText("");
      }
    }

    // Clean up expired floating texts
    this.floatingTexts = this.floatingTexts.filter((t) => t.active);
  }

  private showFloatingText(text: string, x: number, y: number, color: string): void {
    const ft = this.scene.add
      .text(x, y, text, {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "10px",
        color,
        stroke: "#000000",
        strokeThickness: 2,
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(100);

    this.floatingTexts.push(ft);

    this.scene.tweens.add({
      targets: ft,
      y: y - 30,
      alpha: 0,
      duration: 1200,
      ease: "Cubic.easeOut",
      onComplete: () => ft.destroy(),
    });
  }

  /** Return all source positions for save/serialisation. */
  getSourceStates(): Array<{ type: SourceType; x: number; y: number; lastUsedAt: number }> {
    return this.sources.map((s) => ({
      type: s.type,
      x: s.x,
      y: s.y,
      lastUsedAt: s.lastUsedAt,
    }));
  }

  /** Rebuild sources from saved state (positions only; cooldowns reset to available). */
  restoreFromStates(states: Array<{ type: SourceType; x: number; y: number; lastUsedAt: number }>): void {
    for (const s of this.sources) {
      s.marker.destroy();
      s.statusLabel.destroy();
    }
    this.sources = [];

    for (const state of states) {
      this.addSource(state.type, state.x, state.y);
    }
  }
}
