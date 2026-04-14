import Phaser from "phaser";
import type { TimeOfDay } from "../systems/DayNightCycle";

const COLS = 8;

export type CatState = "idle" | "walking" | "sleeping" | "alert" | "fleeing";
export type Disposition = "friendly" | "neutral" | "territorial";

export interface NPCCatConfig {
  name: string;
  spriteKey: string;
  x: number;
  y: number;
  homeZone?: { cx: number; cy: number; radius: number };
  disposition?: Disposition;
}

/**
 * Time-of-day behaviour weights. Values are relative probabilities for
 * state transitions when the current state ends.
 */
const BEHAVIOUR_WEIGHTS: Record<TimeOfDay, Record<string, number>> = {
  dawn: { idle: 0.3, walking: 0.5, sleeping: 0.1 },
  day: { idle: 0.3, walking: 0.1, sleeping: 0.5 },
  evening: { idle: 0.2, walking: 0.5, sleeping: 0.1 },
  night: { idle: 0.2, walking: 0.1, sleeping: 0.6 },
};

const WALK_SPEED = 35;
const FLEE_SPEED = 120;
const PAUSE_MIN_MS = 2_000;
const PAUSE_MAX_MS = 5_000;
const WALK_MIN_MS = 2_000;
const WALK_MAX_MS = 6_000;
const SLEEP_MIN_MS = 8_000;
const SLEEP_MAX_MS = 20_000;
const ALERT_DURATION_MS = 2_000;

export class NPCCat extends Phaser.Physics.Arcade.Sprite {
  readonly npcName: string;
  readonly config: NPCCatConfig;

  /** Current AI state. */
  state: CatState = "idle";
  disposition: Disposition;

  /** Time remaining in current state (ms). */
  private stateTimer = 0;

  /** Walking direction (unit vector). */
  private walkDir = new Phaser.Math.Vector2(0, 0);

  /** Reused for home-direction math (avoid per-frame allocations). */
  private readonly _toHomeVec = new Phaser.Math.Vector2(0, 0);

  /** Last facing direction for idle pose. */
  private lastDirection: "down" | "left" | "right" | "up" = "down";

  /** Home zone center and radius. */
  private homeX: number;
  private homeY: number;
  private homeRadius: number;

  /** Reference to the current phase (set externally each frame). */
  private currentPhase: TimeOfDay = "day";

  constructor(scene: Phaser.Scene, config: NPCCatConfig) {
    super(scene, config.x, config.y, config.spriteKey);
    this.npcName = config.name;
    this.config = config;
    this.disposition = config.disposition ?? "neutral";
    this.homeX = config.homeZone?.cx ?? config.x;
    this.homeY = config.homeZone?.cy ?? config.y;
    this.homeRadius = config.homeZone?.radius ?? 150;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(3);
    this.setCollideWorldBounds(true);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(18, 18);
    body.setOffset(7, 12);

    this.createAnimations(scene, config.spriteKey);
    this.anims.play(`${config.spriteKey}-sit-down`, true);

    this.enterState("idle");
  }

  /** Set the current time-of-day so the AI can weight behaviour. */
  setPhase(phase: TimeOfDay): void {
    this.currentPhase = phase;
  }

  /** Trigger alert state (e.g. player got too close to a territorial cat). */
  triggerAlert(): void {
    if (this.state === "fleeing") return;
    this.enterState("alert");
  }

  /** Trigger flee towards nearest shelter direction (away from threat). */
  triggerFlee(threatX: number, threatY: number): void {
    this.walkDir.set(this.x - threatX, this.y - threatY).normalize();
    this.enterState("fleeing");
  }

  update(delta: number): void {
    this.stateTimer -= delta;

    switch (this.state) {
      case "idle":
        this.setVelocity(0);
        if (this.stateTimer <= 0) this.transitionFromIdle();
        break;

      case "walking": {
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(this.walkDir.x * WALK_SPEED, this.walkDir.y * WALK_SPEED);
        this.playWalkAnim();

        // Drift back towards home zone if straying
        const distFromHome = Phaser.Math.Distance.Between(this.x, this.y, this.homeX, this.homeY);
        if (distFromHome > this.homeRadius * 0.8) {
          this._toHomeVec.set(this.homeX - this.x, this.homeY - this.y).normalize();
          this.walkDir.lerp(this._toHomeVec, 0.05);
          this.walkDir.normalize();
        }

        if (this.stateTimer <= 0) this.enterState("idle");
        break;
      }

      case "sleeping":
        this.setVelocity(0);
        if (this.stateTimer <= 0) this.enterState("idle");
        break;

      case "alert":
        this.setVelocity(0);
        if (this.stateTimer <= 0) this.enterState("idle");
        break;

      case "fleeing": {
        const fleeBody = this.body as Phaser.Physics.Arcade.Body;
        fleeBody.setVelocity(this.walkDir.x * FLEE_SPEED, this.walkDir.y * FLEE_SPEED);
        this.playWalkAnim();
        if (this.stateTimer <= 0) this.enterState("alert");
        break;
      }
    }
  }

