import Phaser from "phaser";
import { BaseNPC } from "./BaseNPC";

export type HumanType =
  | "jogger"
  | "jogger_male"
  | "feeder"
  | "ben"
  | "dogwalker"
  | "camille"
  | "manu"
  | "kish"
  | "snatcher";

export interface SpriteProfile {
  key: string;
  cols: number;
  frameW: number;
  frameH: number;
  bodyW: number;
  bodyH: number;
  /** Display scale (defaults to 1). */
  scale?: number;
  /**
   * Per-direction texture keys for multi-sheet sprites.
   * When set, each direction loads frames from its own spritesheet
   * instead of using row offsets within a single sheet.
   */
  directionalKeys?: {
    walkDown: string;
    walkLeft: string;
    walkRight: string;
    walkUp: string;
    /** Separate stand/idle texture. Falls back to walkDown frame 0 if absent. */
    idle?: string;
    /** One-shot crouch textures (left = west, right = east). */
    crouchLeft?: string;
    crouchRight?: string;
  };
  anims: {
    walkDown: { row: number; count: number };
    walkLeft: { row: number; count: number };
    walkRight: { row: number; count: number };
    walkUp: { row: number; count: number };
    idle: { row: number; count: number };
    crouchLeft?: { row: number; count: number };
    crouchRight?: { row: number; count: number };
  };
}

// To revert to old dogwalker.png: remove directionalKeys, set cols:7,
// frameW:50, frameH:45, and restore the old row-based anims (rows 0/2).
export const GUARD_PROFILE: SpriteProfile = {
  key: "guard",
  cols: 8,
  frameW: 64,
  frameH: 64,
  bodyW: 18,
  bodyH: 16,
  anims: {
    walkDown: { row: 0, count: 4 },
    walkLeft: { row: 1, count: 4 },
    walkRight: { row: 2, count: 4 },
    walkUp: { row: 3, count: 4 },
    idle: { row: 4, count: 3 },
  },
};

const DOGWALKER_PROFILE: SpriteProfile = {
  key: "dogwalker",
  cols: 8,
  frameW: 48,
  frameH: 48,
  bodyW: 18,
  bodyH: 16,
  directionalKeys: {
    walkDown: "dw_s",
    walkLeft: "dw_w",
    walkRight: "dw_e",
    walkUp: "dw_n",
  },
  anims: {
    walkDown: { row: 0, count: 8 },
    walkRight: { row: 0, count: 8 },
    walkLeft: { row: 0, count: 8 },
    walkUp: { row: 0, count: 8 },
    idle: { row: 0, count: 1 },
  },
};

const JOGGER_PROFILE: SpriteProfile = {
  key: "jogger",
  cols: 8,
  frameW: 150,
  frameH: 85,
  bodyW: 18,
  bodyH: 16,
  scale: 0.5,
  anims: {
    walkDown: { row: 0, count: 8 },
    walkRight: { row: 1, count: 8 },
    walkLeft: { row: 2, count: 8 },
    walkUp: { row: 3, count: 8 },
    idle: { row: 0, count: 1 },
  },
};

// Male jogger: 48x48 frames, 4 directional run sheets + stand sheet.
// Uses the directionalKeys pattern like feeder/camille.
const JOGGER_MALE_PROFILE: SpriteProfile = {
  key: "jogger_male",
  cols: 8,
  frameW: 48,
  frameH: 48,
  bodyW: 16,
  bodyH: 14,
  directionalKeys: {
    walkDown: "mjog_run_s",
    walkLeft: "mjog_run_w",
    walkRight: "mjog_run_e",
    walkUp: "mjog_run_n",
    idle: "mjog_stand",
  },
  anims: {
    walkDown: { row: 0, count: 8 },
    walkRight: { row: 0, count: 8 },
    walkLeft: { row: 0, count: 8 },
    walkUp: { row: 0, count: 8 },
    idle: { row: 0, count: 8 },
  },
};

// Feeder: 48x48 frames, east/west walk + stand. No north/south sheets yet,
// so walkDown falls back to east and walkUp to west.
// To revert to jogger placeholder: return JOGGER_PROFILE for "feeder" in profileForType.
const FEEDER_PROFILE: SpriteProfile = {
  key: "feeder",
  cols: 8,
  frameW: 48,
  frameH: 48,
  bodyW: 18,
  bodyH: 16,
  directionalKeys: {
    walkDown: "feeder_walk_e",
    walkLeft: "feeder_walk_w",
    walkRight: "feeder_walk_e",
    walkUp: "feeder_walk_w",
    idle: "feeder_stand",
  },
  anims: {
    walkDown: { row: 0, count: 8 },
    walkRight: { row: 0, count: 8 },
    walkLeft: { row: 0, count: 8 },
    walkUp: { row: 0, count: 8 },
    idle: { row: 0, count: 8 },
  },
};

