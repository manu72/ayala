import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload(): void {
    // Assets will be loaded here in subsequent tasks
  }

  create(): void {
    this.scene.start('GameScene')
  }
}
