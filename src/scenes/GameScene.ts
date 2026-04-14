import Phaser from 'phaser'
import { MammaCat } from '../sprites/MammaCat'
import { NPCCat } from '../sprites/NPCCat'
import { GuardNPC } from '../sprites/GuardNPC'
import { DayNightCycle } from '../systems/DayNightCycle'
import { DialogueSystem } from '../systems/DialogueSystem'
import { StatsSystem } from '../systems/StatsSystem'
import { StatsHUD } from '../systems/StatsHUD'
import { FoodSourceManager } from '../systems/FoodSource'
import { ThreatIndicator } from '../systems/ThreatIndicator'
import { SaveSystem } from '../systems/SaveSystem'

const INTERACTION_DISTANCE = 50
const LEARN_NAME_DISTANCE = 100
const TILE_SIZE = 32

interface NPCEntry {
  cat: NPCCat
  indicator: ThreatIndicator
}

export class GameScene extends Phaser.Scene {
  player!: MammaCat
  dayNight!: DayNightCycle
  stats!: StatsSystem

  private npcs: NPCEntry[] = []
  private guard!: GuardNPC
  private guardIndicator!: ThreatIndicator
  private dialogue!: DialogueSystem
  private hud!: StatsHUD
  private foodSources!: FoodSourceManager
  private actionKey!: Phaser.Input.Keyboard.Key
  private spaceKey!: Phaser.Input.Keyboard.Key
  private escapeKey!: Phaser.Input.Keyboard.Key
  private overheadLayer!: Phaser.Tilemaps.TilemapLayer | null
  private map!: Phaser.Tilemaps.Tilemap
  private knownCats: Set<string> = new Set()
  private saveNotice!: Phaser.GameObjects.Text

  constructor() {
    super({ key: 'GameScene' })
  }

