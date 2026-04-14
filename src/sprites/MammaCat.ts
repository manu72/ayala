import Phaser from 'phaser'

const SPEED = 120

export class MammaCat extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private nameLabel: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'mammacat')

    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setCollideWorldBounds(true)

    const body = this.body as Phaser.Physics.Arcade.Body
    body.setSize(20, 20)
    body.setOffset(6, 10)

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
    // Row 0: walk down (frames 0-3)
    scene.anims.create({
      key: 'mammacat-walk-down',
      frames: scene.anims.generateFrameNumbers('mammacat', { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1,
    })
    // Row 1: walk left (frames 4-7)
    scene.anims.create({
      key: 'mammacat-walk-left',
      frames: scene.anims.generateFrameNumbers('mammacat', { start: 4, end: 7 }),
      frameRate: 8,
      repeat: -1,
    })
    // Row 2: walk right (frames 8-11)
    scene.anims.create({
      key: 'mammacat-walk-right',
      frames: scene.anims.generateFrameNumbers('mammacat', { start: 8, end: 11 }),
      frameRate: 8,
      repeat: -1,
    })
    // Row 3: walk up (frames 12-15)
    scene.anims.create({
      key: 'mammacat-walk-up',
      frames: scene.anims.generateFrameNumbers('mammacat', { start: 12, end: 15 }),
      frameRate: 8,
      repeat: -1,
    })
    // Row 4: idle (frames 16-19)
    scene.anims.create({
      key: 'mammacat-idle',
      frames: scene.anims.generateFrameNumbers('mammacat', { start: 16, end: 17 }),
      frameRate: 2,
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

    // Normalize diagonal movement
    if (movingX && movingY) {
      const body = this.body as Phaser.Physics.Arcade.Body
      body.velocity.normalize().scale(SPEED)
    }

    // Pick animation based on dominant direction
    if (movingX || movingY) {
      if (this.cursors.left.isDown) {
        this.anims.play('mammacat-walk-left', true)
      } else if (this.cursors.right.isDown) {
        this.anims.play('mammacat-walk-right', true)
      } else if (this.cursors.up.isDown) {
        this.anims.play('mammacat-walk-up', true)
      } else if (this.cursors.down.isDown) {
        this.anims.play('mammacat-walk-down', true)
      }
    } else {
      this.anims.play('mammacat-idle', true)
    }

    this.nameLabel.setPosition(this.x, this.y - 20)
  }

  destroy(fromScene?: boolean): void {
    this.nameLabel.destroy()
    super.destroy(fromScene)
  }
}
