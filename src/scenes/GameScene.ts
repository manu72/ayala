import Phaser from "phaser";
import { MammaCat } from "../sprites/MammaCat";
import { NPCCat } from "../sprites/NPCCat";
import { GuardNPC } from "../sprites/GuardNPC";
import { DayNightCycle } from "../systems/DayNightCycle";
import { StatsSystem } from "../systems/StatsSystem";
import { FoodSourceManager } from "../systems/FoodSource";
import { ThreatIndicator } from "../systems/ThreatIndicator";
import { SaveSystem } from "../systems/SaveSystem";
import type { HUDScene } from './HUDScene'

const INTERACTION_DISTANCE = 50;
const LEARN_NAME_DISTANCE = 100;
const TILE_SIZE = 32;
const REST_HOLD_MS = 2000;
const DEFAULT_ZOOM = 2.5;
const PEEK_ZOOM = 0.8;
const ZOOM_DURATION = 500;

interface NPCEntry {
  cat: NPCCat;
  indicator: ThreatIndicator;
}

export class GameScene extends Phaser.Scene {
  player!: MammaCat;
  dayNight!: DayNightCycle;
  stats!: StatsSystem;

  /** Expose for HUDScene to read rest progress. */
  restHoldTimer = 0;
  restHoldActive = false;
  isPeeking = false;
  isPaused = false;

  private npcs: NPCEntry[] = [];
  private guard!: GuardNPC;
  private guardIndicator!: ThreatIndicator;
  private foodSources!: FoodSourceManager;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private restKey!: Phaser.Input.Keyboard.Key;
  private tabKey!: Phaser.Input.Keyboard.Key;
  private escapeKey!: Phaser.Input.Keyboard.Key;
  private objectsLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private overheadLayer!: Phaser.Tilemaps.TilemapLayer | null;
  private map!: Phaser.Tilemaps.Tilemap;
  private knownCats: Set<string> = new Set();
  private collapseRecoveryTimer = 0;
  private collapseRecovering = false;

  /** Dialogue lives in HUDScene (1x zoom) so it's always visible. */
  private get dialogue(): { isActive: boolean; show: (lines: string[], onComplete?: () => void) => void } {
    const hud = this.scene.get('HUDScene') as HUDScene | undefined
    if (hud?.dialogue) return hud.dialogue
    return { isActive: false, show: () => {} }
  }

  constructor() {
    super({ key: "GameScene" });
  }

