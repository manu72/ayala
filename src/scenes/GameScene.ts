import Phaser from 'phaser'

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' })
  }

  create(): void {
    const map = this.make.tilemap({ key: 'atg' })
    const tileset = map.addTilesetImage('park-tiles', 'park-tiles')

    if (!tileset) {
      throw new Error('Failed to load tileset "park-tiles"')
    }

    map.createLayer('ground', tileset, 0, 0)

    const objectsLayer = map.createLayer('objects', tileset, 0, 0)
    if (objectsLayer && 'setCollisionByProperty' in objectsLayer) {
      ;(objectsLayer as Phaser.Tilemaps.TilemapLayer).setCollisionByProperty({ collides: true })
    }

    const overheadLayer = map.createLayer('overhead', tileset, 0, 0)
    if (overheadLayer) {
      overheadLayer.setDepth(10)
    }

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels)

    this.cameras.main.centerOn(map.widthInPixels / 2, map.heightInPixels / 2)
    this.cameras.main.setZoom(0.5)
  }
}
