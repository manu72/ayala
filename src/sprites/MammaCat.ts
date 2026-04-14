import Phaser from 'phaser'

const SPEED = 120

/**
 * Spritesheet layout (8 cols x 10 rows, 32x32 frames):
 *   Row 0 (frames 0-7):  walk down / facing camera
 *   Row 1 (frames 8-15): walk left
 *   Row 2 (frames 16-23): walk right
 *   Row 3 (frames 24-31): walk up / facing away
 *   Row 4+ : additional poses (idle, sit, sleep, etc.)
 *
 * We use first 4 frames of rows 0-3 for walk cycles
 * and row 4 frames for idle.
 */
const SPRITE_KEY = 'mammacat'
const COLS = 8

export class MammaCat extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private nameLabel: Phaser.GameObjects.Text

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
    }

    this.nameLabel = scene.add.text(x, y - 20, 'Mamma Cat', {
      fontSize: '10px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(5)
  }

  private createAnimations(scene: Phaser.Scene): void {
    const row = (r: number, count = 4) => {
      const start = r * COLS
      return { start, end: start + count - 1 }
    }

    scene.anims.create({
      key: `${SPRITE_KEY}-walk-down`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(0)),
      frameRate: 8,
      repeat: -1,
    })
    scene.anims.create({
      key: `${SPRITE_KEY}-walk-left`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(1)),
      frameRate: 8,
      repeat: -1,
    })
    scene.anims.create({
      key: `${SPRITE_KEY}-walk-right`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(2)),
      frameRate: 8,
      repeat: -1,
    })
    scene.anims.create({
      key: `${SPRITE_KEY}-walk-up`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(3)),
      frameRate: 8,
      repeat: -1,
    })
    scene.anims.create({
      key: `${SPRITE_KEY}-idle`,
      frames: scene.anims.generateFrameNumbers(SPRITE_KEY, row(4, 3)),
      frameRate: 4,
      repeat: -1,
    })
  }

  update(): void {
    if (!this.cursors) return

    this.setVelocity(0)

    let movingX = false
    let movingY = false

    if (this.cursors.left.isDown) {
      this.setVelocityX(-SPEED)
      movingX = true
    } else if (this.cursors.right.isDown) {
      this.setVelocityX(SPEED)
      movingX = true
    }

    if (this.cursors.up.isDown) {
      this.setVelocityY(-SPEED)
      movingY = true
    } else if (this.cursors.down.isDown) {
      this.setVelocityY(SPEED)
      movingY = true
    }

    if (movingX && movingY) {
      const body = this.body as Phaser.Physics.Arcade.Body
      body.velocity.normalize().scale(SPEED)
    }

    if (movingX || movingY) {
      if (this.cursors.left.isDown) {
        this.anims.play(`${SPRITE_KEY}-walk-left`, true)
      } else if (this.cursors.right.isDown) {
        this.anims.play(`${SPRITE_KEY}-walk-right`, true)
      } else if (this.cursors.up.isDown) {
        this.anims.play(`${SPRITE_KEY}-walk-up`, true)
      } else if (this.cursors.down.isDown) {
        this.anims.play(`${SPRITE_KEY}-walk-down`, true)
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