  create(data?: { loadSave?: boolean }): void {
    this.npcs = [];
    this.restHoldTimer = 0;
    this.restHoldActive = false;
    this.isPeeking = false;
    this.isPaused = false;

    this.map = this.make.tilemap({ key: "atg" });
    const tileset = this.map.addTilesetImage("park-tiles", "park-tiles");
    if (!tileset) throw new Error('Failed to load tileset "park-tiles"');

    this.map.createLayer("ground", tileset, 0, 0);

    const rawObjectsLayer = this.map.createLayer("objects", tileset, 0, 0);
    if (rawObjectsLayer && "setCollisionByProperty" in rawObjectsLayer) {
      this.objectsLayer = rawObjectsLayer as Phaser.Tilemaps.TilemapLayer;
      this.objectsLayer.setCollisionByProperty({ collides: true });
    }

    this.overheadLayer = this.map.createLayer("overhead", tileset, 0, 0) as Phaser.Tilemaps.TilemapLayer | null;
    if (this.overheadLayer) {
      this.overheadLayer.setDepth(10);
    }

    const spawnPoint = this.map.findObject("spawns", (obj) => obj.name === "spawn_mammacat");
    let spawnX = spawnPoint?.x ?? this.map.widthInPixels / 2;
    let spawnY = spawnPoint?.y ?? this.map.heightInPixels / 2;

    this.stats = new StatsSystem();
    this.dayNight = new DayNightCycle(this);

    // Clear story state from any prior session before restoring
    for (const key of ['MET_BLACKY', 'TIGER_TALKS', 'JAYCO_TALKS', 'KNOWN_CATS']) {
      this.registry.remove(key);
    }

    if (data?.loadSave) {
      const save = SaveSystem.load();
      if (save) {
        spawnX = save.playerPosition.x;
        spawnY = save.playerPosition.y;
        this.stats.fromJSON(save.stats);
        this.dayNight.restore(save.timeOfDay, save.gameTimeMs);
        for (const [key, val] of Object.entries(save.variables)) {
          this.registry.set(key, val);
        }
      }
    }

    this.player = new MammaCat(this, spawnX, spawnY);

    if (this.objectsLayer) {
      this.physics.add.collider(this.player, this.objectsLayer);
    }

    const savedKnown = this.registry.get("KNOWN_CATS") as string[] | undefined;
    this.knownCats = new Set(savedKnown ?? []);

    this.spawnNPC("Blacky", "blacky", "spawn_blacky", "neutral", 150, 1024, 544);
    this.spawnNPC("Tiger", "tiger", "spawn_tiger", "territorial", 200, 1600, 1152);
    this.spawnNPC("Jayco", "jayco", "spawn_jayco", "friendly", 150, 2560, 512);
    this.restoreDispositions();

    const guardPoint = this.map.findObject("spawns", (o) => o.name === "spawn_guard");
    this.guard = new GuardNPC(this, guardPoint?.x ?? 2336, guardPoint?.y ?? 1728);
    this.guard.setTarget(this.player);
    if (this.objectsLayer) {
      this.physics.add.collider(this.guard, this.objectsLayer);
    }
    this.guardIndicator = new ThreatIndicator(this, this.guard, "Guard", "dangerous", true);

    this.foodSources = new FoodSourceManager(this);
    this.placeFoodSources();

    if (this.input.keyboard) {
      this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.restKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
      this.tabKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
      this.escapeKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

      // Prevent Tab from leaving the game canvas
      this.input.keyboard.addCapture("TAB");
    }

    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.setZoom(DEFAULT_ZOOM);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(50, 50);

    if (!this.scene.isActive("HUDScene")) {
      this.scene.launch("HUDScene");
    }
  }

  update(time: number, delta: number): void {
    // Paused — skip all game logic
    if (this.isPaused) return;

    const deltaSec = delta / 1000;
    this.dayNight.update(delta);

    this.player.speedMultiplier = this.stats.speedMultiplier;

    // Collapse recovery
    if (this.stats.collapsed) {
      this.player.setVelocity(0);
      if (!this.collapseRecovering) {
        this.collapseRecovering = true;
        this.collapseRecoveryTimer = 0;
      }
      this.collapseRecoveryTimer += delta;
      if (this.collapseRecoveryTimer >= 3000) {
        this.recoverFromCollapse();
      }
      return;
    }

    // Escape → toggle pause menu
    if (this.escapeKey && Phaser.Input.Keyboard.JustDown(this.escapeKey)) {
      this.togglePause();
      return;
    }

    // ──── Resting state ────
    if (this.player.isResting) {
      this.updateResting(deltaSec);
      this.updateNPCs(delta);
      this.foodSources.update(this.dayNight.currentPhase, time);
      this.guard.update(delta);
      this.guardIndicator.update();
      return;
    }

    // ──── Tab peek ────
    if (this.tabKey?.isDown) {
      this.player.setVelocity(0);
      if (!this.isPeeking) {
        this.isPeeking = true;
        this.cameras.main.zoomTo(PEEK_ZOOM, ZOOM_DURATION);
      }
      this.updateNPCs(delta);
      this.foodSources.update(this.dayNight.currentPhase, time);
      this.guard.update(delta);
      this.guardIndicator.update();
      return;
    }
    if (this.isPeeking) {
      this.isPeeking = false;
      this.cameras.main.zoomTo(DEFAULT_ZOOM, ZOOM_DURATION);
    }

    // ──── Interact (Space tap) ────
    const spaceJust = this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey);
    if (spaceJust && !this.dialogue.isActive) {
      const usedSource = this.foodSources.tryInteract(
        this.player.x,
        this.player.y,
        this.stats,
        this.dayNight.currentPhase,
        time,
      );
      if (!usedSource) {
        this.tryInteract();
      }
    }

