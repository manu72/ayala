import Phaser from "phaser";
import type { MammaCat } from "./MammaCat";
import { BaseNPC, type CardinalDirection } from "./BaseNPC";
import { GUARD_PROFILE, createSpriteProfileAnimations } from "./SpriteProfiles";
import type { EmoteSystem } from "../systems/EmoteSystem";

const SPRITE_KEY = "guard";
const PATROL_SPEED = 30;
const CHASE_SPEED = 100;
const DETECT_RANGE = 120;
const DETECT_RANGE_CROUCHING_COVER = 40;
const DETECT_RANGE_CROUCHING_OPEN = 80;
const CHASE_RANGE = 250;
const PUSHBACK_FORCE = 300;
const GUARD_FRAME_SIZE = 64;
/** World-px feet box, the same as when the guard was drawn at scale 1. */
const GUARD_BODY_WIDTH = 18;
const GUARD_BODY_HEIGHT = 16;
/** guard.png draws a ~51 px figure; this brings it to the other humans' ~37 px (Camille, Ben, Kish). */
export const GUARD_SCALE = 0.72;
/** Frame row of the top of the guard's head (feet are on the frame's bottom edge). */
const GUARD_HEAD_ROW = 13;
/**
 * How much lower the top of the head sits than at scale 1 (the feet stay put),
 * for markers placed at fixed offsets above the sprite's (x, y): the threat
 * indicator and emotes.
 */
export const GUARD_HEAD_DROP_PX = Math.round((1 - GUARD_SCALE) * (GUARD_FRAME_SIZE - GUARD_HEAD_ROW));

type GuardState = "patrol" | "chasing" | "returning";

/**
 * hostile: the original restaurant guard (patrol, detect, chase, shove, return).
 * passive: on duty near the post, never chases.
 * friendly: like passive, but stops and looks at Mamma Cat when she comes close.
 */
export type GuardDisposition = "hostile" | "passive" | "friendly";

export interface GuardOptions {
  /** Defaults to "hostile", i.e. exactly the original guard. */
  disposition?: GuardDisposition;
  /** Friendly guards show a heart/curious emote on THEMSELVES (never on the player). */
  emotes?: EmoteSystem;
}

// Calm (passive / friendly) duty tuning. Never used by hostile guards.
const NOTICE_RANGE = 64;
const NOTICE_REARM_RANGE = 112;
const NOTICE_MS = 2500;
const POST_STAND_MS = [4000, 9000] as const;
const POST_WALK_MS = [3000, 6000] as const;
/** guard.png row 0 standing rotations: col 0 faces S, 2 W, 4 N, 6 E (checked against the pistol side). */
const FACING_FRAME: Record<CardinalDirection, number> = { down: 0, left: 2, up: 4, right: 6 };

/**
 * A guard NPC that patrols near the restaurant area and chases
 * Mamma Cat away if she gets too close to the restaurant scraps.
 */
export class GuardNPC extends BaseNPC {
  private guardState: GuardState = "patrol";
  private homeX: number;
  private homeY: number;
  private patrolDir = new Phaser.Math.Vector2(1, 0);
  private readonly scratchVec = new Phaser.Math.Vector2(0, 0);
  private patrolTimer = 0;
  private target: MammaCat | null = null;
  readonly disposition: GuardDisposition;
  private readonly emotes: EmoteSystem | null;
  private standing = true;
  private dutyTimer = 0;
  private noticeMs = 0;
  private noticeArmed = true;

  constructor(scene: Phaser.Scene, x: number, y: number, options: GuardOptions = {}) {
    super(scene, x, y, SPRITE_KEY);
    this.homeX = x;
    this.homeY = y;
    this.disposition = options.disposition ?? "hostile";
    this.emotes = options.emotes ?? null;

    // Shrink about the feet: they stay GUARD_FRAME_SIZE / 2 below (x, y), as at
    // scale 1, so posts, spawns and every distance check (all from x, y) are unchanged.
    this.setScale(GUARD_SCALE);
    this.setOrigin(0.5, 1 - 0.5 / GUARD_SCALE);
    // Arcade sizes and offsets the body in frame px and then applies the scale;
    // dividing by it keeps the exact 18 x 16 world-px feet box of the scale-1 guard.
    const bodyW = GUARD_BODY_WIDTH / GUARD_SCALE;
    const bodyH = GUARD_BODY_HEIGHT / GUARD_SCALE;
    this.setupPhysicsBody(bodyW, bodyH, (GUARD_FRAME_SIZE - bodyW) / 2, GUARD_FRAME_SIZE - bodyH);

    createSpriteProfileAnimations(scene, GUARD_PROFILE);
    this.anims.play(`${SPRITE_KEY}-idle`, true);
  }

  setTarget(player: MammaCat): void {
    this.target = player;
  }

  private getEffectiveDetectRange(): number {
    if (!this.target?.isCrouching) return DETECT_RANGE;
    // Player is crouching near cover (overhead tile) → much harder to detect
    const gameScene = this.scene as { isUnderCanopy?: (x: number, y: number) => boolean };
    const nearCover = gameScene.isUnderCanopy?.(this.target.x, this.target.y) ?? false;
    return nearCover ? DETECT_RANGE_CROUCHING_COVER : DETECT_RANGE_CROUCHING_OPEN;
  }

