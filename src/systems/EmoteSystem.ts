/**
 * Shows small floating text symbols above game entities to convey mood.
 * Uses text characters (not emojis) per project conventions.
 */

import Phaser from "phaser";

export type EmoteType = "heart" | "alert" | "curious" | "sleep" | "hostile" | "danger";

const EMOTE_GLYPHS: Record<EmoteType, string> = {
  heart: "\u2665",
  alert: "!",
  curious: "?",
  sleep: "z z z",
  hostile: "!!",
  danger: "!!!",
};

const EMOTE_COLORS: Record<EmoteType, string> = {
  heart: "#e74c7c",
  alert: "#f39c12",
  curious: "#3498db",
  sleep: "#95a5a6",
  hostile: "#e74c3c",
  danger: "#c0392b",
};

/** Minimum ms between emotes on the same target to prevent spam. */
const COOLDOWN_MS = 3_000;

export class EmoteSystem {
  private cooldowns = new WeakMap<Phaser.GameObjects.Sprite, number>();

  show(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.Sprite,
    emote: EmoteType,
  ): void {
    const now = scene.time.now;
    const lastShown = this.cooldowns.get(target) ?? 0;
    if (now - lastShown < COOLDOWN_MS) return;
    this.cooldowns.set(target, now);

    const glyph = EMOTE_GLYPHS[emote];
    const color = EMOTE_COLORS[emote];

    const text = scene.add
      .text(target.x, target.y - 24, glyph, {
        fontSize: "14px",
        fontFamily: "monospace",
        color,
        stroke: "#000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(100);

    const reduced = scene.registry.get("MOTION_REDUCED") === true;
    if (reduced) {
      scene.tweens.add({
        targets: text,
        alpha: 0,
        duration: 900,
        delay: 200,
        ease: "Linear",
        onComplete: () => text.destroy(),
      });
      return;
    }

    scene.tweens.add({
      targets: text,
      y: target.y - 44,
      alpha: 0,
      duration: 1500,
      ease: "Power2",
      onComplete: () => text.destroy(),
    });
  }
}
