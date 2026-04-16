import Phaser from "phaser";

const BASE_SPEED = 120;
const RUN_SPEED = 240;
const CROUCH_SPEED = 48;
const WAKE_DELAY_MS = 500;
const CROUCH_TAP_THRESHOLD_MS = 180;

// ── Asset keys (match BootScene loaders) ──
const MC_STAND8 = "mc_stand8";
const MC_WALK_E = "mc_walk_e";
const MC_WALK_W = "mc_walk_w";
const MC_RUN_E = "mc_run_e";
const MC_RUN_W = "mc_run_w";
const MC_SIT_IDLE_E = "mc_sit_idle_e";
const MC_SIT_IDLE_W = "mc_sit_idle_w";
const MC_STAND_IDLE_E = "mc_stand_idle_e";
const MC_STAND_IDLE_W = "mc_stand_idle_w";
const MC_SLEEP = "mc_sleep";

// ── Animation keys ──
const ANIM_WALK_E = "mc-walk-e";
const ANIM_WALK_W = "mc-walk-w";
const ANIM_RUN_E = "mc-run-e";
const ANIM_RUN_W = "mc-run-w";
const ANIM_SIT_IDLE_E = "mc-sit-idle-e";
const ANIM_SIT_IDLE_W = "mc-sit-idle-w";
const ANIM_STAND_IDLE_E = "mc-stand-idle-e";
const ANIM_STAND_IDLE_W = "mc-stand-idle-w";

// ── 8-direction stand frame indices (S, SW, W, NW, N, NE, E, SE) ──
type Direction8 = "s" | "sw" | "w" | "nw" | "n" | "ne" | "e" | "se";
type Horizontal = "e" | "w";

const STAND_FRAME: Record<Direction8, number> = {
  s: 0,
  sw: 1,
  w: 2,
  nw: 3,
  n: 4,
  ne: 5,
  e: 6,
  se: 7,
};

// ── Display scale: 48px frames rendered at 32px to match other cats ──
// To revert to native 48x48 size: set NORMAL_SCALE = 1, BODY_OFFSET to (15, 26),
// REST_SCALE = 1.5, REST_BODY_OFFSET to (10, 17), LABEL_OFFSET_Y = -26.
const NORMAL_SCALE = 32 / 48;

// ── Physics body (tuned for 48x48 frames displayed at NORMAL_SCALE) ──
const BODY_W = 18;
const BODY_H = 18;
const BODY_OFFSET_X = 11;
const BODY_OFFSET_Y = 18;

// Rest uses 64x64 sleep image scaled to 32px display (32/64 = 0.5).
// To revert to old mammacat.png sleep: set REST_SCALE = 1, offsets to (7, 12),
// reload MC_OLD = "mammacat" and restore the ANIM_REST animation in createAnimations.
const REST_SCALE = 0.4;
const REST_BODY_OFFSET_X = 15;
const REST_BODY_OFFSET_Y = 24;

const LABEL_OFFSET_Y = -12;

const CROUCH_WALK_FPS = 4;

export type PlayerState = "normal" | "crouching" | "resting" | "waking";

