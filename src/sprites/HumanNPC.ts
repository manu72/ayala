import Phaser from "phaser";
import type { TimeOfDay } from "../systems/DayNightCycle";
import { BaseNPC } from "./BaseNPC";
import {
  createSpriteProfileAnimations,
  profileForType,
  type HumanType,
  type SpriteProfile,
} from "./SpriteProfiles";

export type { HumanType } from "./SpriteProfiles";

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

/**
 * A human NPC that follows a waypoint path during active time-of-day phases.
 * Invisible during inactive phases. Joggers move fast, feeders linger
 * at stations, dog walkers move at a leisurely pace.
 */
export class HumanNPC extends BaseNPC {
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

  private greetingActive = false;
  private greetingTimer = 0;
  private greetedCats = new WeakSet<object>();
  private glanceTimer = 0;

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

    if (prof.scale && prof.scale !== 1) {
      this.setScale(prof.scale);
    }

    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setSize(prof.bodyW, prof.bodyH);
    body?.setOffset(
      (prof.frameW - prof.bodyW) / 2,
      prof.frameH - prof.bodyH,
    );

    createSpriteProfileAnimations(scene, prof);
    this.setVisible(false);
    this.setActive(false);
    body?.setEnable(false);

    // Feeders no longer need a tint — they have dedicated sprites.
    // To restore the old green tint: this.setTint(0x88ff88);
  }

  get isGreeting(): boolean {
    return this.greetingActive;
  }

  get isCatPerson(): boolean {
    return (
      this.humanType === "feeder" ||
      this.humanType === "camille" ||
      this.humanType === "manu" ||
      this.humanType === "kish"
    );
  }

  startGreeting(targetX: number, targetY: number): void {
    this.greetingActive = true;
    this.setVelocity(0);

    const facingRight = targetX >= this.x;
    const crouchAnim = `${this.profile.key}-crouch-${facingRight ? "right" : "left"}`;
    if (this.scene.anims.exists(crouchAnim)) {
      this.anims.play(crouchAnim, true);
    } else {
      const dir = this.directionFromVector(
        this.scratchVec.set(targetX - this.x, targetY - this.y),
      );
      this.anims.play(`${this.profile.key}-walk-${dir}`, true);
      this.anims.pause();
    }

    const durationMs =
      this.humanType === "camille" ? 6000 : this.humanType === "kish" ? 3000 : 4000;
    this.greetingTimer = durationMs;
  }

  hasGreeted(target: object): boolean {
    return this.greetedCats.has(target);
  }

  markGreeted(target: object): void {
    this.greetedCats.add(target);
  }

  resetGreeted(): void {
    this.greetedCats = new WeakSet<object>();
  }

  glanceAt(targetX: number, targetY: number): void {
    if (this.glanceTimer > 0) return;
    this.glanceTimer = 1500;
    const dir = this.directionFromVector(
      this.scratchVec.set(targetX - this.x, targetY - this.y),
    );
    this.anims.play(`${this.profile.key}-walk-${dir}`, true);
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

    if (this.greetingActive) {
      this.setVelocity(0);
      this.greetingTimer -= delta;
      if (this.greetingTimer <= 0) {
        this.greetingActive = false;
        this.anims.play(`${key}-idle`, true);
      }
      return;
    }

    if (this.glanceTimer > 0) {
      this.glanceTimer -= delta;
    }

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
      const speedMod = this.glanceTimer > 0 ? 0.3 : 1;
      this.scratchVec.set(target.x - this.x, target.y - this.y).normalize();
      this.setVelocity(
        this.scratchVec.x * this.config.speed * speedMod,
        this.scratchVec.y * this.config.speed * speedMod,
      );
      if (this.glanceTimer <= 0) {
        this.playWalkAnim(this.scratchVec);
      }
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

  /**
   * Play a one-shot crouch animation facing toward the given world X position.
   * Stops movement while crouching. No-op if the profile has no crouch sheets.
   */
  playCrouchToward(targetX: number): void {
    const facingRight = targetX >= this.x;
    const animKey = `${this.profile.key}-crouch-${facingRight ? "right" : "left"}`;
    if (this.scene.anims.exists(animKey)) {
      this.setVelocity(0);
      this.anims.play(animKey, true);
    }
  }

  private playWalkAnim(dir: Phaser.Math.Vector2): void {
    const key = this.profile.key;
    const d = this.directionFromVector(dir);
    this.anims.play(`${key}-walk-${d}`, true);
  }
}
