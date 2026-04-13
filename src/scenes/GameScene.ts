import Phaser from 'phaser'

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' })
  }

  create(): void {
    this.add
      .text(this.cameras.main.centerX, this.cameras.main.centerY, 'Ayala', {
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
  }
}