    // ──── Rest hold initiation (Z key, separate from interact) ────
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const playerStationary = playerBody.velocity.length() < 1;

    if (this.restKey?.isDown && playerStationary && !this.dialogue.isActive) {
      this.restHoldTimer += delta;
      this.restHoldActive = true;
      if (this.restHoldTimer >= REST_HOLD_MS) {
        // Consume stale JustDown flag so updateResting doesn't immediately wake
        Phaser.Input.Keyboard.JustDown(this.restKey);
        this.player.enterRest();
        this.restHoldTimer = 0;
        this.restHoldActive = false;
        if (this.isNearShelter(this.player.x, this.player.y)) {
          this.autoSave();
        }
      }
    } else if (!this.restKey?.isDown) {
      this.restHoldTimer = 0;
      this.restHoldActive = false;
    }

    // ──── Normal movement ────
    const inShade = this.isUnderCanopy(this.player.x, this.player.y);
    const inShelter = this.isNearShelter(this.player.x, this.player.y);

    if (this.dialogue.isActive) {
      this.player.setVelocity(0);
      this.stats.update(deltaSec, false, false, this.dayNight.isHeatActive, inShade, inShelter, false);
    } else {
      this.player.update(this.stats.canRun, delta);
      this.stats.update(
        deltaSec,
        this.player.isMoving,
        this.player.isRunning,
        this.dayNight.isHeatActive,
        inShade,
        inShelter,
        false,
      );
    }

