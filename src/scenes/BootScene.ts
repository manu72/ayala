import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload(): void {
    this.load.image('park-tiles', 'assets/tilesets/park-tiles.png')
    this.load.tilemapTiledJSON('atg', 'assets/tilemaps/atg.json')
    this.load.spritesheet('mammacat', 'assets/sprites/mammacat.png', {
      frameWidth: 32,
      frameHeight: 32,
    })
    this.load.spritesheet('blacky', 'assets/sprites/blacky.png', {
      frameWidth: 32,
      frameHeight: 32,
    })
  }

  create(): void {
    this.scene.start('GameScene')
  }
}
