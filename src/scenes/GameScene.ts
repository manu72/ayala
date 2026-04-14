import Phaser from 'phaser'
import { MammaCat } from '../sprites/MammaCat'
import { NPCCat } from '../sprites/NPCCat'
import { DayNightCycle } from '../systems/DayNightCycle'
import { DialogueSystem } from '../systems/DialogueSystem'

const INTERACTION_DISTANCE = 50

export class GameScene extends Phaser.Scene {
  private player!: MammaCat
  private blacky!: NPCCat
  private dialogue!: DialogueSystem
  private dayNight!: DayNightCycle
  private actionKey!: Phaser.Input.Keyboard.Key

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

    // Spawn Mamma Cat
    const spawnPoint = map.findObject('spawns', obj => obj.name === 'spawn_mammacat')
    const spawnX = spawnPoint?.x ?? map.widthInPixels / 2
    const spawnY = spawnPoint?.y ?? map.heightInPixels / 2

    this.player = new MammaCat(this, spawnX, spawnY)

    if (objectsLayer) {
      this.physics.add.collider(this.player, objectsLayer)
    }

    // Spawn Blacky
    const blackyPoint = map.findObject('spawns', obj => obj.name === 'spawn_blacky')
    this.blacky = new NPCCat(this, {
      name: 'Blacky',
      spriteKey: 'blacky',
      x: blackyPoint?.x ?? 832,
      y: blackyPoint?.y ?? 416,
    })

    // Dialogue system
    this.dialogue = new DialogueSystem(this)

    // Action key (Enter) for NPC interaction
    if (this.input.keyboard) {
      this.actionKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
    }

    // Day/night cycle
    this.dayNight = new DayNightCycle(this)

    // Camera
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.cameras.main.setZoom(2.5)
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08)
    this.cameras.main.setDeadzone(50, 50)
  }

  update(_time: number, delta: number): void {
    this.dayNight.update(delta)

    if (!this.dialogue.isActive) {
      this.player.update()
    }

    if (this.actionKey?.isDown && !this.dialogue.isActive) {
      this.tryInteract()
    }
  }

  private tryInteract(): void {
    const dist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y,
      this.blacky.x, this.blacky.y,
    )

    if (dist > INTERACTION_DISTANCE) return

    const metBlacky = this.registry.get('MET_BLACKY') as boolean | undefined

    if (!metBlacky) {
      this.dialogue.show([
        'Mrrp. New here, are you?',
        'This is Ayala Triangle. The gardens are home to all of us.',
        'Find shade. Find food. Stay away from the roads.',
        'And at night... stay hidden. Not all humans are kind.',
      ], () => {
        this.registry.set('MET_BLACKY', true)
      })
    } else {
      this.dialogue.show([
        "Still here? Good. You're tougher than you look.",
      ])
    }
  }
}