// Ben: named feeder with dedicated 68x68 stand, walk, and crouch strips.
const BEN_PROFILE: SpriteProfile = {
  key: "ben",
  cols: 8,
  frameW: 68,
  frameH: 68,
  bodyW: 20,
  bodyH: 18,
  scale: 0.7,
  directionalKeys: {
    walkDown: "ben_walk_s",
    walkLeft: "ben_walk_w",
    walkRight: "ben_walk_e",
    walkUp: "ben_walk_n",
    idle: "ben_stand",
    crouchLeft: "ben_crouch_w",
    crouchRight: "ben_crouch_e",
  },
  anims: {
    walkDown: { row: 0, count: 4 },
    walkRight: { row: 0, count: 4 },
    walkLeft: { row: 0, count: 4 },
    walkUp: { row: 0, count: 4 },
    idle: { row: 0, count: 8 },
    crouchLeft: { row: 0, count: 5 },
    crouchRight: { row: 0, count: 5 },
  },
};

// Camille: 68x68 frames, scale 0.7 to match the scene's human proportions.
// Adjust scale here if she looks too big or small.
const CAMILLE_PROFILE: SpriteProfile = {
  key: "camille",
  cols: 8,
  frameW: 68,
  frameH: 68,
  bodyW: 20,
  bodyH: 18,
  scale: 0.7,
  directionalKeys: {
    walkDown: "cam_walk_s",
    walkLeft: "cam_walk_w",
    walkRight: "cam_walk_e",
    walkUp: "cam_walk_n",
    idle: "cam_stand",
    crouchLeft: "cam_crouch_w",
    crouchRight: "cam_crouch_e",
  },
  anims: {
    walkDown: { row: 0, count: 8 },
    walkRight: { row: 0, count: 8 },
    walkLeft: { row: 0, count: 8 },
    walkUp: { row: 0, count: 8 },
    idle: { row: 0, count: 1 },
    crouchLeft: { row: 0, count: 5 },
    crouchRight: { row: 0, count: 5 },
  },
};

// Manu: 68x68 frames, 1.2× taller than Camille (0.7 * 1.2 ≈ 0.84).
const MANU_PROFILE: SpriteProfile = {
  key: "manu",
  cols: 8,
  frameW: 68,
  frameH: 68,
  bodyW: 20,
  bodyH: 18,
  scale: 0.84,
  directionalKeys: {
    walkDown: "manu_walk_s",
    walkLeft: "manu_walk_w",
    walkRight: "manu_walk_e",
    walkUp: "manu_walk_n",
    idle: "manu_stand",
    crouchLeft: "manu_crouch_w",
    crouchRight: "manu_crouch_e",
  },
  anims: {
    walkDown: { row: 0, count: 8 },
    walkRight: { row: 0, count: 8 },
    walkLeft: { row: 0, count: 8 },
    walkUp: { row: 0, count: 8 },
    idle: { row: 0, count: 1 },
    crouchLeft: { row: 0, count: 5 },
    crouchRight: { row: 0, count: 5 },
  },
};

// Kish: 68x68 frames, child-sized (0.85× Camille → 0.7 * 0.85 ≈ 0.6). No crouch sheets.
const KISH_PROFILE: SpriteProfile = {
  key: "kish",
  cols: 8,
  frameW: 68,
  frameH: 68,
  bodyW: 20,
  bodyH: 18,
  scale: 0.6,
  directionalKeys: {
    walkDown: "kish_walk_s",
    walkLeft: "kish_walk_w",
    walkRight: "kish_walk_e",
    walkUp: "kish_walk_n",
    idle: "kish_stand",
  },
  anims: {
    walkDown: { row: 0, count: 8 },
    walkRight: { row: 0, count: 8 },
    walkLeft: { row: 0, count: 8 },
    walkUp: { row: 0, count: 8 },
    idle: { row: 0, count: 1 },
  },
};

// Snatcher: reuses Manu's directional sheets, tinted solid black in GameScene.
const SNATCHER_PROFILE: SpriteProfile = {
  key: "snatcher",
  cols: 8,
  frameW: 68,
  frameH: 68,
  bodyW: 20,
  bodyH: 18,
  scale: 0.9,
  directionalKeys: {
    walkDown: "manu_walk_s",
    walkLeft: "manu_walk_w",
    walkRight: "manu_walk_e",
    walkUp: "manu_walk_n",
    idle: "manu_stand",
  },
  anims: {
    walkDown: { row: 0, count: 8 },
    walkRight: { row: 0, count: 8 },
    walkLeft: { row: 0, count: 8 },
    walkUp: { row: 0, count: 8 },
    idle: { row: 0, count: 1 },
  },
};

