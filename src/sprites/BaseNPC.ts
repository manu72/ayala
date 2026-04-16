import Phaser from "phaser";

export type CardinalDirection = "left" | "right" | "up" | "down";

/**
 * Shared base for physics-based NPCs: scene registration, depth, world bounds,
 * and helpers used by multiple sprite classes (direction from movement, sheet rows).
 */
export abstract class BaseNPC extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, frame?: string | number) {
    super(scene, x, y, texture, frame);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(3);
    this.setCollideWorldBounds(true);
  }

  protected setupPhysicsBody(w: number, h: number, offsetX: number, offsetY: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(w, h);
    body.setOffset(offsetX, offsetY);
  }

  protected directionFromVector(dir: Phaser.Math.Vector2): CardinalDirection {
    return BaseNPC.directionFromComponents(dir.x, dir.y);
  }

  /** Frame index range for a row in a fixed-column spritesheet. */
  static rowFrames(rowIndex: number, columnCount: number, frameCount?: number): { start: number; end: number } {
    const count = frameCount ?? columnCount;
    const start = rowIndex * columnCount;
    return { start, end: start + count - 1 };
  }

  static directionFromComponents(dx: number, dy: number): CardinalDirection {
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx < 0 ? "left" : "right";
    }
    return dy < 0 ? "up" : "down";
  }
}
