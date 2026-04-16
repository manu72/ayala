import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    this.load.image("park-tiles", "assets/tilesets/park-tiles.png");
    this.load.image("trees-pale", "assets/tilesets/trees-pale.png");
    this.load.image("plants", "assets/tilesets/plants.png");
    this.load.tilemapTiledJSON("atg", "assets/tilemaps/atg.json");

    // Cat spritesheets: 8 cols x 10 rows of 32x32 frames
    const cats = ["mammacat", "blacky", "tiger", "jayco", "fluffy"];
    for (const key of cats) {
      this.load.spritesheet(key, `assets/sprites/${key}.png`, {
        frameWidth: 32,
        frameHeight: 32,
      });
    }

    // MammaCat dedicated spritesheets (48x48 frames, single-row strips)
    const mcSheets: Array<[string, string]> = [
      ["mc_stand8", "mammacat_stand_8directions"],
      ["mc_walk_e", "mammacat_walk_east"],
      ["mc_walk_w", "mammacat_walk_west"],
      ["mc_run_e", "mammacat_run_east"],
      ["mc_run_w", "mammacat_run_west"],
      ["mc_sit_idle_e", "mammacat_seated_idle_east"],
      ["mc_sit_idle_w", "mammacat_seated_idle_west"],
      ["mc_stand_idle_e", "mammacat_standing_idle_east"],
      ["mc_stand_idle_w", "mammacat_standing_idle_west"],
    ];
    for (const [key, file] of mcSheets) {
      this.load.spritesheet(key, `assets/sprites/${file}.png`, {
        frameWidth: 48,
        frameHeight: 48,
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

    // Jogger spritesheet: 8 cols x 6 rows of 150x85 frames
    this.load.spritesheet("jogger", "assets/sprites/girl.png", {
      frameWidth: 150,
      frameHeight: 85,
    });

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
