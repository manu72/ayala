import Phaser from 'phaser'

const COLS = 8

export interface NPCCatConfig {
  name: string
  spriteKey: string
  x: number
  y: number
}

export class NPCCat extends Phaser.Physics.Arcade.Sprite {
  readonly npcName: string
  private nameLabel: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene, config: NPCCatConfig) {
    super(scene, config.x, config.y, config.spriteKey)

    this.npcName = config.name

    scene.add.existing(this)
    scene.physics.add.existing(this, true)
    this.setDepth(3)

    this.createAnimations(scene, config.spriteKey)
    this.anims.play(`${config.spriteKey}-idle`, true)

    this.nameLabel = scene.add.text(config.x, config.y - 20, config.name, {
      fontSize: '10px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(5)
  }

  private createAnimations(scene: Phaser.Scene, key: string): void {
    if (scene.anims.exists(`${key}-idle`)) return

    // Row 4 (frames 32-34) for idle in 8-col layout
    scene.anims.create({
      key: `${key}-idle`,
      frames: scene.anims.generateFrameNumbers(key, { start: 4 * COLS, end: 4 * COLS + 2 }),
      frameRate: 3,
      repeat: -1,
    })
  }

  destroy(fromScene?: boolean): void {
    this.nameLabel.destroy()
    super.destroy(fromScene)
  }
}