export class MammaCat extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private crouchKey!: Phaser.Input.Keyboard.Key;
  private nameLabel: Phaser.GameObjects.Text;

  speedMultiplier = 1.0;
  isRunning = false;
  playerState: PlayerState = "normal";

  private lastDir8: Direction8 = "s";
  private lastHorizontal: Horizontal = "e";

  private crouchLatched = false;
  private crouchKeyDownTime = 0;
  private crouchHoldActive = false;

  /** Timer for the brief wake-up delay. */
  private wakeTimer = 0;

  get isCrouching(): boolean {
    return this.playerState === "crouching";
  }

  get isResting(): boolean {
    return this.playerState === "resting";
  }

  get isMoving(): boolean {
    return this.anyDirectionDown();
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, MC_STAND8, STAND_FRAME.s);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setDepth(3);

    this.setScale(NORMAL_SCALE);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(BODY_W, BODY_H);
    body.setOffset(BODY_OFFSET_X, BODY_OFFSET_Y);

    this.createAnimations(scene);

    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.shiftKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
      this.crouchKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
      this.crouchKey.on("down", this.handleCrouchKeyDown, this);
      this.crouchKey.on("up", this.handleCrouchKeyUp, this);
      this.wasd = {
        up: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }

    this.nameLabel = scene.add
      .text(x, y + LABEL_OFFSET_Y, "Mamma Cat", {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "10px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2,
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(5);
  }

  /** Update the name label to show a heart when Mamma Cat has a home. */
  setHasTerritory(claimed: boolean): void {
    this.nameLabel.setText(claimed ? "\u2665 Mamma Cat" : "Mamma Cat");
  }

  /** Enter the resting/sleep state. Called by GameScene after hold-to-rest completes. */
  enterRest(): void {
    this.playerState = "resting";
    this.crouchLatched = false;
    this.crouchKeyDownTime = 0;
    this.crouchHoldActive = false;
    this.setVelocity(0);

    // 64x64 sleep image scaled to 32px display
    this.setScale(REST_SCALE);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setOffset(REST_BODY_OFFSET_X, REST_BODY_OFFSET_Y);

    this.anims.stop();
    this.setTexture(MC_SLEEP);
    this.setAlpha(0.8);
  }

  /** Wake from rest. Returns to normal after a brief delay. */
  wakeUp(): void {
    if (this.playerState !== "resting") return;
    this.playerState = "waking";
    this.wakeTimer = WAKE_DELAY_MS;

    this.setScale(NORMAL_SCALE);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setOffset(BODY_OFFSET_X, BODY_OFFSET_Y);

    this.setAlpha(1);
    this.showStandFrame();
  }

  update(canRun = true, delta = 0): void {
    if (!this.cursors) return;

    if (this.playerState === "waking") {
      this.setVelocity(0);
      this.wakeTimer -= delta;
      if (this.wakeTimer <= 0) {
        this.playerState = "normal";
      }
      this.nameLabel.setPosition(this.x, this.y + LABEL_OFFSET_Y);
      return;
    }

    if (this.playerState === "resting") {
      this.setVelocity(0);
      this.nameLabel.setPosition(this.x, this.y + LABEL_OFFSET_Y);
      return;
    }

    this.setVelocity(0);
    this.isRunning = false;

    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;
    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const shift = this.shiftKey?.isDown ?? false;
    const crouch = this.crouchKey?.isDown ?? false;

    if (crouch && this.crouchKeyDownTime > 0) {
      const heldMs = this.scene.time.now - this.crouchKeyDownTime;
      this.crouchHoldActive = heldMs >= CROUCH_TAP_THRESHOLD_MS;
    } else {
      this.crouchHoldActive = false;
    }

    const wantsCrouch = this.crouchLatched || this.crouchHoldActive;
    const wantsRun = shift && !wantsCrouch && canRun;

    if (wantsCrouch) {
      this.playerState = "crouching";
    } else {
      this.playerState = "normal";
    }

    const speed = wantsCrouch
      ? CROUCH_SPEED * this.speedMultiplier
      : wantsRun
        ? RUN_SPEED * this.speedMultiplier
        : BASE_SPEED * this.speedMultiplier;

    let movingX = false;
    let movingY = false;

    if (left) {
      this.setVelocityX(-speed);
      movingX = true;
    } else if (right) {
      this.setVelocityX(speed);
      movingX = true;
    }

    if (up) {
      this.setVelocityY(-speed);
      movingY = true;
    } else if (down) {
      this.setVelocityY(speed);
      movingY = true;
    }

    if (movingX && movingY) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.velocity.normalize().scale(speed);
    }

    this.isRunning = wantsRun && (movingX || movingY);

    // ── Direction tracking ──
    if (movingX || movingY) {
      this.updateDirection8(left, right, up, down);
    }

    // ── Animation selection ──
    if (movingX || movingY) {
      const facingEast = this.isFacingEast();

      if (this.isRunning) {
        this.anims.play(facingEast ? ANIM_RUN_E : ANIM_RUN_W, true);
      } else {
        const walkAnim = facingEast ? ANIM_WALK_E : ANIM_WALK_W;
        this.anims.play(walkAnim, true);
        if (wantsCrouch) {
          this.anims.msPerFrame = 1000 / CROUCH_WALK_FPS;
        }
      }
    } else {
      this.playIdleAnimation(wantsCrouch);
    }

    this.nameLabel.setPosition(this.x, this.y + LABEL_OFFSET_Y);
  }

  // ──────────── Direction helpers ────────────

  private updateDirection8(left: boolean, right: boolean, up: boolean, down: boolean): void {
    if (left && down) this.lastDir8 = "sw";
    else if (left && up) this.lastDir8 = "nw";
    else if (right && down) this.lastDir8 = "se";
    else if (right && up) this.lastDir8 = "ne";
    else if (left) this.lastDir8 = "w";
    else if (right) this.lastDir8 = "e";
    else if (up) this.lastDir8 = "n";
    else if (down) this.lastDir8 = "s";

    if (left) this.lastHorizontal = "w";
    else if (right) this.lastHorizontal = "e";
  }

  /** True when the player's facing direction has an eastward component. */
  private isFacingEast(): boolean {
    switch (this.lastDir8) {
      case "e":
      case "ne":
      case "se":
        return true;
      case "w":
      case "nw":
      case "sw":
        return false;
      case "n":
      case "s":
        return this.lastHorizontal === "e";
    }
  }

  // ──────────── Idle animations ────────────

  private playIdleAnimation(crouching: boolean): void {
    if (crouching) {
      const anim = this.isFacingEast() ? ANIM_SIT_IDLE_E : ANIM_SIT_IDLE_W;
      this.anims.play(anim, true);
      return;
    }

    // Pure north/south have no animated idle — show static stand frame
    if (this.lastDir8 === "n" || this.lastDir8 === "s") {
      this.showStandFrame();
      return;
    }

    const anim = this.isFacingEast() ? ANIM_STAND_IDLE_E : ANIM_STAND_IDLE_W;
    this.anims.play(anim, true);
  }

  /** Display a single static frame from the 8-direction stand sheet. */
  private showStandFrame(): void {
    this.anims.stop();
    this.setTexture(MC_STAND8, STAND_FRAME[this.lastDir8]);
  }

  // ──────────── Input helpers ────────────

  /** True if any directional key (arrows or WASD) is pressed. */
  private anyDirectionDown(): boolean {
    if (!this.cursors) return false;
    return (
      this.cursors.left.isDown ||
      this.cursors.right.isDown ||
      this.cursors.up.isDown ||
      this.cursors.down.isDown ||
      this.wasd?.up.isDown ||
      this.wasd?.down.isDown ||
      this.wasd?.left.isDown ||
      this.wasd?.right.isDown
    );
  }

  private handleCrouchKeyDown(): void {
    this.crouchKeyDownTime = this.scene.time.now;
    this.crouchHoldActive = false;
  }

  private handleCrouchKeyUp(): void {
    const heldMs = this.crouchKeyDownTime > 0 ? this.scene.time.now - this.crouchKeyDownTime : 0;
    if (heldMs < CROUCH_TAP_THRESHOLD_MS) {
      this.crouchLatched = !this.crouchLatched;
    }
    this.crouchKeyDownTime = 0;
    this.crouchHoldActive = false;
  }

  // ──────────── Animation registration ────────────

  private createAnimations(scene: Phaser.Scene): void {
    if (scene.anims.exists(ANIM_WALK_E)) return;

    // Walk (4 frames each)
    scene.anims.create({
      key: ANIM_WALK_E,
      frames: scene.anims.generateFrameNumbers(MC_WALK_E, { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1,
    });
    scene.anims.create({
      key: ANIM_WALK_W,
      frames: scene.anims.generateFrameNumbers(MC_WALK_W, { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1,
    });

    // Run (8 frames each)
    scene.anims.create({
      key: ANIM_RUN_E,
      frames: scene.anims.generateFrameNumbers(MC_RUN_E, { start: 0, end: 7 }),
      frameRate: 12,
      repeat: -1,
    });
    scene.anims.create({
      key: ANIM_RUN_W,
      frames: scene.anims.generateFrameNumbers(MC_RUN_W, { start: 0, end: 7 }),
      frameRate: 12,
      repeat: -1,
    });

    // Standing idle (8 frames each)
    scene.anims.create({
      key: ANIM_STAND_IDLE_E,
      frames: scene.anims.generateFrameNumbers(MC_STAND_IDLE_E, { start: 0, end: 7 }),
      frameRate: 6,
      repeat: -1,
    });
    scene.anims.create({
      key: ANIM_STAND_IDLE_W,
      frames: scene.anims.generateFrameNumbers(MC_STAND_IDLE_W, { start: 0, end: 7 }),
      frameRate: 6,
      repeat: -1,
    });

    // Seated idle (10 frames each)
    scene.anims.create({
      key: ANIM_SIT_IDLE_E,
      frames: scene.anims.generateFrameNumbers(MC_SIT_IDLE_E, { start: 0, end: 9 }),
      frameRate: 4,
      repeat: -1,
    });
    scene.anims.create({
      key: ANIM_SIT_IDLE_W,
      frames: scene.anims.generateFrameNumbers(MC_SIT_IDLE_W, { start: 0, end: 9 }),
      frameRate: 4,
      repeat: -1,
    });

    // Sleep now uses a static 64x64 image (mc_sleep) set directly in enterRest().
    // No frame-based animation needed.
  }

  destroy(fromScene?: boolean): void {
    if (this.crouchKey) {
      this.crouchKey.off("down", this.handleCrouchKeyDown, this);
      this.crouchKey.off("up", this.handleCrouchKeyUp, this);
    }
    this.nameLabel.destroy();
    super.destroy(fromScene);
  }
}
