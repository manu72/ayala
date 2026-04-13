import Phaser from 'phaser'

export interface NPCCatConfig {
  name: string
  spriteKey: string
  x: number
  y: number
}

/**
 * A stationary NPC cat with a name label and idle animation.
 */
export class NPCCat extends Phaser.Physics.Arcade.Sprite {
  readonly npcName: string
  private nameLabel: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene, config: NPCCatConfig) {
    super(scene, config.x, config.y, config.spriteKey)

    this.npcName = config.name

    scene.add.existing(this)
    scene.physics.add.existing(this, true) // static body

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

    scene.anims.create({
      key: `${key}-idle`,
      frames: scene.anims.generateFrameNumbers(key, { start: 16, end: 17 }),
      frameRate: 2,
      repeat: -1,
    })
  }

  destroy(fromScene?: boolean): void {
    this.nameLabel.destroy()
    super.destroy(fromScene)
  }
}
