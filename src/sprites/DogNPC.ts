import Phaser from "phaser";
import type { HumanNPC } from "./HumanNPC";
import type { MammaCat } from "./MammaCat";
import type { NPCCat } from "./NPCCat";
import type { EmoteSystem } from "../systems/EmoteSystem";

const BARK_RANGE = 96;
const BARK_COOLDOWN_MS = 8_000;

/**
 * A dog that follows its dog-walker owner on a short leash, weaving
 * slightly. Barks and lunges when Mamma Cat gets within range,
 * startling nearby cats.
 */
export class DogNPC extends Phaser.GameObjects.Rectangle {
  private owner: HumanNPC;
  private lastBarkTime = -Infinity;
  private isLunging = false;
  private lungeTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, owner: HumanNPC) {
    const startX = owner.x;
    const startY = owner.y + 24;
    super(scene, startX, startY, 16, 12, 0x996633);
    this.owner = owner;

    scene.add.existing(this);
    this.setDepth(3);
    this.setOrigin(0.5);
  }

  update(
    time: number,
    player: MammaCat,
    npcs: Array<{ cat: NPCCat }>,
    emotes: EmoteSystem,
    scene: Phaser.Scene,
  ): void {
    if (!this.owner.visible) {
      if (this.lungeTween) {
        this.lungeTween.stop();
        this.lungeTween = null;
      }
      this.isLunging = false;
      this.setVisible(false);
      return;
    }
    this.setVisible(true);

    // Follow owner with gentle weaving
    const offsetX = Math.sin(time * 0.002) * 16;
    if (!this.isLunging) {
      this.setPosition(this.owner.x + offsetX, this.owner.y + 24);
    }

    // Check for Mamma Cat proximity
    const distToPlayer = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    if (distToPlayer < BARK_RANGE && time - this.lastBarkTime > BARK_COOLDOWN_MS) {
      this.bark(time, player, npcs, emotes, scene);
    }
  }

  private bark(
    time: number,
    player: MammaCat,
    npcs: Array<{ cat: NPCCat }>,
    emotes: EmoteSystem,
    scene: Phaser.Scene,
  ): void {
    this.lastBarkTime = time;
    if (this.lungeTween) {
      this.lungeTween.stop();
      this.lungeTween = null;
    }
    this.isLunging = true;

    // Show bark text
    const text = scene.add
      .text(this.x, this.y - 20, "WOOF!", {
        fontSize: "12px",
        fontFamily: "monospace",
        color: "#ff4444",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(100);

    scene.tweens.add({
      targets: text,
      y: this.y - 40,
      alpha: 0,
      duration: 1200,
      ease: "Power2",
      onComplete: () => text.destroy(),
    });

    // Show alert emote on player
    emotes.show(scene, player, "alert");

    // Lunge animation toward player while leash-follow is paused
    const lungeX = this.x + (player.x - this.x) * 0.2;
    const lungeY = this.y + (player.y - this.y) * 0.2;

    this.lungeTween = scene.tweens.add({
      targets: this,
      x: lungeX,
      y: lungeY,
      duration: 200,
      yoyo: true,
      onComplete: () => {
        this.isLunging = false;
        this.lungeTween = null;
      },
    });

    // Startle nearby NPC cats
    for (const { cat } of npcs) {
      const catDist = Phaser.Math.Distance.Between(this.x, this.y, cat.x, cat.y);
      if (catDist < 128 && cat.state !== "sleeping") {
        cat.triggerAlert();
        emotes.show(scene, cat, "alert");
      }
    }
  }
}
