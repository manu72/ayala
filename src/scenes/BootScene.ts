import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  init(): void {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      this.registry.set("MOTION_REDUCED", false);
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.registry.set("MOTION_REDUCED", mq.matches);
    mq.addEventListener("change", () => {
      this.registry.set("MOTION_REDUCED", mq.matches);
    });
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
      ["mc_walk_n", "mammacat_walk_north"],
      ["mc_walk_s", "mammacat_walk_south"],
      ["mc_run_e", "mammacat_run_east"],
      ["mc_run_w", "mammacat_run_west"],
      ["mc_run_n", "mammacat_run_north"],
      ["mc_run_s", "mammacat_run_south"],
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

    // MammaCat sleep: single 64x64 image (scaled down at display time)
    this.load.image("mc_sleep", "assets/sprites/mammacat_sleep_64x64.png");

    // MammaCat catloaf: single 48x48 image (alert rest pose)
    this.load.image("mc_catloaf", "assets/sprites/mamma_catloaf.png");

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

    // Feeder spritesheets (48x48 frames, single-row strips)
    const feederSheets: Array<[string, string]> = [
      ["feeder_stand", "feeder_stand"],
      ["feeder_walk_e", "feeder_walk_east"],
      ["feeder_walk_w", "feeder_walk_west"],
    ];
    for (const [key, file] of feederSheets) {
      this.load.spritesheet(key, `assets/sprites/${file}.png`, {
        frameWidth: 48,
        frameHeight: 48,
      });
    }

    // Jogger spritesheet: 8 cols x 6 rows of 150x85 frames (female jogger)
    this.load.spritesheet("jogger", "assets/sprites/girl.png", {
      frameWidth: 150,
      frameHeight: 85,
    });

    // Male jogger directional spritesheets (48x48 frames, single-row strips of 8)
    const mjogSheets: Array<[string, string]> = [
      ["mjog_stand", "male_jogger_stand"],
      ["mjog_run_e", "male_jogger_run_east"],
      ["mjog_run_w", "male_jogger_run_west"],
      ["mjog_run_n", "male_jogger_run_north"],
      ["mjog_run_s", "male_jogger_run_south"],
    ];
    for (const [key, file] of mjogSheets) {
      this.load.spritesheet(key, `assets/sprites/${file}.png`, {
        frameWidth: 48,
        frameHeight: 48,
      });
    }

    // Legacy dog walker sheet (7 cols x 3 rows, 50x45) — kept for revert.
    // To revert: restore DOGWALKER_PROFILE in HumanNPC.ts to use key "dogwalker".
    this.load.spritesheet("dogwalker", "assets/sprites/dogwalker.png", {
      frameWidth: 50,
      frameHeight: 45,
    });

    // Female dog walker directional spritesheets (48x48 frames, single-row strips)
    const dwSheets: Array<[string, string]> = [
      ["dw_e", "female_dogwalker_east"],
      ["dw_w", "female_dowwalker_west"], // filename has typo ("dowwalker")
      ["dw_n", "female_dogwalker_north"],
      ["dw_s", "female_dogwalker_south"],
    ];
    for (const [key, file] of dwSheets) {
      this.load.spritesheet(key, `assets/sprites/${file}.png`, {
        frameWidth: 48,
        frameHeight: 48,
      });
    }

    // Camille spritesheets (68x68 frames, single-row strips)
    const camSheets: Array<[string, string]> = [
      ["cam_stand", "cam_stand"],
      ["cam_walk_e", "cam_walk_east"],
      ["cam_walk_w", "cam_walk_west"],
      ["cam_walk_n", "cam_walk_north"],
      ["cam_walk_s", "cam_walk_south"],
      ["cam_crouch_e", "cam_crouch_east"],
      ["cam_crouch_w", "cam_crouch_west"],
    ];
    for (const [key, file] of camSheets) {
      this.load.spritesheet(key, `assets/sprites/${file}.png`, {
        frameWidth: 68,
        frameHeight: 68,
      });
    }

    // Manu spritesheets (68x68 frames, single-row strips)
    const manuSheets: Array<[string, string]> = [
      ["manu_stand", "manu_stand"],
      ["manu_walk_e", "manu_walk_east"],
      ["manu_walk_w", "manu_walk_west"],
      ["manu_walk_n", "manu_walk_north"],
      ["manu_walk_s", "manu_walk_south"],
      ["manu_crouch_e", "manu_crouch_east"],
      ["manu_crouch_w", "manu_crouch_west"],
    ];
    for (const [key, file] of manuSheets) {
      this.load.spritesheet(key, `assets/sprites/${file}.png`, {
        frameWidth: 68,
        frameHeight: 68,
      });
    }

    // Kish spritesheets (68x68 frames, single-row strips, no crouch)
    const kishSheets: Array<[string, string]> = [
      ["kish_stand", "Kish_stand"], // capital K in filename
      ["kish_walk_e", "kish_walk_east"],
      ["kish_walk_w", "kish_walk_west"],
      ["kish_walk_n", "kish_walk_north"],
      ["kish_walk_s", "kish_walk_south"],
    ];
    for (const [key, file] of kishSheets) {
      this.load.spritesheet(key, `assets/sprites/${file}.png`, {
        frameWidth: 68,
        frameHeight: 68,
      });
    }
  }

  create(): void {
    this.scene.start("StartScene");
  }
}
