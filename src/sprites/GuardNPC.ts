import Phaser from "phaser";
import type { MammaCat } from "./MammaCat";
import { BaseNPC } from "./BaseNPC";
import { GUARD_PROFILE, createSpriteProfileAnimations } from "./SpriteProfiles";

const SPRITE_KEY = "guard";
const PATROL_SPEED = 30;
const CHASE_SPEED = 100;
const DETECT_RANGE = 120;
const DETECT_RANGE_CROUCHING_COVER = 40;
const DETECT_RANGE_CROUCHING_OPEN = 80;
const CHASE_RANGE = 250;
const PUSHBACK_FORCE = 300;
const GUARD_FRAME_SIZE = 64;
const GUARD_BODY_WIDTH = 18;
const GUARD_BODY_HEIGHT = 16;

type GuardState = "patrol" | "chasing" | "returning";

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

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, SPRITE_KEY);
    this.homeX = x;
    this.homeY = y;

    this.setupPhysicsBody(
      GUARD_BODY_WIDTH,
      GUARD_BODY_HEIGHT,
      (GUARD_FRAME_SIZE - GUARD_BODY_WIDTH) / 2,
      GUARD_FRAME_SIZE - GUARD_BODY_HEIGHT,
    );

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

  update(delta: number): void {
    if (!this.target) return;

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