  /** Snap back to the post in a calm patrol state (used when a guard comes on duty). */
  resetToPost(): void {
    this.guardState = "patrol";
    this.noticeMs = 0;
    this.noticeArmed = true;
    (this.body as Phaser.Physics.Arcade.Body).reset(this.homeX, this.homeY);
    this.setVelocity(0);
  }

  /** Friendly duty: stop and look at her for `ms` (while he tells her something). */
  holdFor(ms: number): void {
    if (this.disposition !== "friendly") return;
    this.noticeMs = Math.max(this.noticeMs, ms);
    this.setVelocity(0);
  }

  update(delta: number): void {
    if (!this.target) return;
    if (this.disposition !== "hostile") {
      this.updateCalm(delta, this.target);
      return;
    }

    const distToPlayer = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
    const distToHome = Phaser.Math.Distance.Between(this.x, this.y, this.homeX, this.homeY);

    switch (this.guardState) {
      case "patrol":
        this.patrol(delta);
        if (distToPlayer < this.getEffectiveDetectRange()) {
          this.guardState = "chasing";
        }
        break;

      case "chasing":
        this.chasePlayer();
        if (distToPlayer < 30) {
          this.pushPlayerAway();
          this.guardState = "returning";
        }
        if (distToPlayer > CHASE_RANGE || distToHome > CHASE_RANGE) {
          this.guardState = "returning";
        }
        break;

      case "returning":
        this.returnHome();
        if (distToHome < 20) {
          this.guardState = "patrol";
          this.setVelocity(0);
          this.anims.play(`${SPRITE_KEY}-idle`, true);
        }
        break;
    }
  }

  /** Passive / friendly duty: stand at the post, stroll a little, never chase or touch the player. */
  private updateCalm(delta: number, target: MammaCat): void {
    const distToPlayer = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (this.disposition === "friendly") {
      if (this.noticeMs > 0) {
        this.noticeMs -= delta;
        this.setVelocity(0);
        this.faceToward(target.x, target.y);
        return;
      }
      if (this.noticeArmed && distToPlayer < NOTICE_RANGE) {
        this.noticeArmed = false;
        this.noticeMs = NOTICE_MS;
        this.setVelocity(0);
        this.faceToward(target.x, target.y);
        this.emotes?.show(this.scene, this, Math.random() < 0.6 ? "heart" : "curious", GUARD_HEAD_DROP_PX);
        return;
      }
      if (distToPlayer > NOTICE_REARM_RANGE) this.noticeArmed = true;
    }

    this.dutyTimer -= delta;
    if (this.standing) {
      this.setVelocity(0);
      if (this.dutyTimer <= 0) {
        this.standing = false;
        this.dutyTimer = Phaser.Math.Between(POST_WALK_MS[0], POST_WALK_MS[1]);
      }
      return;
    }
    this.patrol(delta);
    if (this.dutyTimer <= 0) {
      this.standing = true;
      this.dutyTimer = Phaser.Math.Between(POST_STAND_MS[0], POST_STAND_MS[1]);
      this.setVelocity(0);
      this.anims.stop();
      this.setFrame(FACING_FRAME[this.directionFromVector(this.patrolDir)]);
    }
  }

  private faceToward(x: number, y: number): void {
    this.anims.stop();
    this.setFrame(FACING_FRAME[BaseNPC.directionFromComponents(x - this.x, y - this.y)]);
  }

  private patrol(delta: number): void {
    this.patrolTimer -= delta;
    if (this.patrolTimer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      this.patrolDir.set(Math.cos(angle), Math.sin(angle));
      this.patrolTimer = Phaser.Math.Between(3000, 6000);
    }

    // Keep near home
    const distToHome = Phaser.Math.Distance.Between(this.x, this.y, this.homeX, this.homeY);
    if (distToHome > 80) {
      this.scratchVec.set(this.homeX - this.x, this.homeY - this.y).normalize();
      this.patrolDir.lerp(this.scratchVec, 0.1).normalize();
    }

    this.setVelocity(this.patrolDir.x * PATROL_SPEED, this.patrolDir.y * PATROL_SPEED);
    this.playWalkAnim(this.patrolDir);
  }

  private chasePlayer(): void {
    if (!this.target) return;
    this.scratchVec.set(this.target.x - this.x, this.target.y - this.y).normalize();
    this.setVelocity(this.scratchVec.x * CHASE_SPEED, this.scratchVec.y * CHASE_SPEED);
    this.playWalkAnim(this.scratchVec);
  }

  private returnHome(): void {
    this.scratchVec.set(this.homeX - this.x, this.homeY - this.y).normalize();
    this.setVelocity(this.scratchVec.x * PATROL_SPEED, this.scratchVec.y * PATROL_SPEED);
    this.playWalkAnim(this.scratchVec);
  }

  /** Push the player character away from the guard. */
  private pushPlayerAway(): void {
    if (!this.target) return;
    const body = this.target.body as Phaser.Physics.Arcade.Body;
    this.scratchVec.set(this.target.x - this.x, this.target.y - this.y).normalize();
    body.setVelocity(this.scratchVec.x * PUSHBACK_FORCE, this.scratchVec.y * PUSHBACK_FORCE);
  }

  private playWalkAnim(dir: Phaser.Math.Vector2): void {
    const d = this.directionFromVector(dir);
    this.anims.play(`${SPRITE_KEY}-walk-${d}`, true);
  }

  destroy(fromScene?: boolean): void {
    super.destroy(fromScene);
  }
}
