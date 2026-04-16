import Phaser from "phaser";
import type { TimeOfDay } from "../systems/DayNightCycle";

export type HumanType = "jogger" | "feeder" | "dogwalker";

export interface HumanConfig {
  type: HumanType;
  path: Array<{ x: number; y: number }>;
  speed: number;
  activePhases: TimeOfDay[];
  /** Seconds to linger at feeding station (feeders only). */
  lingerSec?: number;
  /** Waypoint index where feeder should linger (defaults to 1). */
  lingerWaypointIndex?: number;
  /** If true, deactivate after completing one full path traversal. */
  exitAfterLinger?: boolean;
}

interface SpriteProfile {
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
  };
  anims: {
    walkDown: { row: number; count: number };
    walkLeft: { row: number; count: number };
    walkRight: { row: number; count: number };
    walkUp: { row: number; count: number };
    idle: { row: number; count: number };
  };
}

const GUARD_PROFILE: SpriteProfile = {
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

// To revert to old dogwalker.png: remove directionalKeys, set cols:7,
// frameW:50, frameH:45, and restore the old row-based anims (rows 0/2).
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

function profileForType(type: HumanType): SpriteProfile {
  switch (type) {
    case "jogger":
    case "feeder":
      return JOGGER_PROFILE;
    case "dogwalker":
      return DOGWALKER_PROFILE;
    default:
      return GUARD_PROFILE;
  }
}

/**
 * A human NPC that follows a waypoint path during active time-of-day phases.
 * Invisible during inactive phases. Joggers move fast, feeders linger
 * at stations, dog walkers move at a leisurely pace.
 */
export class HumanNPC extends Phaser.Physics.Arcade.Sprite {
  readonly humanType: HumanType;
  readonly config: HumanConfig;

  private waypointPath: Array<{ x: number; y: number }>;
  private currentWaypoint = 0;
  private activePhases: Set<TimeOfDay>;
  private isActive = false;
  private lingerTimer = 0;
  private lingering = false;
  private readonly normalizedLingerIndex: number;
  private readonly scratchVec = new Phaser.Math.Vector2(0, 0);
  private readonly profile: SpriteProfile;

  constructor(scene: Phaser.Scene, config: HumanConfig) {
    const prof = profileForType(config.type);
    const start = config.path[0]!;
    const textureKey = prof.directionalKeys?.walkDown ?? prof.key;
    super(scene, start.x, start.y, textureKey);
    this.humanType = config.type;
    this.config = config;
    this.profile = prof;
    this.waypointPath = config.path;
    this.activePhases = new Set(config.activePhases);
    const rawLingerIndex = config.lingerWaypointIndex ?? 1;
    this.normalizedLingerIndex = Math.max(
      0,
      Math.min(rawLingerIndex, this.waypointPath.length - 1),
    );

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(3);
    this.setCollideWorldBounds(true);

    if (prof.scale && prof.scale !== 1) {
      this.setScale(prof.scale);
    }

    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setSize(prof.bodyW, prof.bodyH);
    body?.setOffset(
      (prof.frameW - prof.bodyW) / 2,
      prof.frameH - prof.bodyH,
    );

    this.createAnimations(scene);
    this.setVisible(false);
    this.setActive(false);
    body?.setEnable(false);

    if (config.type === "feeder") {
      this.setTint(0x88ff88);
    }
  }

  setPhase(phase: TimeOfDay): void {
    const shouldBeActive = this.activePhases.has(phase);
    if (shouldBeActive && !this.isActive) {
      this.activate();
    } else if (!shouldBeActive && this.isActive) {
      this.deactivate();
    }
  }

  update(delta: number): void {
    if (!this.isActive) return;

    const key = this.profile.key;

    if (this.lingering) {
      this.setVelocity(0);
      this.lingerTimer -= delta;
      if (this.lingerTimer <= 0) {
        this.lingering = false;
        this.advanceWaypoint();
      }
      return;
    }

    const target = this.waypointPath[this.currentWaypoint];
    if (!target) {
      this.currentWaypoint = 0;
      return;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (dist < 20) {
      if (
        this.humanType === "feeder" &&
        this.config.lingerSec &&
        this.config.lingerSec > 0 &&
        this.currentWaypoint === this.normalizedLingerIndex
      ) {
        this.lingering = true;
        this.lingerTimer = this.config.lingerSec * 1000;
        this.setVelocity(0);
        this.anims.play(`${key}-idle`, true);
        return;
      }
      this.advanceWaypoint();
    } else {
      this.scratchVec.set(target.x - this.x, target.y - this.y).normalize();
      this.setVelocity(
        this.scratchVec.x * this.config.speed,
        this.scratchVec.y * this.config.speed,
      );
      this.playWalkAnim(this.scratchVec);
    }
  }

  private advanceWaypoint(): void {
    const next = this.currentWaypoint + 1;
    if (next >= this.waypointPath.length) {
      if (this.config.exitAfterLinger) {
        this.deactivate();
        return;
      }
      this.currentWaypoint = 0;
    } else {
      this.currentWaypoint = next;
    }
  }

  private activate(): void {
    this.isActive = true;
    this.setVisible(true);
    this.setActive(true);
    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setEnable(true);
    const start = this.waypointPath[0]!;
    if (body) {
      body.reset(start.x, start.y);
    } else {
      this.setPosition(start.x, start.y);
    }
    if (this.waypointPath.length > 1) {
      // Start at spawn waypoint 0 only when linger is explicitly configured there.
      // Otherwise begin moving to the next waypoint after spawn.
      this.currentWaypoint = this.normalizedLingerIndex === 0 ? 0 : 1;
    } else {
      this.currentWaypoint = 0;
    }
    this.lingering = false;
  }

  private deactivate(): void {
    this.isActive = false;
    this.setVisible(false);
    this.setActive(false);
    this.setVelocity(0);
    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setEnable(false);
  }

  private playWalkAnim(dir: Phaser.Math.Vector2): void {
    const key = this.profile.key;
    if (Math.abs(dir.x) > Math.abs(dir.y)) {
      this.anims.play(dir.x < 0 ? `${key}-walk-left` : `${key}-walk-right`, true);
    } else {
      this.anims.play(dir.y < 0 ? `${key}-walk-up` : `${key}-walk-down`, true);
    }
  }

  private createAnimations(scene: Phaser.Scene): void {
    const { key, cols, anims: a, directionalKeys: dk } = this.profile;
    if (scene.anims.exists(`${key}-idle`)) return;

    if (dk) {
      // Multi-sheet: each direction has its own texture (single-row strips)
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
      scene.anims.create({
        key: `${key}-idle`,
        frames: scene.anims.generateFrameNumbers(dk.walkDown, { start: 0, end: 0 }),
        frameRate: 3,
        repeat: -1,
      });
      return;
    }

    // Single-sheet: row-based frame extraction
    const row = (r: number, count: number) => ({
      start: r * cols,
      end: r * cols + count - 1,
    });

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
}
