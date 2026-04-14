import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    this.load.image("park-tiles", "assets/tilesets/park-tiles.png");
    this.load.tilemapTiledJSON("atg", "assets/tilemaps/atg.json");

    // Cat spritesheets: 8 cols x 10 rows of 32x32 frames
    const cats = ["mammacat", "blacky", "tiger", "jayco", "fluffy"];
    for (const key of cats) {
      this.load.spritesheet(key, `assets/sprites/${key}.png`, {
        frameWidth: 32,
        frameHeight: 32,
      });
    }

    // Ginger cat strips: 64x64 frames, scaled down to 32px in-game via setScale(0.5)
    this.load.spritesheet("ginger-walk", "assets/sprites/ginger-WALK.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("ginger-idle", "assets/sprites/ginger-IDLE.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("ginger-run", "assets/sprites/ginger-RUN.png", {
      frameWidth: 64,
      frameHeight: 64,
    });

    // Guard spritesheet: 8 cols x 7 rows of 64x64 frames
    this.load.spritesheet("guard", "assets/sprites/guard.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
  }

  create(): void {
    this.scene.start("StartScene");
  }
}