  create(data?: { loadSave?: boolean }): void {
    this.npcs = []

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

    // Default spawn
    const spawnPoint = this.map.findObject('spawns', obj => obj.name === 'spawn_mammacat')
    let spawnX = spawnPoint?.x ?? this.map.widthInPixels / 2
    let spawnY = spawnPoint?.y ?? this.map.heightInPixels / 2

    // Systems (created before restore so we can apply save data)
    this.stats = new StatsSystem()
    this.dayNight = new DayNightCycle(this)

    // Restore save if requested
    if (data?.loadSave) {
      const save = SaveSystem.load()
      if (save) {
        spawnX = save.playerPosition.x
        spawnY = save.playerPosition.y
        this.stats.fromJSON(save.stats)
        this.dayNight.restore(save.timeOfDay, save.gameTimeMs)

        for (const [key, val] of Object.entries(save.variables)) {
          this.registry.set(key, val)
        }
      }
    }

    this.player = new MammaCat(this, spawnX, spawnY)

    if (objectsLayer) {
      this.physics.add.collider(this.player, objectsLayer)
    }

    // Known cats from registry
    const savedKnown = this.registry.get('KNOWN_CATS') as string[] | undefined
    this.knownCats = new Set(savedKnown ?? [])

    // NPCs
    this.spawnNPC('Blacky', 'blacky', 'spawn_blacky', 'neutral', 150, 1024, 544)
    this.spawnNPC('Tiger', 'tiger', 'spawn_tiger', 'territorial', 200, 1600, 1152)
    this.spawnNPC('Jayco', 'jayco', 'spawn_jayco', 'friendly', 150, 2560, 512)

    // Restore disposition from saved variables
    this.restoreDispositions()

    // Guard NPC
    const guardPoint = this.map.findObject('spawns', o => o.name === 'spawn_guard')
    this.guard = new GuardNPC(this, guardPoint?.x ?? 2336, guardPoint?.y ?? 1728)
    this.guard.setTarget(this.player)
    this.guardIndicator = new ThreatIndicator(this, this.guard, 'Guard', 'dangerous', true)

    // Dialogue & HUD
    this.dialogue = new DialogueSystem(this)
    this.hud = new StatsHUD(this)

    // Food sources
    this.foodSources = new FoodSourceManager(this)
    this.placeFoodSources()

    // Input
    if (this.input.keyboard) {
      this.actionKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
      this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
      this.escapeKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
      this.escapeKey.on('down', () => this.manualSave())
    }

    // Camera
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels)
    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels)
    this.cameras.main.setZoom(2.5)
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08)
    this.cameras.main.setDeadzone(50, 50)

    // Save notice (hidden by default)
    const cam = this.cameras.main
    this.saveNotice = this.add.text(cam.width - 10, 10, 'Saved', {
      fontSize: '10px',
      color: '#44DD44',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(200).setAlpha(0)
  }

  update(time: number, delta: number): void {
    const deltaSec = delta / 1000
    this.dayNight.update(delta)

    this.player.speedMultiplier = this.stats.speedMultiplier

    if (this.stats.collapsed) {
      this.player.setVelocity(0)
      this.hud.update(this.stats)
      return
    }

    if (!this.dialogue.isActive) {
      this.player.update(this.stats.canRun)
    }

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
    this.foodSources.update(this.dayNight.currentPhase, time)

    // Guard
    this.guard.update(delta)
    this.guardIndicator.update()

    // NPC AI + indicators + name learning
    for (const { cat, indicator } of this.npcs) {
      cat.setPhase(this.dayNight.currentPhase)
      cat.update(delta)
      indicator.update()

      if (!indicator.known) {
        const dist = Phaser.Math.Distance.Between(
          this.player.x, this.player.y, cat.x, cat.y,
        )
        if (dist < LEARN_NAME_DISTANCE) {
          indicator.reveal()
          this.knownCats.add(cat.npcName)
          this.registry.set('KNOWN_CATS', Array.from(this.knownCats))
        }
      }
    }

    // Interaction
    const actionDown = this.actionKey?.isDown || this.spaceKey?.isDown
    if (actionDown && !this.dialogue.isActive) {
      const usedSource = this.foodSources.tryInteract(
        this.player.x, this.player.y,
        this.stats, this.dayNight.currentPhase, time,
      )
      if (!usedSource) {
        this.tryInteract()
      }
    }
  }

  // ──────────── Save/Load ────────────

  /** Trigger auto-save (called after story events and rest). */
  autoSave(): void {
    this.performSave()
  }

  private manualSave(): void {
    this.performSave()
  }

  private performSave(): void {
    SaveSystem.save(
      this.player.x,
      this.player.y,
      this.stats.toJSON(),
      this.dayNight.currentPhase,
      this.dayNight.totalGameTimeMs,
      this.registry,
    )
    this.showSaveNotice()
  }

  private showSaveNotice(): void {
    this.saveNotice.setAlpha(1)
    this.tweens.add({
      targets: this.saveNotice,
      alpha: 0,
      delay: 800,
      duration: 600,
      ease: 'Linear',
    })
  }

  /** Re-apply disposition changes from saved registry variables. */
  private restoreDispositions(): void {
    const tigerTalks = (this.registry.get('TIGER_TALKS') as number) ?? 0
    if (tigerTalks >= 2) {
      const entry = this.npcs.find(e => e.cat.npcName === 'Tiger')
      if (entry) {
        entry.cat.disposition = 'friendly'
        entry.indicator.setDisposition('friendly')
      }
    }

    const jaycoTalks = (this.registry.get('JAYCO_TALKS') as number) ?? 0
    if (jaycoTalks >= 1) {
      const entry = this.npcs.find(e => e.cat.npcName === 'Jayco')
      if (entry) {
        entry.cat.disposition = 'friendly'
        entry.indicator.setDisposition('friendly')
      }
    }
  }

  // ──────────── NPC Spawning ────────────

  spawnNPC(
    name: string,
    spriteKey: string,
    spawnPOI: string,
    disposition: 'friendly' | 'neutral' | 'territorial',
    homeRadius: number,
    fallbackX: number,
    fallbackY: number,
  ): NPCCat {
    const point = this.map.findObject('spawns', obj => obj.name === spawnPOI)
    const x = point?.x ?? fallbackX
    const y = point?.y ?? fallbackY

    const cat = new NPCCat(this, {
      name, spriteKey, x, y,
      homeZone: { cx: x, cy: y, radius: homeRadius },
      disposition,
    })

    const known = this.knownCats.has(name)
    const indicator = new ThreatIndicator(this, cat, name, disposition, known)
    this.npcs.push({ cat, indicator })
    return cat
  }

  // ──────────── Food Sources ────────────

  private placeFoodSources(): void {
    const poi = (name: string) => this.map.findObject('spawns', o => o.name === name)

    const sources: Array<[string, string]> = [
      ['poi_feeding_station_1', 'feeding_station'],
      ['poi_feeding_station_2', 'feeding_station'],
      ['poi_fountain', 'fountain'],
      ['poi_water_bowl_1', 'water_bowl'],
      ['poi_water_bowl_2', 'water_bowl'],
      ['poi_restaurant_scraps', 'restaurant_scraps'],
      ['poi_safe_sleep', 'safe_sleep'],
    ]

    for (const [poiName, type] of sources) {
      const obj = poi(poiName)
      if (obj) {
        this.foodSources.addSource(type as any, obj.x ?? 0, obj.y ?? 0)
      }
    }

    this.foodSources.addBugSpawns(this.map, 15)
  }

  // ──────────── Environment ────────────

  private isUnderCanopy(worldX: number, worldY: number): boolean {
    if (!this.overheadLayer) return false
    const tileX = Math.floor(worldX / TILE_SIZE)
    const tileY = Math.floor(worldY / TILE_SIZE)
    const tile = this.overheadLayer.getTileAt(tileX, tileY)
    return tile !== null
  }

  private isNearShelter(worldX: number, worldY: number): boolean {
    const shelterNames = ['poi_pyramid_steps', 'poi_starbucks', 'poi_safe_sleep']
    return shelterNames.some(name => {
      const s = this.map.findObject('spawns', o => o.name === name)
      if (!s) return false
      return Phaser.Math.Distance.Between(worldX, worldY, s.x ?? 0, s.y ?? 0) < 80
    })
  }

  // ──────────── NPC Interaction ────────────

  private tryInteract(): void {
    let nearestEntry: NPCEntry | null = null
    let nearestDist = Infinity

    for (const entry of this.npcs) {
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        entry.cat.x, entry.cat.y,
      )
      if (dist < INTERACTION_DISTANCE && dist < nearestDist) {
        nearestEntry = entry
        nearestDist = dist
      }
    }

    if (!nearestEntry) return
    const cat = nearestEntry.cat

    if (cat.state === 'sleeping') {
      cat.triggerAlert()
      return
    }

    this.showCatDialogue(cat)
  }

  private showCatDialogue(cat: NPCCat): void {
    const name = cat.npcName

    switch (name) {
      case 'Blacky': {
        const met = this.registry.get('MET_BLACKY') as boolean | undefined
        if (!met) {
          this.dialogue.show([
            'Mrrp. New here, are you?',
            'This is Ayala Triangle. The gardens are home to all of us.',
            'Find shade. Find food. Stay away from the roads.',
            'And at night... stay hidden. Not all humans are kind.',
          ], () => {
            this.registry.set('MET_BLACKY', true)
            this.knownCats.add('Blacky')
            this.registry.set('KNOWN_CATS', Array.from(this.knownCats))
            this.npcs.find(e => e.cat === cat)?.indicator.reveal()
            this.autoSave()
          })
        } else {
          this.dialogue.show([
            "Still here? Good. You're tougher than you look.",
          ])
        }
        break
      }

      case 'Tiger': {
        const talks = (this.registry.get('TIGER_TALKS') as number) ?? 0
        if (talks === 0) {
          this.dialogue.show([
            "*The cat's ears flatten slightly. Its tail flicks once.*",
            '"Ssss. This is my spot."',
          ], () => {
            this.registry.set('TIGER_TALKS', 1)
            this.knownCats.add('Tiger')
            this.registry.set('KNOWN_CATS', Array.from(this.knownCats))
            this.npcs.find(e => e.cat === cat)?.indicator.reveal()
            this.autoSave()
          })
        } else if (talks === 1) {
          this.dialogue.show([
            "*The cat watches you approach but doesn't hiss this time.*",
            '"...You again. There\'s food by the stone building at evening. Don\'t tell anyone."',
          ], () => {
            this.registry.set('TIGER_TALKS', 2)
            cat.disposition = 'friendly'
            this.npcs.find(e => e.cat === cat)?.indicator.setDisposition('friendly')
            this.autoSave()
          })
        } else {
          this.dialogue.show([
            '"Mrrp. You can rest here. Under this tree. I\'ll keep watch."',
          ])
        }
        break
      }

      case 'Jayco': {
        const talks = (this.registry.get('JAYCO_TALKS') as number) ?? 0
        if (talks === 0) {
          this.dialogue.show([
            '*This cat approaches with tail up. Curious.*',
            '"Prrrp! New face! I\'m Jayco. I know every corner of these steps."',
            '"The humans below \u2014 the coffee place \u2014 they leave good scraps. But watch for the guard."',
          ], () => {
            this.registry.set('JAYCO_TALKS', 1)
            this.knownCats.add('Jayco')
            this.registry.set('KNOWN_CATS', Array.from(this.knownCats))
            const entry = this.npcs.find(e => e.cat === cat)
            entry?.indicator.reveal()
            entry?.indicator.setDisposition('friendly')
            cat.disposition = 'friendly'
            this.autoSave()
          })
        } else {
          this.dialogue.show([
            '"The ginger ones fight over the bench near the fountain. Stay clear at dusk."',
          ])
        }
        break
      }

      default:
        this.dialogue.show(['*The cat regards you warily.*'])
    }
  }
}
