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
}

const SPRITE_KEY = "guard";
const COLS = 8;
const FRAME_SIZE = 64;
const BODY_W = 18;
const BODY_H = 16;

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
  private readonly scratchVec = new Phaser.Math.Vector2(0, 0);

  constructor(scene: Phaser.Scene, config: HumanConfig) {
    const start = config.path[0]!;
    super(scene, start.x, start.y, SPRITE_KEY);
    this.humanType = config.type;
    this.config = config;
    this.waypointPath = config.path;
    this.activePhases = new Set(config.activePhases);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(3);
    this.setCollideWorldBounds(true);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(BODY_W, BODY_H);
    body.setOffset((FRAME_SIZE - BODY_W) / 2, FRAME_SIZE - BODY_H);

    this.createAnimations(scene);
    this.setVisible(false);
    this.setActive(false);

    // Tint to differentiate human types
    switch (config.type) {
      case "jogger":
        this.setTint(0x88aaff);
        break;
      case "feeder":
        this.setTint(0x88ff88);
        break;
      case "dogwalker":
        this.setTint(0xddcc88);
        break;
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

    // Feeder lingering at station
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
    if (dist < 8) {
      // Reached waypoint
      if (
        this.humanType === "feeder" &&
        this.config.lingerSec &&
        this.config.lingerSec > 0 &&
        this.currentWaypoint === (this.config.lingerWaypointIndex ?? 1)
      ) {
        this.lingering = true;
        this.lingerTimer = this.config.lingerSec * 1000;
        this.setVelocity(0);
        this.anims.play(`${SPRITE_KEY}-idle`, true);
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
    this.currentWaypoint = (this.currentWaypoint + 1) % this.waypointPath.length;
  }

  private activate(): void {
    this.isActive = true;
    this.setVisible(true);
    this.setActive(true);
    const start = this.waypointPath[0]!;
    this.setPosition(start.x, start.y);
    // Feeders spawn at waypoint 0 and should head to configured station first.
    if (this.humanType === "feeder" && this.waypointPath.length > 1) {
      const targetIdx = this.config.lingerWaypointIndex ?? 1;
      this.currentWaypoint = Math.max(0, Math.min(targetIdx, this.waypointPath.length - 1));
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
  }

  private playWalkAnim(dir: Phaser.Math.Vector2): void {
    if (Math.abs(dir.x) > Math.abs(dir.y)) {
      this.anims.play(dir.x < 0 ? `${SPRITE_KEY}-walk-left` : `${SPRITE_KEY}-walk-right`, true);
    } else {
      this.anims.play(dir.y < 0 ? `${SPRITE_KEY}-walk-up` : `${SPRITE_KEY}-walk-down`, true);
    }
  }

  private createAnimations(scene: Phaser.Scene): void {
    if (scene.anims.exists(`${SPRITE_KEY}-idle`)) return;

    const row = (r: number, count = 4) => {
      const start = r * COLS;
      return { start, end: start + count - 1 };
    };

    scene.anims.create({
      key: `${SPRITE_KEY}-walk-down`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(0)),
      frameRate: 6,
      repeat: -1,
    });
    scene.anims.create({
      key: `${SPRITE_KEY}-walk-left`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(1)),
      frameRate: 6,
      repeat: -1,
    });
    scene.anims.create({
      key: `${SPRITE_KEY}-walk-right`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(2)),
      frameRate: 6,
      repeat: -1,
    });
    scene.anims.create({
      key: `${SPRITE_KEY}-walk-up`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(3)),
      frameRate: 6,
      repeat: -1,
    });
    scene.anims.create({
      key: `${SPRITE_KEY}-idle`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(4, 3)),
      frameRate: 3,
      repeat: -1,
    });
  }
}