  private enterState(next: CatState): void {
    this.state = next;

    switch (next) {
      case "idle":
        this.stateTimer = Phaser.Math.Between(PAUSE_MIN_MS, PAUSE_MAX_MS);
        this.setVelocity(0);
        this.setAlpha(1);
        this.anims.play(`${this.config.spriteKey}-sit-${this.lastDirection}`, true);
        break;

      case "walking":
        this.stateTimer = Phaser.Math.Between(WALK_MIN_MS, WALK_MAX_MS);
        this.pickWalkDirection();
        break;

      case "sleeping":
        this.stateTimer = Phaser.Math.Between(SLEEP_MIN_MS, SLEEP_MAX_MS);
        this.setVelocity(0);
        this.anims.play(`${this.config.spriteKey}-rest`, true);
        this.setAlpha(0.7);
        break;

      case "alert":
        this.stateTimer = ALERT_DURATION_MS;
        this.setVelocity(0);
        this.setAlpha(1);
        this.anims.play(`${this.config.spriteKey}-sit-${this.lastDirection}`, true);
        break;

      case "fleeing":
        this.stateTimer = 1500;
        this.setAlpha(1);
        break;
    }
  }

  private transitionFromIdle(): void {
    const weights = BEHAVIOUR_WEIGHTS[this.currentPhase];
    const next = this.weightedPick(weights);
    this.setAlpha(1);
    this.enterState(next as CatState);
  }

  private weightedPick(weights: Record<string, number>): string {
    const entries = Object.entries(weights);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = Math.random() * total;
    for (const [key, w] of entries) {
      roll -= w;
      if (roll <= 0) return key;
    }
    return entries[0]![0];
  }

  private pickWalkDirection(): void {
    // Bias toward home zone center if far away
    const distFromHome = Phaser.Math.Distance.Between(this.x, this.y, this.homeX, this.homeY);
    if (distFromHome > this.homeRadius * 0.6) {
      this._toHomeVec.set(this.homeX - this.x, this.homeY - this.y).normalize();
      this.walkDir.copy(this._toHomeVec);
      this.walkDir.x += (Math.random() - 0.5) * 0.5;
      this.walkDir.y += (Math.random() - 0.5) * 0.5;
      this.walkDir.normalize();
    } else {
      const angle = Math.random() * Math.PI * 2;
      this.walkDir.set(Math.cos(angle), Math.sin(angle));
    }
  }

  private playWalkAnim(): void {
    if (Math.abs(this.walkDir.x) > Math.abs(this.walkDir.y)) {
      this.lastDirection = this.walkDir.x < 0 ? "left" : "right";
    } else {
      this.lastDirection = this.walkDir.y < 0 ? "up" : "down";
    }

    const key = this.config.spriteKey;
    const animKey = this.state === "fleeing" ? `${key}-run` : `${key}-walk`;
    this.anims.play(animKey, true);
  }

  private createAnimations(scene: Phaser.Scene, key: string): void {
    if (scene.anims.exists(`${key}-sit-down`)) return;

    const row = (r: number, count = 4) => {
      const start = r * COLS;
      return { start, end: start + count - 1 };
    };

    // Rows 0-3: directional sitting (stationary/idle)
    scene.anims.create({
      key: `${key}-sit-down`,
      frames: scene.anims.generateFrameNumbers(key, row(0)),
      frameRate: 3,
      repeat: -1,
    });
    scene.anims.create({
      key: `${key}-sit-left`,
      frames: scene.anims.generateFrameNumbers(key, row(1)),
      frameRate: 3,
      repeat: -1,
    });
    scene.anims.create({
      key: `${key}-sit-right`,
      frames: scene.anims.generateFrameNumbers(key, row(2)),
      frameRate: 3,
      repeat: -1,
    });
    scene.anims.create({
      key: `${key}-sit-up`,
      frames: scene.anims.generateFrameNumbers(key, row(3)),
      frameRate: 3,
      repeat: -1,
    });
    // Row 5 (index 4): walking
    scene.anims.create({
      key: `${key}-walk`,
      frames: scene.anims.generateFrameNumbers(key, row(4, 8)),
      frameRate: 6,
      repeat: -1,
    });
    // Row 6 (index 5): running / fleeing
    scene.anims.create({
      key: `${key}-run`,
      frames: scene.anims.generateFrameNumbers(key, row(5, 8)),
      frameRate: 12,
      repeat: -1,
    });
    // Row 7 (index 6): resting / sleeping
    scene.anims.create({
      key: `${key}-rest`,
      frames: scene.anims.generateFrameNumbers(key, row(6, 4)),
      frameRate: 2,
      repeat: -1,
    });
  }

  destroy(fromScene?: boolean): void {
    super.destroy(fromScene);
  }
}
