import Phaser from 'phaser'
import { MammaCat } from '../sprites/MammaCat'

export class GameScene extends Phaser.Scene {
  private player!: MammaCat

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

    // Spawn Mamma Cat at the designated point
    const spawnPoint = map.findObject('spawns', obj => obj.name === 'spawn_mammacat')
    const spawnX = spawnPoint?.x ?? map.widthInPixels / 2
    const spawnY = spawnPoint?.y ?? map.heightInPixels / 2

    this.player = new MammaCat(this, spawnX, spawnY)

    if (objectsLayer) {
      this.physics.add.collider(this.player, objectsLayer)
    }

    // Camera setup
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08)
  }

  update(): void {
    this.player.update()
  }
}
