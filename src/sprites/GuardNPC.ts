import Phaser from "phaser";
import type { MammaCat } from "./MammaCat";

const COLS = 8;
const SPRITE_KEY = "guard";
const PATROL_SPEED = 30;
const CHASE_SPEED = 100;
const DETECT_RANGE = 120;
const DETECT_RANGE_CROUCHING_COVER = 40;
const DETECT_RANGE_CROUCHING_OPEN = 80;
const CHASE_RANGE = 250;
const PUSHBACK_FORCE = 300;

type GuardState = "patrol" | "chasing" | "returning";

/**
 * A guard NPC that patrols near the restaurant area and chases
 * Mamma Cat away if she gets too close to the restaurant scraps.
 */
export class GuardNPC extends Phaser.Physics.Arcade.Sprite {
  private guardState: GuardState = "patrol";
  private homeX: number;
  private homeY: number;
  private patrolDir = new Phaser.Math.Vector2(1, 0);
  private patrolTimer = 0;
  private target: MammaCat | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, SPRITE_KEY);
    this.homeX = x;
    this.homeY = y;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(3);
    this.setCollideWorldBounds(true);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(18, 18);
    body.setOffset(7, 12);

    this.createAnimations(scene);
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
      const toHome = new Phaser.Math.Vector2(this.homeX - this.x, this.homeY - this.y).normalize();
      this.patrolDir.lerp(toHome, 0.1).normalize();
    }

    this.setVelocity(this.patrolDir.x * PATROL_SPEED, this.patrolDir.y * PATROL_SPEED);
    this.playWalkAnim(this.patrolDir);
  }

  private chasePlayer(): void {
    if (!this.target) return;
    const dir = new Phaser.Math.Vector2(this.target.x - this.x, this.target.y - this.y).normalize();
    this.setVelocity(dir.x * CHASE_SPEED, dir.y * CHASE_SPEED);
    this.playWalkAnim(dir);
  }

  private returnHome(): void {
    const dir = new Phaser.Math.Vector2(this.homeX - this.x, this.homeY - this.y).normalize();
    this.setVelocity(dir.x * PATROL_SPEED, dir.y * PATROL_SPEED);
    this.playWalkAnim(dir);
  }

  /** Push the player character away from the guard. */
  private pushPlayerAway(): void {
    if (!this.target) return;
    const body = this.target.body as Phaser.Physics.Arcade.Body;
    const away = new Phaser.Math.Vector2(this.target.x - this.x, this.target.y - this.y).normalize();
    body.setVelocity(away.x * PUSHBACK_FORCE, away.y * PUSHBACK_FORCE);
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

  destroy(fromScene?: boolean): void {
    super.destroy(fromScene);
  }
}
