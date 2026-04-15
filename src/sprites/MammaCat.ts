import Phaser from "phaser";

const BASE_SPEED = 120;
const RUN_SPEED = 240;
const CROUCH_SPEED = 48;
const WAKE_DELAY_MS = 500;
const CROUCH_TAP_THRESHOLD_MS = 180;

const SPRITE_KEY = "mammacat";
const COLS = 8;

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
  private lastDirection: "down" | "left" | "right" | "up" = "down";
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
    super(scene, x, y, SPRITE_KEY);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setDepth(3);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(18, 18);
    body.setOffset(7, 12);

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
      .text(x, y - 12, "Mamma Cat", {
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

  /** Enter the resting/sleep state. Called by GameScene after hold-to-rest completes. */
  enterRest(): void {
    this.playerState = "resting";
    this.crouchLatched = false;
    this.crouchKeyDownTime = 0;
    this.crouchHoldActive = false;
    this.setVelocity(0);
    this.anims.play(`${SPRITE_KEY}-rest`, true);
    this.setAlpha(0.8);
  }

  /** Wake from rest. Returns to normal after a brief delay. */
  wakeUp(): void {
    if (this.playerState !== "resting") return;
    this.playerState = "waking";
    this.wakeTimer = WAKE_DELAY_MS;
    this.setAlpha(1);
    this.anims.play(`${SPRITE_KEY}-sit-${this.lastDirection}`, true);
  }

  update(canRun = true, delta = 0): void {
    if (!this.cursors) return;

    // Waking delay — cannot move for a brief moment
    if (this.playerState === "waking") {
      this.setVelocity(0);
      this.wakeTimer -= delta;
      if (this.wakeTimer <= 0) {
        this.playerState = "normal";
      }
      this.nameLabel.setPosition(this.x, this.y - 12);
      return;
    }

    // Resting — no movement, handled by GameScene
    if (this.playerState === "resting") {
      this.setVelocity(0);
      this.nameLabel.setPosition(this.x, this.y - 12);
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

    // Tap C toggles crouch latch. Holding C past threshold acts as temporary crouch.
    if (crouch && this.crouchKeyDownTime > 0) {
      const heldMs = this.scene.time.now - this.crouchKeyDownTime;
      this.crouchHoldActive = heldMs >= CROUCH_TAP_THRESHOLD_MS;
    } else {
      this.crouchHoldActive = false;
    }

    // Crouch/hide uses the dedicated C key.
    const wantsCrouch = this.crouchLatched || this.crouchHoldActive;
    // Run: Shift + any direction (but not crouching)
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

    if (movingX || movingY) {
      if (left) this.lastDirection = "left";
      else if (right) this.lastDirection = "right";
      else if (up) this.lastDirection = "up";
      else if (down) this.lastDirection = "down";

      if (this.isRunning) {
        this.anims.play(`${SPRITE_KEY}-run`, true);
      } else {
        const walkAnim = `${SPRITE_KEY}-walk`;
        if (this.scene.anims.exists(walkAnim)) {
          this.anims.play(walkAnim, true);
          if (this.anims.currentAnim?.key === walkAnim) {
            const frameRate = wantsCrouch ? 4 : 8;
            this.anims.msPerFrame = 1000 / frameRate;
          } else {
            this.anims.play(`${SPRITE_KEY}-sit-${this.lastDirection}`, true);
          }
        } else {
          this.anims.play(`${SPRITE_KEY}-sit-${this.lastDirection}`, true);
        }
      }
    } else {
      this.anims.play(`${SPRITE_KEY}-sit-${this.lastDirection}`, true);
    }

    this.nameLabel.setPosition(this.x, this.y - 12);
  }

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

  private createAnimations(scene: Phaser.Scene): void {
    if (scene.anims.exists(`${SPRITE_KEY}-sit-down`)) return;

    const row = (r: number, count = 4) => {
      const start = r * COLS;
      return { start, end: start + count - 1 };
    };

    // Rows 0-3: directional sitting (stationary/idle)
    scene.anims.create({
      key: `${SPRITE_KEY}-sit-down`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(0)),
      frameRate: 4,
      repeat: -1,
    });
    scene.anims.create({
      key: `${SPRITE_KEY}-sit-left`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(1)),
      frameRate: 4,
      repeat: -1,
    });
    scene.anims.create({
      key: `${SPRITE_KEY}-sit-right`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(2)),
      frameRate: 4,
      repeat: -1,
    });
    scene.anims.create({
      key: `${SPRITE_KEY}-sit-up`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(3)),
      frameRate: 4,
      repeat: -1,
    });
    // Row 5 (index 4): walking
    scene.anims.create({
      key: `${SPRITE_KEY}-walk`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(4, 8)),
      frameRate: 8,
      repeat: -1,
    });
    // Row 6 (index 5): running
    scene.anims.create({
      key: `${SPRITE_KEY}-run`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(5, 8)),
      frameRate: 12,
      repeat: -1,
    });
    // Row 7 (index 6): resting
    scene.anims.create({
      key: `${SPRITE_KEY}-rest`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(6, 4)),
      frameRate: 2,
      repeat: -1,
    });
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