export function profileForType(type: HumanType): SpriteProfile {
  switch (type) {
    case "jogger":
      return JOGGER_PROFILE;
    case "jogger_male":
      return JOGGER_MALE_PROFILE;
    case "feeder":
      return FEEDER_PROFILE;
    case "ben":
      return BEN_PROFILE;
    case "dogwalker":
      return DOGWALKER_PROFILE;
    case "camille":
      return CAMILLE_PROFILE;
    case "manu":
      return MANU_PROFILE;
    case "kish":
      return KISH_PROFILE;
    case "snatcher":
      return SNATCHER_PROFILE;
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unhandled HumanType: ${_exhaustive}`);
    }
  }
}

/**
 * Register Phaser animations for a sprite profile (directional multi-sheet or single-sheet rows).
 * Safe to call multiple times: skips if `${profile.key}-idle` already exists.
 */
export function createSpriteProfileAnimations(scene: Phaser.Scene, profile: SpriteProfile): void {
  const { key, cols, anims: a, directionalKeys: dk } = profile;
  if (scene.anims.exists(`${key}-idle`)) return;

  if (dk) {
    scene.anims.create({
      key: `${key}-walk-down`,
      frames: scene.anims.generateFrameNumbers(dk.walkDown, { start: 0, end: a.walkDown.count - 1 }),
      frameRate: 6,
      repeat: -1,
    });
    scene.anims.create({
      key: `${key}-walk-left`,
      frames: scene.anims.generateFrameNumbers(dk.walkLeft, { start: 0, end: a.walkLeft.count - 1 }),
      frameRate: 6,
      repeat: -1,
    });
    scene.anims.create({
      key: `${key}-walk-right`,
      frames: scene.anims.generateFrameNumbers(dk.walkRight, { start: 0, end: a.walkRight.count - 1 }),
      frameRate: 6,
      repeat: -1,
    });
    scene.anims.create({
      key: `${key}-walk-up`,
      frames: scene.anims.generateFrameNumbers(dk.walkUp, { start: 0, end: a.walkUp.count - 1 }),
      frameRate: 6,
      repeat: -1,
    });

    const idleTex = dk.idle ?? dk.walkDown;
    scene.anims.create({
      key: `${key}-idle`,
      frames: scene.anims.generateFrameNumbers(idleTex, { start: 0, end: a.idle.count - 1 }),
      frameRate: 3,
      repeat: -1,
    });

    if (dk.crouchLeft && a.crouchLeft) {
      scene.anims.create({
        key: `${key}-crouch-left`,
        frames: scene.anims.generateFrameNumbers(dk.crouchLeft, { start: 0, end: a.crouchLeft.count - 1 }),
        frameRate: 6,
        repeat: 0,
      });
    }
    if (dk.crouchRight && a.crouchRight) {
      scene.anims.create({
        key: `${key}-crouch-right`,
        frames: scene.anims.generateFrameNumbers(dk.crouchRight, { start: 0, end: a.crouchRight.count - 1 }),
        frameRate: 6,
        repeat: 0,
      });
    }

    return;
  }

  const row = (r: number, count: number) => BaseNPC.rowFrames(r, cols, count);

  scene.anims.create({
    key: `${key}-walk-down`,
    frames: scene.anims.generateFrameNumbers(key, row(a.walkDown.row, a.walkDown.count)),
    frameRate: 6,
    repeat: -1,
  });
  scene.anims.create({
    key: `${key}-walk-left`,
    frames: scene.anims.generateFrameNumbers(key, row(a.walkLeft.row, a.walkLeft.count)),
    frameRate: 6,
    repeat: -1,
  });
  scene.anims.create({
    key: `${key}-walk-right`,
    frames: scene.anims.generateFrameNumbers(key, row(a.walkRight.row, a.walkRight.count)),
    frameRate: 6,
    repeat: -1,
  });
  scene.anims.create({
    key: `${key}-walk-up`,
    frames: scene.anims.generateFrameNumbers(key, row(a.walkUp.row, a.walkUp.count)),
    frameRate: 6,
    repeat: -1,
  });
  scene.anims.create({
    key: `${key}-idle`,
    frames: scene.anims.generateFrameNumbers(key, row(a.idle.row, a.idle.count)),
    frameRate: 3,
    repeat: -1,
  });
}
