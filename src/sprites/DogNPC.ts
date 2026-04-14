import Phaser from "phaser";
import type { HumanNPC } from "./HumanNPC";
import type { MammaCat } from "./MammaCat";
import type { NPCCat } from "./NPCCat";
import type { EmoteSystem } from "../systems/EmoteSystem";

const BARK_RANGE = 96;
const BARK_COOLDOWN_MS = 8_000;
const COLS = 4;

/**
 * A dog that follows its dog-walker owner on a short leash, weaving
 * slightly. Barks and lunges when Mamma Cat gets within range,
 * startling nearby cats. Accepts any sprite key so different dog
 * textures can be assigned.
 */
export class DogNPC extends Phaser.GameObjects.Sprite {
  private owner: HumanNPC;
  private lastBarkTime = -Infinity;
  private isLunging = false;
  private lungeTween: Phaser.Tweens.Tween | null = null;
  private barkText: Phaser.GameObjects.Text | null = null;
  private barkTextTween: Phaser.Tweens.Tween | null = null;
  private spriteKey: string;

  constructor(scene: Phaser.Scene, owner: HumanNPC, spriteKey: string) {
    const startX = owner.x;
    const startY = owner.y + 24;
    super(scene, startX, startY, spriteKey);
    this.owner = owner;
    this.spriteKey = spriteKey;

    scene.add.existing(this);
    this.setDepth(3);
    this.setOrigin(0.5);

    this.createAnimations(scene);
    this.anims.play(`${this.spriteKey}-idle`, true);
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
      this.cleanupBarkText();
      this.isLunging = false;
      this.setVisible(false);
      return;
    }
    this.setVisible(true);

    // Follow owner with gentle weaving
    const offsetX = Math.sin(time * 0.002) * 16;
    if (!this.isLunging) {
      const prevX = this.x;
      const prevY = this.y;
      const targetX = this.owner.x + offsetX;
      const targetY = this.owner.y + 24;
      this.setPosition(targetX, targetY);

      const dx = targetX - prevX;
      const dy = targetY - prevY;
      this.playMovementAnim(dx, dy);
    }

    // Check for Mamma Cat proximity
    const distToPlayer = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    if (distToPlayer < BARK_RANGE && time - this.lastBarkTime > BARK_COOLDOWN_MS) {
      this.bark(time, player, npcs, emotes, scene);
    }
  }

  private playMovementAnim(dx: number, dy: number): void {
    const speed = Math.sqrt(dx * dx + dy * dy);
    if (speed < 0.5) {
      this.anims.play(`${this.spriteKey}-idle`, true);
      return;
    }

    const prefix = speed > 3 ? "run" : "walk";
    if (Math.abs(dx) > Math.abs(dy)) {
      this.anims.play(`${this.spriteKey}-${prefix}-${dx < 0 ? "left" : "right"}`, true);
    } else {
      this.anims.play(`${this.spriteKey}-${prefix}-${dy < 0 ? "up" : "down"}`, true);
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

    this.cleanupBarkText();

    this.barkText = scene.add
      .text(this.x, this.y - 20, "WOOF!", {
        fontSize: "12px",
        fontFamily: "monospace",
        color: "#ff4444",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(100);

    this.barkTextTween = scene.tweens.add({
      targets: this.barkText,
      y: this.y - 40,
      alpha: 0,
      duration: 1200,
      ease: "Power2",
      onComplete: () => {
        this.cleanupBarkText();
      },
    });

    emotes.show(scene, player, "alert");

    // Lunge toward player while leash-follow is paused
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

    for (const { cat } of npcs) {
      const catDist = Phaser.Math.Distance.Between(this.x, this.y, cat.x, cat.y);
      if (catDist < 128 && cat.state !== "sleeping") {
        cat.triggerAlert();
        emotes.show(scene, cat, "alert");
      }
    }
  }

  private cleanupBarkText(): void {
    if (this.barkTextTween) {
      this.barkTextTween.stop();
      this.barkTextTween = null;
    }
    if (this.barkText) {
      this.barkText.destroy();
      this.barkText = null;
    }
  }

  private createAnimations(scene: Phaser.Scene): void {
    const key = this.spriteKey;
    if (scene.anims.exists(`${key}-idle`)) return;

    const row = (r: number, count = COLS) => ({
      start: r * COLS,
      end: r * COLS + count - 1,
    });

    scene.anims.create({
      key: `${key}-idle`,
      frames: scene.anims.generateFrameNumbers(key, row(0)),
      frameRate: 4,
      repeat: -1,
    });

    const walkDirs: Array<[number, string]> = [
      [1, "down"],
      [2, "left"],
      [3, "up"],
      [4, "right"],
    ];
    for (const [r, dir] of walkDirs) {
      scene.anims.create({
        key: `${key}-walk-${dir}`,
        frames: scene.anims.generateFrameNumbers(key, row(r)),
        frameRate: 6,
        repeat: -1,
      });
    }

    const runDirs: Array<[number, string]> = [
      [5, "down"],
      [6, "left"],
      [7, "up"],
      [8, "right"],
    ];
    for (const [r, dir] of runDirs) {
      scene.anims.create({
        key: `${key}-run-${dir}`,
        frames: scene.anims.generateFrameNumbers(key, row(r)),
        frameRate: 8,
        repeat: -1,
      });
    }
  }
}
