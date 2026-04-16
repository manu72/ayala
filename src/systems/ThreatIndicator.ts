import Phaser from "phaser";
import type { Disposition } from "../sprites/types";

interface IndicatorConfig {
  symbol: string;
  color: string;
}

const INDICATORS: Record<Disposition | "dangerous", IndicatorConfig> = {
  friendly: { symbol: "\u2665", color: "#44DD44" },
  neutral: { symbol: "\u2014", color: "#DDDD44" },
  wary: { symbol: "~", color: "#CC8800" },
  territorial: { symbol: "!", color: "#DD8800" },
  dangerous: { symbol: "\u2620", color: "#DD2222" },
};

/**
 * A floating icon + name label that tracks a parent sprite.
 * Shows disposition as a coloured symbol and displays name or "???"
 * based on whether the entity has been identified.
 */
export class ThreatIndicator {
  private icon: Phaser.GameObjects.Text;
  private label: Phaser.GameObjects.Text;
  private parent: Phaser.GameObjects.Sprite;
  private entityName: string;
  private _known = false;

  constructor(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Sprite,
    name: string,
    disposition: Disposition | "dangerous",
    known = false,
  ) {
    this.parent = parent;
    this.entityName = name;
    this._known = known;

    const cfg = INDICATORS[disposition];

    this.icon = scene.add
      .text(0, 0, cfg.symbol, {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "10px",
        color: cfg.color,
        stroke: "#000000",
        strokeThickness: 2,
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(6);

    this.label = scene.add
      .text(0, 0, known ? name : "???", {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "9px",
        color: "#cccccc",
        stroke: "#000000",
        strokeThickness: 1,
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(6);

    this.updatePosition();
  }

  get known(): boolean {
    return this._known;
  }

  /** Mark the entity as identified (shows real name). */
  reveal(): void {
    this._known = true;
    this.label.setText(this.entityName);
  }

  /** Change disposition at runtime (e.g. territorial → friendly after befriending). */
  setDisposition(d: Disposition | "dangerous"): void {
    const cfg = INDICATORS[d];
    this.icon.setText(cfg.symbol);
    this.icon.setColor(cfg.color);
  }

  update(): void {
    this.updatePosition();
  }

  private updatePosition(): void {
    this.icon.setPosition(this.parent.x, this.parent.y - 16);
    this.label.setPosition(this.parent.x, this.parent.y - 22);
  }

  destroy(): void {
    this.icon.destroy();
    this.label.destroy();
  }
}
