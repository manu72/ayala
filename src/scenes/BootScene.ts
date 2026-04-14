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

    // Guard spritesheet: 8 cols x 7 rows of 64x64 frames
    this.load.spritesheet("guard", "assets/sprites/guard.png", {
      frameWidth: 64,
      frameHeight: 64,
    });

    // Dog spritesheets: 4 cols x 9 rows of 32x32 frames
    const dogs = ["SmallDog", "WhiteDog", "BrownDog"];
    for (const key of dogs) {
      this.load.spritesheet(key, `assets/sprites/${key}.png`, {
        frameWidth: 32,
        frameHeight: 32,
      });
    }

    // Dog walker human spritesheet: 7 cols x 3 rows of 50x45 frames
    this.load.spritesheet("dogwalker", "assets/sprites/dogwalker.png", {
      frameWidth: 50,
      frameHeight: 45,
    });
  }

  create(): void {
    this.scene.start("StartScene");
  }
}
