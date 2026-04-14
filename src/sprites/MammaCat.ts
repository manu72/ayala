import Phaser from 'phaser'

const BASE_SPEED = 120
const RUN_SPEED = 200

const SPRITE_KEY = 'mammacat'
const COLS = 8

export class MammaCat extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private runKey!: Phaser.Input.Keyboard.Key
  private nameLabel: Phaser.GameObjects.Text

  /** Externally set by GameScene each frame based on stats. */
  speedMultiplier = 1.0

  /** True if the player is pressing the run key and canRun is true. */
  isRunning = false

  /** True if the player is moving (walking or running). */
  get isMoving(): boolean {
    if (!this.cursors) return false
    return this.cursors.left.isDown || this.cursors.right.isDown
      || this.cursors.up.isDown || this.cursors.down.isDown
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, SPRITE_KEY)

    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setCollideWorldBounds(true)
    this.setDepth(3)

    const body = this.body as Phaser.Physics.Arcade.Body
    body.setSize(18, 18)
    body.setOffset(7, 12)

    this.createAnimations(scene)

    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys()
      this.runKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
    }

    this.nameLabel = scene.add.text(x, y - 20, 'Mamma Cat', {
      fontSize: '10px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(5)
  }

  private createAnimations(scene: Phaser.Scene): void {
    if (scene.anims.exists(`${SPRITE_KEY}-walk-down`)) return

    const row = (r: number, count = 4) => {
      const start = r * COLS
      return { start, end: start + count - 1 }
    }

    scene.anims.create({ key: `${SPRITE_KEY}-walk-down`, frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(0)), frameRate: 8, repeat: -1 })
    scene.anims.create({ key: `${SPRITE_KEY}-walk-left`, frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(1)), frameRate: 8, repeat: -1 })
    scene.anims.create({ key: `${SPRITE_KEY}-walk-right`, frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(2)), frameRate: 8, repeat: -1 })
    scene.anims.create({ key: `${SPRITE_KEY}-walk-up`, frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(3)), frameRate: 8, repeat: -1 })
    scene.anims.create({ key: `${SPRITE_KEY}-idle`, frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(4, 3)), frameRate: 4, repeat: -1 })
  }

  update(canRun = true): void {
    if (!this.cursors) return

    this.setVelocity(0)
    this.isRunning = false

    let movingX = false
    let movingY = false

    const wantsRun = this.runKey?.isDown && canRun
    const speed = (wantsRun ? RUN_SPEED : BASE_SPEED) * this.speedMultiplier

    if (this.cursors.left.isDown) { this.setVelocityX(-speed); movingX = true }
    else if (this.cursors.right.isDown) { this.setVelocityX(speed); movingX = true }

    if (this.cursors.up.isDown) { this.setVelocityY(-speed); movingY = true }
    else if (this.cursors.down.isDown) { this.setVelocityY(speed); movingY = true }

    if (movingX && movingY) {
      const body = this.body as Phaser.Physics.Arcade.Body
      body.velocity.normalize().scale(speed)
    }

    this.isRunning = wantsRun && (movingX || movingY)

    const frameRate = this.isRunning ? 12 : 8

    if (movingX || movingY) {
      if (this.cursors.left.isDown) this.anims.play(`${SPRITE_KEY}-walk-left`, true)
      else if (this.cursors.right.isDown) this.anims.play(`${SPRITE_KEY}-walk-right`, true)
      else if (this.cursors.up.isDown) this.anims.play(`${SPRITE_KEY}-walk-up`, true)
      else if (this.cursors.down.isDown) this.anims.play(`${SPRITE_KEY}-walk-down`, true)

      if (this.anims.currentAnim) {
        this.anims.currentAnim.frameRate = frameRate
      }
    } else {
      this.anims.play(`${SPRITE_KEY}-idle`, true)
    }

    this.nameLabel.setPosition(this.x, this.y - 20)
  }

  destroy(fromScene?: boolean): void {
    this.nameLabel.destroy()
    super.destroy(fromScene)
  }
}