    this.foodSources.update(this.dayNight.currentPhase, time);
    this.guard.update(delta);
    this.guardIndicator.update();
    this.updateNPCs(delta);
  }

  // ──────────── Resting ────────────

  private updateResting(deltaSec: number): void {
    const inShade = this.isUnderCanopy(this.player.x, this.player.y);
    const inShelter = this.isNearShelter(this.player.x, this.player.y);

    this.stats.update(deltaSec, false, false, this.dayNight.isHeatActive, inShade, inShelter, true);

    // Wake on any movement key, Space, or Z
    if (this.player.isMoving) {
      this.player.wakeUp();
      return;
    }
    const wakePressed =
      (this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey)) ||
      (this.restKey && Phaser.Input.Keyboard.JustDown(this.restKey));
    if (wakePressed) {
      this.player.wakeUp();
    }
  }

  // ──────────── Pause ────────────

  togglePause(): void {
    this.isPaused = !this.isPaused;
    const hud = this.scene.get("HUDScene") as HUDScene | undefined;
    if (this.isPaused) {
      this.physics.pause();
      hud?.showPauseMenu?.();
    } else {
      this.physics.resume();
      hud?.hidePauseMenu?.();
    }
  }

  resumeGame(): void {
    this.isPaused = false;
    this.physics.resume();
  }

  quitToTitle(): void {
    this.isPaused = false;
    this.physics.resume();
    this.scene.stop("HUDScene");
    this.scene.start("StartScene");
  }

  // ──────────── Save/Load ────────────

  autoSave(): void {
    this.performSave();
  }

  private performSave(): void {
    const ok = SaveSystem.save(
      this.player.x,
      this.player.y,
      this.stats.toJSON(),
      this.dayNight.currentPhase,
      this.dayNight.totalGameTimeMs,
      this.registry,
    );
    if (ok) {
      const hud = this.scene.get("HUDScene") as HUDScene | undefined;
      hud?.showSaveNotice?.();
    }
  }

  private recoverFromCollapse(): void {
    const safeSleep = this.map.findObject("spawns", (o) => o.name === "poi_safe_sleep");
    const safeX = safeSleep?.x ?? this.map.widthInPixels / 2;
    const safeY = safeSleep?.y ?? this.map.heightInPixels / 2;

    this.player.setPosition(safeX, safeY);
    this.stats.resetCollapse();
    this.collapseRecovering = false;
    this.collapseRecoveryTimer = 0;

    this.cameras.main.flash(500, 0, 0, 0);
    this.autoSave();
  }

  private restoreDispositions(): void {
    const tigerTalks = (this.registry.get("TIGER_TALKS") as number) ?? 0;
    if (tigerTalks >= 2) {
      const entry = this.npcs.find((e) => e.cat.npcName === "Tiger");
      if (entry) {
        entry.cat.disposition = "friendly";
        entry.indicator.setDisposition("friendly");
      }
    }
    const jaycoTalks = (this.registry.get("JAYCO_TALKS") as number) ?? 0;
    if (jaycoTalks >= 1) {
      const entry = this.npcs.find((e) => e.cat.npcName === "Jayco");
      if (entry) {
        entry.cat.disposition = "friendly";
        entry.indicator.setDisposition("friendly");
      }
    }
  }

  // ──────────── NPC ────────────

  private updateNPCs(delta: number): void {
    for (const { cat, indicator } of this.npcs) {
      cat.setPhase(this.dayNight.currentPhase);
      cat.update(delta);
      indicator.update();

      if (!indicator.known) {
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, cat.x, cat.y);
        if (dist < LEARN_NAME_DISTANCE) {
          indicator.reveal();
          this.knownCats.add(cat.npcName);
          this.registry.set("KNOWN_CATS", Array.from(this.knownCats));
        }
      }
    }
  }

  spawnNPC(
    name: string,
    spriteKey: string,
    spawnPOI: string,
    disposition: "friendly" | "neutral" | "territorial",
    homeRadius: number,
    fallbackX: number,
    fallbackY: number,
  ): NPCCat {
    const point = this.map.findObject("spawns", (obj) => obj.name === spawnPOI);
    const x = point?.x ?? fallbackX;
    const y = point?.y ?? fallbackY;
    const cat = new NPCCat(this, {
      name,
      spriteKey,
      x,
      y,
      homeZone: { cx: x, cy: y, radius: homeRadius },
      disposition,
    });
    if (this.objectsLayer) {
      this.physics.add.collider(cat, this.objectsLayer);
    }
    const known = this.knownCats.has(name);
    const indicator = new ThreatIndicator(this, cat, name, disposition, known);
    this.npcs.push({ cat, indicator });
    return cat;
  }

  // ──────────── Food Sources ────────────

  private placeFoodSources(): void {
    const poi = (name: string) => this.map.findObject("spawns", (o) => o.name === name);
    const sources: Array<[string, string]> = [
      ["poi_feeding_station_1", "feeding_station"],
      ["poi_feeding_station_2", "feeding_station"],
      ["poi_fountain", "fountain"],
      ["poi_water_bowl_1", "water_bowl"],
      ["poi_water_bowl_2", "water_bowl"],
      ["poi_restaurant_scraps", "restaurant_scraps"],
      ["poi_safe_sleep", "safe_sleep"],
    ];
    for (const [poiName, type] of sources) {
      const obj = poi(poiName);
      if (obj) this.foodSources.addSource(type as any, obj.x ?? 0, obj.y ?? 0);
    }
    this.foodSources.addBugSpawns(this.map, 15);
  }

  // ──────────── Environment ────────────

  isUnderCanopy(worldX: number, worldY: number): boolean {
    if (!this.overheadLayer) return false;
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);
    const tile = this.overheadLayer.getTileAt(tileX, tileY);
    return tile !== null;
  }

  isNearShelter(worldX: number, worldY: number): boolean {
    const shelterNames = ["poi_pyramid_steps", "poi_starbucks", "poi_safe_sleep"];
    return shelterNames.some((name) => {
      const s = this.map.findObject("spawns", (o) => o.name === name);
      if (!s) return false;
      return Phaser.Math.Distance.Between(worldX, worldY, s.x ?? 0, s.y ?? 0) < 80;
    });
  }

  // ──────────── NPC Interaction ────────────

  private tryInteract(): void {
    let nearestEntry: NPCEntry | null = null;
    let nearestDist = Infinity;
    for (const entry of this.npcs) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, entry.cat.x, entry.cat.y);
      if (dist < INTERACTION_DISTANCE && dist < nearestDist) {
        nearestEntry = entry;
        nearestDist = dist;
      }
    }
    if (!nearestEntry) return;
    const cat = nearestEntry.cat;
    if (cat.state === "sleeping") {
      cat.triggerAlert();
      return;
    }
    this.showCatDialogue(cat);
  }

  private showCatDialogue(cat: NPCCat): void {
    const name = cat.npcName;
    switch (name) {
      case "Blacky": {
        const met = this.registry.get("MET_BLACKY") as boolean | undefined;
        if (!met) {
          this.dialogue.show(
            [
              "Mrrp. New here, are you?",
              "This is Ayala Triangle. The gardens are home to all of us.",
              "Find shade. Find food. Stay away from the roads.",
              "And at night... stay hidden. Not all humans are kind.",
            ],
            () => {
              this.registry.set("MET_BLACKY", true);
              this.knownCats.add("Blacky");
              this.registry.set("KNOWN_CATS", Array.from(this.knownCats));
              this.npcs.find((e) => e.cat === cat)?.indicator.reveal();
              this.autoSave();
            },
          );
        } else {
          this.dialogue.show(["Still here? Good. You're tougher than you look."]);
        }
        break;
      }
      case "Tiger": {
        const talks = (this.registry.get("TIGER_TALKS") as number) ?? 0;
        if (talks === 0) {
          this.dialogue.show(
            ["*The cat's ears flatten slightly. Its tail flicks once.*", '"Ssss. This is my spot."'],
            () => {
              this.registry.set("TIGER_TALKS", 1);
              this.knownCats.add("Tiger");
              this.registry.set("KNOWN_CATS", Array.from(this.knownCats));
              this.npcs.find((e) => e.cat === cat)?.indicator.reveal();
              this.autoSave();
            },
          );
        } else if (talks === 1) {
          this.dialogue.show(
            [
              "*The cat watches you approach but doesn't hiss this time.*",
              "\"...You again. There's food by the stone building at evening. Don't tell anyone.\"",
            ],
            () => {
              this.registry.set("TIGER_TALKS", 2);
              cat.disposition = "friendly";
              this.npcs.find((e) => e.cat === cat)?.indicator.setDisposition("friendly");
              this.autoSave();
            },
          );
        } else {
          this.dialogue.show(['"Mrrp. You can rest here. Under this tree. I\'ll keep watch."']);
        }
        break;
      }
      case "Jayco": {
        const talks = (this.registry.get("JAYCO_TALKS") as number) ?? 0;
        if (talks === 0) {
          this.dialogue.show(
            [
              "*This cat approaches with tail up. Curious.*",
              '"Prrrp! New face! I\'m Jayco. I know every corner of these steps."',
              '"The humans below \u2014 the coffee place \u2014 they leave good scraps. But watch for the guard."',
            ],
            () => {
              this.registry.set("JAYCO_TALKS", 1);
              this.knownCats.add("Jayco");
              this.registry.set("KNOWN_CATS", Array.from(this.knownCats));
              const entry = this.npcs.find((e) => e.cat === cat);
              entry?.indicator.reveal();
              entry?.indicator.setDisposition("friendly");
              cat.disposition = "friendly";
              this.autoSave();
            },
          );
        } else {
          this.dialogue.show(['"The ginger ones fight over the bench near the fountain. Stay clear at dusk."']);
        }
        break;
      }
      default:
        this.dialogue.show(["*The cat regards you warily.*"]);
    }
  }
}
