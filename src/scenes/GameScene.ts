import Phaser from 'phaser'
import { MammaCat } from '../sprites/MammaCat'
import { NPCCat } from '../sprites/NPCCat'
import { DayNightCycle } from '../systems/DayNightCycle'
import { DialogueSystem } from '../systems/DialogueSystem'
import { StatsSystem } from '../systems/StatsSystem'
import { StatsHUD } from '../systems/StatsHUD'

const INTERACTION_DISTANCE = 50
const TILE_SIZE = 32

export class GameScene extends Phaser.Scene {
  player!: MammaCat
  dayNight!: DayNightCycle
  stats!: StatsSystem

  private blacky!: NPCCat
  private dialogue!: DialogueSystem
  private hud!: StatsHUD
  private actionKey!: Phaser.Input.Keyboard.Key
  private overheadLayer!: Phaser.Tilemaps.TilemapLayer | null
  private map!: Phaser.Tilemaps.Tilemap

  constructor() {
    super({ key: 'GameScene' })
  }

  create(): void {
    this.map = this.make.tilemap({ key: 'atg' })
    const tileset = this.map.addTilesetImage('park-tiles', 'park-tiles')
    if (!tileset) throw new Error('Failed to load tileset "park-tiles"')

    this.map.createLayer('ground', tileset, 0, 0)

    const objectsLayer = this.map.createLayer('objects', tileset, 0, 0)
    if (objectsLayer && 'setCollisionByProperty' in objectsLayer) {
      ;(objectsLayer as Phaser.Tilemaps.TilemapLayer).setCollisionByProperty({ collides: true })
    }

    this.overheadLayer = this.map.createLayer('overhead', tileset, 0, 0) as Phaser.Tilemaps.TilemapLayer | null
    if (this.overheadLayer) {
      this.overheadLayer.setDepth(10)
    }

    // Spawn Mamma Cat
    const spawnPoint = this.map.findObject('spawns', obj => obj.name === 'spawn_mammacat')
    const spawnX = spawnPoint?.x ?? this.map.widthInPixels / 2
    const spawnY = spawnPoint?.y ?? this.map.heightInPixels / 2
    this.player = new MammaCat(this, spawnX, spawnY)

    if (objectsLayer) {
      this.physics.add.collider(this.player, objectsLayer)
    }

    // Spawn Blacky
    const blackyPoint = this.map.findObject('spawns', obj => obj.name === 'spawn_blacky')
    this.blacky = new NPCCat(this, {
      name: 'Blacky',
      spriteKey: 'blacky',
      x: blackyPoint?.x ?? 1024,
      y: blackyPoint?.y ?? 544,
    })

    // Systems
    this.dialogue = new DialogueSystem(this)
    this.stats = new StatsSystem()
    this.dayNight = new DayNightCycle(this)
    this.hud = new StatsHUD(this)

    if (this.input.keyboard) {
      this.actionKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
    }

    // Camera
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels)
    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels)
    this.cameras.main.setZoom(2.5)
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08)
    this.cameras.main.setDeadzone(50, 50)
  }

  update(_time: number, delta: number): void {
    const deltaSec = delta / 1000

    this.dayNight.update(delta)

    // Stat effects on player
    this.player.speedMultiplier = this.stats.speedMultiplier

    if (this.stats.collapsed) {
      this.player.setVelocity(0)
      this.hud.update(this.stats)
      return
    }

    if (!this.dialogue.isActive) {
      this.player.update(this.stats.canRun)
    }

    // Shade/shelter detection (overhead layer has tree canopy tiles)
    const inShade = this.isUnderCanopy(this.player.x, this.player.y)
    const inShelter = this.isNearShelter(this.player.x, this.player.y)

    this.stats.update(
      deltaSec,
      this.player.isMoving,
      this.player.isRunning,
      this.dayNight.isHeatActive,
      inShade,
      inShelter,
    )

    this.hud.update(this.stats)

    if (this.actionKey?.isDown && !this.dialogue.isActive) {
      this.tryInteract()
    }
  }

  /** Check if a world position is under a tree canopy (overhead layer has a non-empty tile). */
  private isUnderCanopy(worldX: number, worldY: number): boolean {
    if (!this.overheadLayer) return false
    const tileX = Math.floor(worldX / TILE_SIZE)
    const tileY = Math.floor(worldY / TILE_SIZE)
    const tile = this.overheadLayer.getTileAt(tileX, tileY)
    return tile !== null
  }

  /** Check if near a sheltered rest spot (specific map POIs). */
  private isNearShelter(worldX: number, worldY: number): boolean {
    const shelters = [
      this.map.findObject('spawns', o => o.name === 'poi_pyramid_steps'),
      this.map.findObject('spawns', o => o.name === 'poi_starbucks'),
    ]
    return shelters.some(s => {
      if (!s) return false
      return Phaser.Math.Distance.Between(worldX, worldY, s.x ?? 0, s.y ?? 0) < 80
    })
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
