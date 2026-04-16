import Phaser from "phaser";
import { MammaCat } from "../sprites/MammaCat";
import { NPCCat } from "../sprites/NPCCat";
import { GuardNPC } from "../sprites/GuardNPC";
import { HumanNPC } from "../sprites/HumanNPC";
import type { HumanConfig } from "../sprites/HumanNPC";
import { DogNPC } from "../sprites/DogNPC";
import { DayNightCycle } from "../systems/DayNightCycle";
import { StatsSystem } from "../systems/StatsSystem";
import { FoodSourceManager } from "../systems/FoodSource";
import type { SourceType } from "../systems/FoodSource";
import { ThreatIndicator } from "../systems/ThreatIndicator";
import { SaveSystem } from "../systems/SaveSystem";
import { TrustSystem } from "../systems/TrustSystem";
import { EmoteSystem, type EmoteType } from "../systems/EmoteSystem";
import { ChapterSystem } from "../systems/ChapterSystem";
import { TerritorySystem } from "../systems/TerritorySystem";
import type { HUDScene } from "./HUDScene";
import { REST_HOLD_MS } from "../config/constants";
import {
  ScriptedDialogueService,
  type DialogueService,
  type DialogueResponse,
  type ConversationEntry,
} from "../services/DialogueService";
import { storeConversation, getRecentConversations } from "../services/ConversationStore";
import { CAT_DIALOGUE_SCRIPTS, getRandomColonyLine } from "../data/cat-dialogue";

const INTERACTION_DISTANCE = 50;
const LEARN_NAME_DISTANCE = 100;
const TILE_SIZE = 32;
const DEFAULT_ZOOM = 2.0; // changed from 2.5 16 Apr for testing only
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
  trust!: TrustSystem;

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
  private journalKey!: Phaser.Input.Keyboard.Key;
  private journalToggleLocked = false;
  journalOpenedFromPause = false;
  private groundLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private objectsLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private overheadLayer!: Phaser.Tilemaps.TilemapLayer | null;
  private map!: Phaser.Tilemaps.Tilemap;
  private knownCats: Set<string> = new Set();
  private shelterPoints: Array<{ x: number; y: number }> = [];
  private collapseRecoveryTimer = 0;
  private collapseRecovering = false;
  private emotes!: EmoteSystem;
  private chapters!: ChapterSystem;
  private chapterCheckTimer = 0;
  private humans: HumanNPC[] = [];
  private dogs: DogNPC[] = [];
  /** Tracks which cats have already shown narration this approach, to avoid repeating. */
  private narrationShown = new Set<string>();
  private dialogueService!: DialogueService;
  territory!: TerritorySystem;

  // Camille encounter sequence state
  private camilleNPC: HumanNPC | null = null;
  private manuNPC: HumanNPC | null = null;
  private kishNPC: HumanNPC | null = null;
  private camilleEncounterActive = false;

  // Snatcher tracking
  private snatchers: HumanNPC[] = [];
  private snatcherSpawnChecked = false;

  // Colony dynamics
  private colonyCount = 42;

  /** Dialogue lives in HUDScene (1x zoom) so it's always visible. */
  private get dialogue(): { isActive: boolean; show: (lines: string[], onComplete?: () => void) => void } {
    const hud = this.scene.get("HUDScene") as HUDScene | undefined;
    if (hud?.dialogue) return hud.dialogue;
    return { isActive: false, show: () => {} };
  }

  constructor() {
    super({ key: "GameScene" });
  }

  create(data?: { loadSave?: boolean; newGamePlus?: boolean; snatcherCapture?: boolean }): void {
    this.npcs = [];
    this.humans = [];
    this.dogs = [];
    this.shelterPoints = [];
    this.restHoldTimer = 0;
    this.restHoldActive = false;
    this.isPeeking = false;
    this.isPaused = false;
    this.collapseRecovering = false;
    this.collapseRecoveryTimer = 0;

    this.map = this.make.tilemap({ key: "atg" });
    const parkTileset = this.map.addTilesetImage("park-tiles", "park-tiles");
    if (!parkTileset) throw new Error('Failed to load tileset "park-tiles"');
    const treesTileset = this.map.addTilesetImage("trees-pale", "trees-pale");
    if (!treesTileset) throw new Error('Failed to load tileset "trees-pale"');
    const plantsTileset = this.map.addTilesetImage("plants", "plants");
    if (!plantsTileset) throw new Error('Failed to load tileset "plants"');
    const tilesets = [parkTileset, treesTileset, plantsTileset].filter(Boolean) as Phaser.Tilemaps.Tileset[];

    const rawGroundLayer = this.map.createLayer("ground", tilesets, 0, 0);
    if (rawGroundLayer && "setCollisionByProperty" in rawGroundLayer) {
      this.groundLayer = rawGroundLayer as Phaser.Tilemaps.TilemapLayer;
      this.groundLayer.setCollisionByProperty({ collides: true });
    }

    const rawObjectsLayer = this.map.createLayer("objects", tilesets, 0, 0);
    if (rawObjectsLayer && "setCollisionByProperty" in rawObjectsLayer) {
      this.objectsLayer = rawObjectsLayer as Phaser.Tilemaps.TilemapLayer;
      this.objectsLayer.setCollisionByProperty({ collides: true });
    }

    this.overheadLayer = this.map.createLayer("overhead", tilesets, 0, 0) as Phaser.Tilemaps.TilemapLayer | null;
    if (this.overheadLayer) {
      this.overheadLayer.setDepth(10);
    }
    this.cacheShelterPoints();

    const spawnPoint = this.map.findObject("spawns", (obj) => obj.name === "spawn_mammacat");
    let spawnX = spawnPoint?.x ?? this.map.widthInPixels / 2;
    let spawnY = spawnPoint?.y ?? this.map.heightInPixels / 2;

    this.stats = new StatsSystem();
    this.dayNight = new DayNightCycle(this);
    this.trust = new TrustSystem();
    this.emotes = new EmoteSystem();
    this.chapters = new ChapterSystem();
    this.chapterCheckTimer = 0;
    this.narrationShown = new Set();
    this.dialogueService = new ScriptedDialogueService(CAT_DIALOGUE_SCRIPTS);
    this.territory = new TerritorySystem();
    this.camilleNPC = null;
    this.manuNPC = null;
    this.kishNPC = null;
    this.camilleEncounterActive = false;
    this.snatchers = [];
    this.snatcherSpawnChecked = false;
    this.colonyCount = 42;

    // Clear story state from any prior session before restoring
    for (const key of [
      "MET_BLACKY",
      "TIGER_TALKS",
      "JAYCO_TALKS",
      "KNOWN_CATS",
      "CHAPTER",
      "CH1_RESTED",
      "FLUFFY_TALKS",
      "PEDIGREE_TALKS",
      "MET_GINGER_A",
      "MET_GINGER_B",
      "JAYCO_JR_TALKS",
      "JOURNAL_MET_DAYS",
      "VISITED_ZONE_6",
      "TERRITORY_CLAIMED",
      "TERRITORY_DAY",
      "CAMILLE_ENCOUNTER",
      "CAMILLE_ENCOUNTER_DAY",
      "COLONY_COUNT",
      "DUMPING_EVENTS_SEEN",
      "CATS_SNATCHED",
      "GAME_COMPLETED",
      "NEW_GAME_PLUS",
    ]) {
      this.registry.remove(key);
    }

    let savedSourceStates: Array<{ type: SourceType; x: number; y: number; lastUsedAt: number }> | undefined;
    if (data?.loadSave) {
      const save = SaveSystem.load();
      if (save) {
        spawnX = save.playerPosition.x;
        spawnY = save.playerPosition.y;
        this.stats.fromJSON(save.stats);
        this.dayNight.restore(save.timeOfDay, save.gameTimeMs);
        savedSourceStates = save.sourceStates;
        if (save.trust) this.trust.fromJSON(save.trust);
        if (save.territory) this.territory.fromJSON(save.territory);
        for (const [key, val] of Object.entries(save.variables)) {
          this.registry.set(key, val);
        }
        const savedChapter = save.variables.CHAPTER;
        if (typeof savedChapter === "number") {
          this.chapters.restore(savedChapter);
        }
        if (typeof save.variables.COLONY_COUNT === "number") {
          this.colonyCount = save.variables.COLONY_COUNT as number;
        }
      }
    }

    this.player = new MammaCat(this, spawnX, spawnY);

    if (this.territory.isClaimed) {
      this.player.setHasTerritory(true);
    }

    if (this.groundLayer) {
      this.physics.add.collider(this.player, this.groundLayer);
    }
    if (this.objectsLayer) {
      this.physics.add.collider(this.player, this.objectsLayer);
    }

    const savedKnown = this.registry.get("KNOWN_CATS") as string[] | undefined;
    this.knownCats = new Set(savedKnown ?? []);

    const blacky = this.spawnNPC("Blacky", "blacky", "spawn_blacky", "neutral", 150, 411, 1083);
    blacky.setTint(0x333333);
    this.spawnNPC("Tiger", "tiger", "spawn_tiger", "territorial", 200, 1141, 632);
    this.spawnNPC("Jayco", "jayco", "spawn_jayco", "friendly", 150, 1427, 484);

    this.spawnNPC("Jayco Jr", "jayco", "spawn_jayco_jr", "friendly", 100, 1470, 520, {
      scale: 0.7,
      walkSpeed: 40,
      hyperactive: true,
    });
    this.spawnNPC("Fluffy", "fluffy", "spawn_fluffy", "neutral", 180, 1500, 900);
    this.spawnNPC("Pedigree", "fluffy", "spawn_pedigree", "neutral", 150, 2500, 1700);
    this.spawnGingerTwins();
    this.spawnColonyCats();

    this.restoreDispositions();

    const guardPoint = this.map.findObject("spawns", (o) => o.name === "spawn_guard");
    this.guard = new GuardNPC(this, guardPoint?.x ?? 2169, guardPoint?.y ?? 1791);
    this.guard.setTarget(this.player);
    if (this.groundLayer) {
      this.physics.add.collider(this.guard, this.groundLayer);
    }
    if (this.objectsLayer) {
      this.physics.add.collider(this.guard, this.objectsLayer);
    }
    this.guardIndicator = new ThreatIndicator(this, this.guard, "Guard", "dangerous", true);

    this.spawnHumans();

    this.foodSources = new FoodSourceManager(this);
    if (savedSourceStates && savedSourceStates.length > 0) {
      this.foodSources.restoreFromStates(savedSourceStates);
    } else {
      this.placeFoodSources();
    }

    if (this.input.keyboard) {
      this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.restKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
      this.tabKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
      this.escapeKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
      this.journalKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J);

      // Prevent Tab from leaving the game canvas
      this.input.keyboard.addCapture("TAB");
    }

    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.setZoom(DEFAULT_ZOOM);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(50, 50);

    this.dayNight.on("newDay", () => {
      this.trust.survivedDay();
    });

    // New Game+ setup: full trust, all cats known, territory claimed
    if (data?.newGamePlus) {
      this.registry.set("NEW_GAME_PLUS", true);
      this.registry.set("CH1_RESTED", true);
      this.registry.set("MET_BLACKY", true);
      this.registry.set("TIGER_TALKS", 2);
      this.registry.set("JAYCO_TALKS", 1);
      this.registry.set("JAYCO_JR_TALKS", 1);
      this.registry.set("FLUFFY_TALKS", 1);
      this.registry.set("PEDIGREE_TALKS", 1);
      this.registry.set("MET_GINGER_A", true);
      this.registry.set("MET_GINGER_B", true);
      this.registry.set("VISITED_ZONE_6", true);
      this.registry.set("TERRITORY_CLAIMED", true);
      this.registry.set("CHAPTER", 6);
      this.chapters.restore(6);
      this.territory.claim(1);

      // Reveal and befriend all named cats
      for (const name of ["Blacky", "Tiger", "Jayco", "Jayco Jr", "Fluffy", "Pedigree", "Ginger", "Ginger B"]) {
        this.addKnownCat(name);
        this.trust.firstConversation(name);
        this.trust.returnConversation(name);
        this.trust.returnConversation(name);
        const entry = this.npcs.find((e) => e.cat.npcName === name);
        entry?.indicator.reveal();
        entry?.indicator.setDisposition("friendly");
        if (entry) entry.cat.disposition = "friendly";
      }
      // Set dispositions on Tiger and Jayco
      this.setNPCDisposition("Tiger", "friendly");
      this.setNPCDisposition("Jayco", "friendly");

      // Max out global trust
      for (let i = 0; i < 20; i++) this.trust.survivedDay();
    }

    if (!this.scene.isActive("HUDScene")) {
      this.scene.launch("HUDScene");
    }

    // Chapter 1 intro narration for new games
    if (!data?.loadSave && !data?.newGamePlus) {
      this.time.delayedCall(500, () => {
        const hud = this.scene.get("HUDScene") as HUDScene | undefined;
        const intro = this.chapters.getIntroNarration();
        if (hud && intro.length > 0) {
          this.dialogue.show(intro);
        }
      });
    }

    // Post-snatcher-capture narration on reload
    if (data?.snatcherCapture) {
      this.time.delayedCall(1000, () => {
        const hud = this.scene.get("HUDScene") as HUDScene | undefined;
        hud?.showNarration("You wake up gasping. A nightmare? No. A warning. Stay hidden at night.");
      });
    }
  }

  update(time: number, delta: number): void {
    // Escape must be checked before the pause gate so it can unpause.
    // When the journal is open, ESC closes it (same pattern as J key).
    if (this.escapeKey && Phaser.Input.Keyboard.JustDown(this.escapeKey)) {
      if (this.scene.isActive("JournalScene")) {
        this.scene.stop("JournalScene");
        if (this.journalOpenedFromPause) {
          this.journalOpenedFromPause = false;
          const hud = this.scene.get("HUDScene") as HUDScene | undefined;
          hud?.showPauseMenu?.();
        } else {
          this.resumeGame();
        }
      } else {
        this.togglePause();
      }
      return;
    }

    // Release J toggle lock only after the key is fully released.
    if (this.journalKey && !this.journalKey.isDown) {
      this.journalToggleLocked = false;
    }

    // J toggles the colony journal. Use key-locking to avoid double-toggles
    // when multiple scenes process the same key-down event in one frame.
    if (this.journalKey?.isDown && !this.journalToggleLocked) {
      this.journalToggleLocked = true;
      if (this.scene.isActive("JournalScene")) {
        this.scene.stop("JournalScene");
        if (this.journalOpenedFromPause) {
          this.journalOpenedFromPause = false;
          const hud = this.scene.get("HUDScene") as HUDScene | undefined;
          hud?.showPauseMenu?.();
        } else {
          this.resumeGame();
        }
      } else if (!this.isPaused && !this.dialogue.isActive) {
        this.openJournal();
      }
      return;
    }

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

    // ──── Resting state ────
    if (this.player.isResting) {
      this.updateResting(deltaSec);
      this.updateNPCs(delta);
      this.updateHumans(delta);
      this.foodSources.update(this.dayNight.currentPhase, time);
      this.guard.update(delta);
      this.guardIndicator.update();
      return;
    }

    // ──── Tab peek (toggle) ────
    if (this.tabKey && Phaser.Input.Keyboard.JustDown(this.tabKey)) {
      this.isPeeking = !this.isPeeking;
      this.cameras.main.zoomTo(this.isPeeking ? PEEK_ZOOM : DEFAULT_ZOOM, ZOOM_DURATION);
    }
    if (this.isPeeking) {
      if (this.player.isMoving) {
        this.isPeeking = false;
        this.cameras.main.zoomTo(DEFAULT_ZOOM, ZOOM_DURATION);
      } else {
        this.player.setVelocity(0);
        this.updateNPCs(delta);
        this.updateHumans(delta);
        this.foodSources.update(this.dayNight.currentPhase, time);
        this.guard.update(delta);
        this.guardIndicator.update();
        return;
      }
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
      if (usedSource) {
        // Eating near other cats builds trust
        for (const { cat } of this.npcs) {
          if (Phaser.Math.Distance.Between(this.player.x, this.player.y, cat.x, cat.y) < LEARN_NAME_DISTANCE) {
            this.trust.seenEating();
            break;
          }
        }
      } else {
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

        // Chapter 1 completion: first rest marks the chapter as done
        if (!this.registry.get("CH1_RESTED")) {
          this.registry.set("CH1_RESTED", true);
          const hud = this.scene.get("HUDScene") as HUDScene | undefined;
          hud?.showNarration("Morning will come. You'll figure this out.");
        }

        if (this.isNearShelter(this.player.x, this.player.y)) {
          this.autoSave();
        }
      }
    } else {
      this.restHoldTimer = 0;
      this.restHoldActive = false;
    }

    // ──── Normal movement ────
    const inShade = this.isUnderCanopy(this.player.x, this.player.y);
    const inShelter = this.isNearShelter(this.player.x, this.player.y);

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

    this.foodSources.update(this.dayNight.currentPhase, time);
    this.guard.update(delta);
    this.guardIndicator.update();
    this.updateNPCs(delta);
    this.updateHumans(delta);

    // Check chapter progression every 5 seconds
    this.chapterCheckTimer += delta;
    if (this.chapterCheckTimer >= 5_000) {
      this.chapterCheckTimer = 0;
      this.checkZone6Visit();
      this.checkChapterProgression();
      this.recheckTerritoryEligibility();
      this.checkCamilleEncounter();
      this.checkSnatcherSpawn();
      this.checkColonyDynamics();
      this.checkTerritoryBenefits();
    }
  }

  // ──────────── Resting ────────────

  private updateResting(deltaSec: number): void {
    // Guard pushback can still run while resting; force zero velocity each frame.
    this.player.setVelocity(0);

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
    const hud = this.scene.get("HUDScene") as HUDScene | undefined;
    hud?.hidePauseMenu?.();
  }

  getNPCDisposition(name: string): string | undefined {
    return this.npcs.find((entry) => entry.cat.npcName === name)?.cat.disposition;
  }

  quitToTitle(): void {
    this.isPaused = false;
    this.physics.resume();
    this.scene.stop("HUDScene");
    this.scene.start("StartScene");
  }

  // ──────────── Journal ────────────

  private openJournal(): void {
    this.isPaused = true;
    this.physics.pause();
    if (!this.scene.isActive("JournalScene")) {
      this.scene.launch("JournalScene");
    }
  }

  // ──────────── Chapters ────────────

  private checkChapterProgression(): void {
    if (this.dialogue.isActive) return;
    if (this.camilleEncounterActive) return;

    const namedKnown = new Set([...this.knownCats].filter((name) => !name.startsWith("Colony Cat")));
    const triggered = this.chapters.check({
      trust: this.trust,
      dayNight: this.dayNight,
      knownCats: namedKnown,
      registry: this.registry,
      territory: this.territory,
    });
    if (triggered) {
      const narration = this.chapters.consumeNarration();
      if (narration && narration.length > 0) {
        this.dialogue.show(narration, () => {
          this.autoSave();
        });
      }

      // Chapter-specific triggers
      const ch = this.chapters.chapter;
      if (ch === 4) {
        this.onChapter4Start();
      } else if (ch === 6) {
        this.onChapter6Start();
      }
    }
  }

  // ──────────── Chapter 4: Territory ────────────

  /**
   * Track when the player first enters Zone 6 (The Shops area).
   * Zone 6 is approximately x > 2100, y < 700.
   */
  private checkZone6Visit(): void {
    if (this.registry.get("VISITED_ZONE_6")) return;
    if (this.player.x > 2100 && this.player.y < 700) {
      this.registry.set("VISITED_ZONE_6", true);
    }
  }

  private onChapter4Start(): void {
    // Territory negotiation with Jayco handled through dialogue
    this.beginTerritoryNegotiation();
  }

  private beginTerritoryNegotiation(): void {
    if (this.territory.isClaimed) return;

    const jaycoTrust = this.trust.getCatTrust("Jayco");
    const hud = this.scene.get("HUDScene") as HUDScene | undefined;

    if (jaycoTrust >= 50 || this.trust.global >= 80) {
      this.time.delayedCall(3000, () => {
        if (this.dialogue.isActive) return;
        this.dialogue.show(['"You want to stay? ...There\'s room. The steps are wide enough for all of us."'], () => {
          this.claimTerritory();
        });
      });
    } else {
      this.time.delayedCall(3000, () => {
        if (this.dialogue.isActive) return;
        hud?.showNarration("Jayco watches you from the steps. You haven't earned his trust yet.");
      });
    }
  }

  /**
   * Re-check territory eligibility periodically if Chapter 4 is active
   * but territory hasn't been claimed yet.
   */
  private recheckTerritoryEligibility(): void {
    if (this.chapters.chapter !== 4) return;
    if (this.territory.isClaimed) return;
    if (this.dialogue.isActive) return;
    if (!this.isInTerritory(this.player.x, this.player.y) && !(this.player.x > 2100 && this.player.y < 700)) return;

    const jaycoTrust = this.trust.getCatTrust("Jayco");
    if (jaycoTrust >= 50 || this.trust.global >= 80) {
      this.beginTerritoryNegotiation();
    }
  }

  private claimTerritory(): void {
    this.territory.claim(this.dayNight.dayCount);
    this.registry.set("TERRITORY_CLAIMED", true);
    this.registry.set("TERRITORY_DAY", this.dayNight.dayCount);
    this.player.setHasTerritory(true);

    const hud = this.scene.get("HUDScene") as HUDScene | undefined;
    this.dialogue.show(["For the first time since the car door slammed, you have a place. Your place."], () => {
      hud?.showNarration("Territory established: The Shops pyramid steps");
      this.autoSave();
    });
  }

  /**
   * Check if Mamma Cat is inside her claimed territory.
   * Territory zone: near The Shops / Pyramid Steps.
   */
  isInTerritory(x: number, y: number): boolean {
    if (!this.territory.isClaimed) return false;
    const shopsPOI = this.map.findObject("spawns", (o) => o.name === "poi_pyramid_steps");
    if (!shopsPOI) return false;
    return Phaser.Math.Distance.Between(x, y, shopsPOI.x ?? 0, shopsPOI.y ?? 0) < 120;
  }

  // ──────────── Chapter 5: Camille Encounters ────────────

  /**
   * Check if conditions are met to spawn a Camille encounter for this evening.
   * Called during phase transitions or periodic checks.
   */
  private checkCamilleEncounter(): void {
    if (this.chapters.chapter < 5) return;
    if (this.dayNight.currentPhase !== "evening") {
      this.camilleEncounterActive = false;
      return;
    }
    if (this.camilleEncounterActive) return;

    const currentEncounter = (this.registry.get("CAMILLE_ENCOUNTER") as number) ?? 0;
    if (currentEncounter >= 5) return;

    // One encounter per game day — check if we've already done one today
    const lastDay = (this.registry.get("CAMILLE_ENCOUNTER_DAY") as number) ?? 0;
    if (lastDay >= this.dayNight.dayCount) return;

    // 60% chance per eligible evening (100% for first encounter)
    if (currentEncounter > 0 && Math.random() > 0.6) return;

    this.startCamilleEncounter(currentEncounter + 1);
  }

  private startCamilleEncounter(encounterNum: number): void {
    this.camilleEncounterActive = true;
    this.registry.set("CAMILLE_ENCOUNTER", encounterNum);
    this.registry.set("CAMILLE_ENCOUNTER_DAY", this.dayNight.dayCount);

    // Spawn Camille from the underpass area
    const underpasses = this.map.findObject("spawns", (o) => o.name === "spawn_blacky");
    const spawnX = (underpasses?.x ?? 411) - 50;
    const spawnY = underpasses?.y ?? 1083;

    // Target: The Shops area
    const shopsPOI = this.map.findObject("spawns", (o) => o.name === "poi_pyramid_steps");
    const targetX = shopsPOI?.x ?? 2200;
    const targetY = shopsPOI?.y ?? 500;

    const camilleConfig: HumanConfig = {
      type: "camille",
      speed: 35,
      activePhases: ["evening"],
      path: [
        { x: spawnX, y: spawnY },
        { x: 1200, y: 900 },
        { x: targetX, y: targetY },
      ],
    };

    this.camilleNPC = new HumanNPC(this, camilleConfig);
    if (this.groundLayer) this.physics.add.collider(this.camilleNPC, this.groundLayer);
    if (this.objectsLayer) this.physics.add.collider(this.camilleNPC, this.objectsLayer);
    this.humans.push(this.camilleNPC);

    // Spawn Manu from Encounter 3 onwards
    if (encounterNum >= 3) {
      const manuConfig: HumanConfig = {
        type: "manu",
        speed: 35,
        activePhases: ["evening"],
        path: [
          { x: spawnX + 30, y: spawnY + 20 },
          { x: 1200 + 30, y: 900 + 20 },
          { x: targetX + 30, y: targetY + 20 },
        ],
      };
      this.manuNPC = new HumanNPC(this, manuConfig);
      if (this.groundLayer) this.physics.add.collider(this.manuNPC, this.groundLayer);
      if (this.objectsLayer) this.physics.add.collider(this.manuNPC, this.objectsLayer);
      this.humans.push(this.manuNPC);
    }

    // Spawn Kish from Encounter 4 onwards
    if (encounterNum >= 4) {
      const kishConfig: HumanConfig = {
        type: "feeder",
        speed: 45,
        activePhases: ["evening"],
        path: [
          { x: spawnX - 20, y: spawnY + 30 },
          { x: 1200 - 20, y: 900 + 30 },
          { x: targetX - 20, y: targetY + 30 },
        ],
      };
      this.kishNPC = new HumanNPC(this, kishConfig);
      this.kishNPC.setScale(0.85);
      if (this.groundLayer) this.physics.add.collider(this.kishNPC, this.groundLayer);
      if (this.objectsLayer) this.physics.add.collider(this.kishNPC, this.objectsLayer);
      this.humans.push(this.kishNPC);
    }

    // Schedule the encounter narrative
    this.time.delayedCall(5000, () => {
      this.playCamilleEncounterNarrative(encounterNum);
    });
  }

  private playCamilleEncounterNarrative(encounterNum: number): void {
    const hud = this.scene.get("HUDScene") as HUDScene | undefined;

    switch (encounterNum) {
      case 1:
        hud?.showNarration(
          "A new human. She moves differently from the others. Slowly. Gently. She smells like... kindness?",
        );
        break;

      case 2:
        this.time.delayedCall(8000, () => {
          if (this.dialogue.isActive) return;
          this.camilleNPC?.playCrouchToward(this.player.x);
          this.dialogue.show(
            [
              "She sees you. She's not coming closer. She's... waiting. For you.",
              "She places a treat on the ground between you. Doesn't move closer.",
            ],
            () => {
              hud?.showNarration("She watches you eat. She doesn't reach for you. She understands.");
              this.stats.restore("hunger", 30);
            },
          );
        });
        break;

      case 3:
        this.time.delayedCall(10000, () => {
          if (this.dialogue.isActive) return;
          this.camilleNPC?.playCrouchToward(this.player.x);
          this.dialogue.show(
            [
              "She closes her eyes. Slowly. Opens them again. That means... trust.",
              "You've seen other cats do this.",
              "Slow blink back?",
            ],
            () => {
              this.emotes.show(this, this.player, "heart");
              if (this.camilleNPC) this.emotes.show(this, this.camilleNPC, "heart");
              hud?.showNarration("Something shifts between you. A thread, invisible but real.");
            },
          );
        });
        break;

      case 4:
        this.time.delayedCall(10000, () => {
          if (this.dialogue.isActive) return;
          this.camilleNPC?.playCrouchToward(this.player.x);
          this.dialogue.show(
            [
              "Her hand smells like fish treats and soap. And something else. Home.",
              "You push your head against her fingers. You haven't done this since... before.",
            ],
            () => {
              this.emotes.show(this, this.player, "heart");
              hud?.showNarration("The small one is loud. But Camille keeps her still. She understands you.");
            },
          );
        });
        break;

      case 5:
        this.time.delayedCall(12000, () => {
          if (this.dialogue.isActive) return;
          this.dialogue.show(
            [
              "She has a box. You've seen boxes before. Cats go in. They don't come back.",
              "This is different. She's not grabbing. She's asking.",
              "And you... you want to say yes.",
              "The garden shrinks behind you. The smells change. The sounds change.",
              "But the hand on the carrier is warm. And for the first time in a long time... you're not afraid.",
            ],
            () => {
              this.autoSave();
              this.startChapter6Sequence();
            },
          );
        });
        break;
    }
  }

  // ──────────── Chapter 6: Home ────────────

  private onChapter6Start(): void {
    this.startChapter6Sequence();
  }

  private startChapter6Sequence(): void {
    // Fade to black
    this.cameras.main.fade(2000, 0, 0, 0, false, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress >= 1) {
        this.showChapter6Narration();
      }
    });
  }

  private showChapter6Narration(): void {
    this.dialogue.show(
      [
        "A door opens. A room. Soft floor. A bed — a real bed, with a blanket.",
        "A bowl of water. Fresh. A plate of food. Just for you.",
        "Camille sits on the floor beside you. She doesn't grab. She just... sits.",
        "And you climb into her lap. And you close your eyes. And the purring starts before you even decide to purr.",
        "You are Mamma Cat. You were lost. Now you are found.",
        "You are home.",
      ],
      () => {
        this.registry.set("GAME_COMPLETED", true);
        this.autoSave();
        this.startEpilogue();
      },
    );
  }

  private startEpilogue(): void {
    this.scene.stop("HUDScene");
    this.scene.start("EpilogueScene");
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
      this.foodSources.getSourceStates(),
      this.trust.toJSON(),
      this.territory.toJSON(),
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
      this.setNPCDisposition("Tiger", "friendly");
    }
    const jaycoTalks = (this.registry.get("JAYCO_TALKS") as number) ?? 0;
    if (jaycoTalks >= 1) {
      this.setNPCDisposition("Jayco", "friendly");
    }

    for (const { cat } of this.npcs) {
      this.syncTrustDisposition(cat.npcName);
    }
  }

  /**
   * Re-evaluate a cat's disposition based on current trust thresholds
   * and update both the NPCCat and its ThreatIndicator. Safe to call
   * after any trust change -- it only promotes, never demotes.
   */
  private syncTrustDisposition(catName: string): void {
    const entry = this.npcs.find((e) => e.cat.npcName === catName);
    if (!entry) return;

    const catTrust = this.trust.getCatTrust(catName);
    if (catTrust >= 50 && entry.cat.disposition !== "friendly") {
      entry.cat.disposition = "friendly";
      entry.indicator.setDisposition("friendly");
    } else if (catTrust >= 15 && entry.cat.disposition === "territorial") {
      entry.cat.disposition = "neutral";
      entry.indicator.setDisposition("neutral");
    }
  }

  private awardFirstConversation(catName: string): void {
    this.trust.firstConversation(catName);
    this.syncTrustDisposition(catName);
  }

  private awardReturnConversation(catName: string): void {
    this.trust.returnConversation(catName);
    this.syncTrustDisposition(catName);
  }

  private setNPCDisposition(name: string, disposition: "friendly" | "neutral" | "territorial" | "wary"): void {
    const entry = this.npcs.find((e) => e.cat.npcName === name);
    if (entry) {
      entry.cat.disposition = disposition;
      entry.indicator.setDisposition(disposition);
    }
  }

  private addKnownCat(name: string): void {
    this.knownCats.add(name);
    this.registry.set("KNOWN_CATS", Array.from(this.knownCats));

    const metDays = (this.registry.get("JOURNAL_MET_DAYS") as Record<string, number> | undefined) ?? {};
    if (typeof metDays[name] !== "number") {
      metDays[name] = this.dayNight.dayCount;
      this.registry.set("JOURNAL_MET_DAYS", metDays);
    }
  }

  // ──────────── NPC ────────────

  private updateNPCs(delta: number): void {
    const now = this.time.now;
    const hud = this.scene.get("HUDScene") as HUDScene | undefined;

    for (const { cat, indicator } of this.npcs) {
      cat.setPhase(this.dayNight.currentPhase);
      cat.update(delta);
      indicator.update();

      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, cat.x, cat.y);

      if (!indicator.known) {
        if (dist < LEARN_NAME_DISTANCE) {
          indicator.reveal();
          this.addKnownCat(cat.npcName);
        }
      }

      // Proximity trust: being near cats builds trust over time
      if (dist < LEARN_NAME_DISTANCE && cat.state !== "sleeping") {
        this.trust.proximityTick(cat.npcName, now);
        this.syncTrustDisposition(cat.npcName);
      }

      // Body language emotes and contextual narration on approach
      if (dist < 64) {
        this.showBodyLanguage(cat, dist, hud);
      } else if (dist > LEARN_NAME_DISTANCE) {
        // Player moved away; allow narration again on re-approach
        this.narrationShown.delete(cat.npcName);
      }
    }
  }

  private showBodyLanguage(cat: NPCCat, _dist: number, hud: HUDScene | undefined): void {
    const catTrust = this.trust.getCatTrust(cat.npcName);
    const effectiveDisposition = catTrust >= 50 ? "friendly" : cat.disposition;

    // Show emote on the NPC
    if (cat.state === "sleeping") {
      this.emotes.show(this, cat, "sleep");
    } else if (effectiveDisposition === "friendly") {
      this.emotes.show(this, cat, "heart");
      this.emotes.show(this, this.player, "heart");
    } else if (effectiveDisposition === "territorial") {
      this.emotes.show(this, cat, "hostile");
    } else if (effectiveDisposition === "wary") {
      this.emotes.show(this, cat, "alert");
    } else if (effectiveDisposition === "neutral") {
      this.emotes.show(this, cat, "curious");
    }

    // Contextual narration (once per approach)
    if (this.narrationShown.has(cat.npcName)) return;
    this.narrationShown.add(cat.npcName);

    const narration = this.getNarrationForCat(cat, effectiveDisposition);
    if (narration && hud) {
      hud.showNarration(narration);
    }
  }

  private getNarrationForCat(cat: NPCCat, effectiveDisposition: string): string | null {
    if (cat.state === "sleeping") {
      return "This cat is curled up tight, breathing softly.";
    }
    switch (effectiveDisposition) {
      case "friendly":
        return "This cat's tail is up. A good sign.";
      case "neutral":
        return "This cat watches you carefully. It hasn't decided about you yet.";
      case "wary":
        return "This cat's tail is low and flicking. It doesn't want you here.";
      case "territorial":
        return "This cat's back arches. Its fur bristles. Back away.";
      default:
        return null;
    }
  }

  spawnNPC(
    name: string,
    spriteKey: string,
    spawnPOI: string,
    disposition: "friendly" | "neutral" | "territorial" | "wary",
    homeRadius: number,
    fallbackX: number,
    fallbackY: number,
    opts?: {
      scale?: number;
      walkSpeed?: number;
      hyperactive?: boolean;
      animPrefix?: string;
      offsetX?: number;
      offsetY?: number;
    },
  ): NPCCat {
    const point = this.map.findObject("spawns", (obj) => obj.name === spawnPOI);
    const x = (point?.x ?? fallbackX) + (opts?.offsetX ?? 0);
    const y = (point?.y ?? fallbackY) + (opts?.offsetY ?? 0);
    const cat = new NPCCat(this, {
      name,
      spriteKey,
      x,
      y,
      homeZone: { cx: x, cy: y, radius: homeRadius },
      disposition,
      scale: opts?.scale,
      walkSpeed: opts?.walkSpeed,
      hyperactive: opts?.hyperactive,
      animPrefix: opts?.animPrefix,
    });
    if (this.groundLayer) {
      this.physics.add.collider(cat, this.groundLayer);
    }
    if (this.objectsLayer) {
      this.physics.add.collider(cat, this.objectsLayer);
    }
    const known = this.knownCats.has(name);
    const indicator = new ThreatIndicator(this, cat, name, disposition, known);
    this.npcs.push({ cat, indicator });
    return cat;
  }

  private spawnGingerTwins(): void {
    const ginger = this.spawnNPC("Ginger", "fluffy", "spawn_ginger", "wary", 200, 750, 1250);
    ginger.setTint(0xffaa44);
    const gingerB = this.spawnNPC("Ginger B", "fluffy", "spawn_ginger", "wary", 200, 750, 1250, {
      offsetX: 60,
    });
    gingerB.setTint(0xffaa44);
  }

  private spawnColonyCats(): void {
    const sprites = ["mammacat", "blacky", "tiger", "jayco", "fluffy"];
    const dispositions: Array<"neutral" | "wary" | "friendly" | "territorial"> = [
      "neutral",
      "neutral",
      "neutral",
      "neutral",
      "wary",
      "wary",
      "wary",
      "friendly",
      "friendly",
      "territorial",
    ];

    // Scatter across distinct zones matching the new ATG map layout
    const zones = [
      { cx: 1400, cy: 800, radius: 250 }, // Central Gardens north
      { cx: 1600, cy: 1100, radius: 300 }, // Central Gardens south
      { cx: 900, cy: 1000, radius: 200 }, // Western gardens / fountain area
      { cx: 2200, cy: 600, radius: 200 }, // Eastern gardens near Shops
      { cx: 2400, cy: 1500, radius: 200 }, // Southeast / Blackbird approach
    ];

    const count = 12;
    for (let i = 0; i < count; i++) {
      const zone = zones[i % zones.length]!;
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * zone.radius * 0.6;
      const x = zone.cx + Math.cos(angle) * r;
      const y = zone.cy + Math.sin(angle) * r;
      const sprite = sprites[Math.floor(Math.random() * sprites.length)]!;
      const disp = dispositions[Math.floor(Math.random() * dispositions.length)]!;
      const homeRadius = 80 + Math.random() * 80;

      const cat = new NPCCat(this, {
        name: `Colony Cat ${i + 1}`,
        spriteKey: sprite,
        x,
        y,
        homeZone: { cx: x, cy: y, radius: homeRadius },
        disposition: disp,
      });
      if (this.groundLayer) {
        this.physics.add.collider(cat, this.groundLayer);
      }
      if (this.objectsLayer) {
        this.physics.add.collider(cat, this.objectsLayer);
      }
      const indicator = new ThreatIndicator(this, cat, "???", disp, false);
      this.npcs.push({ cat, indicator });
    }
  }

  // ──────────── Humans ────────────

  private spawnHumans(): void {
    const configs: HumanConfig[] = [
      // Jogger 1: long loop through central gardens via main walkways
      {
        type: "jogger",
        speed: 100,
        activePhases: ["dawn", "evening"],
        path: [
          { x: 600, y: 1100 },
          { x: 1200, y: 700 },
          { x: 1800, y: 600 },
          { x: 2300, y: 500 },
          { x: 2300, y: 1000 },
          { x: 1600, y: 1200 },
          { x: 1000, y: 1300 },
        ],
      },
      // Jogger 2: shorter central gardens loop
      {
        type: "jogger",
        speed: 90,
        activePhases: ["dawn", "evening"],
        path: [
          { x: 1200, y: 800 },
          { x: 1700, y: 700 },
          { x: 1900, y: 1000 },
          { x: 1400, y: 1100 },
        ],
      },
      ...this.buildFeederConfigs(),
      // Dog walker 1: western gardens near fountain and underpass
      {
        type: "dogwalker",
        speed: 60,
        activePhases: ["dawn", "evening", "day"],
        path: [
          { x: 550, y: 1000 },
          { x: 800, y: 900 },
          { x: 1100, y: 1000 },
          { x: 1100, y: 1200 },
          { x: 800, y: 1300 },
          { x: 550, y: 1200 },
        ],
      },
      // Dog walker 2: eastern gardens near The Shops and restaurants
      {
        type: "dogwalker",
        speed: 55,
        activePhases: ["dawn", "evening"],
        path: [
          { x: 1900, y: 600 },
          { x: 2200, y: 700 },
          { x: 2400, y: 1000 },
          { x: 2100, y: 1300 },
          { x: 1900, y: 1000 },
        ],
      },
    ];

    const walkerDogKeys = Phaser.Utils.Array.Shuffle(["SmallDog", "BrownDog", "WhiteDog"]);
    let walkerDogIdx = 0;

    for (const config of configs) {
      const human = new HumanNPC(this, config);
      if (this.groundLayer) {
        this.physics.add.collider(human, this.groundLayer);
      }
      if (this.objectsLayer) {
        this.physics.add.collider(human, this.objectsLayer);
      }
      this.humans.push(human);

      if (config.type === "dogwalker") {
        const dogKey = walkerDogKeys[walkerDogIdx % walkerDogKeys.length]!;
        this.dogs.push(new DogNPC(this, human, dogKey));
        walkerDogIdx++;
      }
    }
  }

  /**
   * Build feeder configs with paths anchored to actual map POI positions.
   * Each feeder walks from an approach point to the feeding station,
   * lingers there, then walks back out (one trip, no looping).
   */
  private buildFeederConfigs(): HumanConfig[] {
    const stationDefs: Array<{
      poi: string;
      approachOffset: { dx: number; dy: number };
    }> = [
      { poi: "poi_feeding_station_1", approachOffset: { dx: -200, dy: 200 } },
      { poi: "poi_feeding_station_2", approachOffset: { dx: 200, dy: -200 } },
      { poi: "poi_feeding_station_3", approachOffset: { dx: -200, dy: -150 } },
    ];

    const configs: HumanConfig[] = [];
    for (const def of stationDefs) {
      const obj = this.map.findObject("spawns", (o) => o.name === def.poi);
      if (!obj) continue;

      const stationX = obj.x ?? 0;
      const stationY = obj.y ?? 0;
      const entryX = stationX + def.approachOffset.dx;
      const entryY = stationY + def.approachOffset.dy;

      configs.push({
        type: "feeder",
        speed: 40,
        activePhases: ["dawn", "evening"],
        lingerSec: 45,
        lingerWaypointIndex: 1,
        exitAfterLinger: true,
        path: [
          { x: entryX, y: entryY },
          { x: stationX, y: stationY },
          { x: entryX, y: entryY },
        ],
      });
    }
    return configs;
  }

  private updateHumans(delta: number): void {
    const now = this.time.now;
    for (const human of this.humans) {
      human.setPhase(this.dayNight.currentPhase);
      human.update(delta);

      // Joggers passing near NPC cats trigger alert
      if (human.humanType === "jogger" && human.visible) {
        for (const { cat } of this.npcs) {
          if (
            cat.state !== "sleeping" &&
            cat.state !== "alert" &&
            Phaser.Math.Distance.Between(human.x, human.y, cat.x, cat.y) < 64
          ) {
            cat.triggerAlert();
          }
        }
      }
    }

    for (const dog of this.dogs) {
      dog.update(now, this.player, this.npcs, this.emotes, this);
    }

    // Snatcher detection during night
    if (this.dayNight.currentPhase === "night") {
      this.checkSnatcherDetection();
    }

    // NPC cats flee from snatchers
    if (this.snatchers.length > 0) {
      for (const snatcher of this.snatchers) {
        if (!snatcher.visible) continue;
        for (const { cat } of this.npcs) {
          if (cat.state === "sleeping" || cat.state === "alert" || cat.state === "fleeing") continue;
          const dist = Phaser.Math.Distance.Between(snatcher.x, snatcher.y, cat.x, cat.y);
          if (dist < 160) {
            cat.triggerFlee(snatcher.x, snatcher.y);
          }
        }
      }
    }
  }

  // ──────────── Food Sources ────────────

  private placeFoodSources(): void {
    const poi = (name: string) => this.map.findObject("spawns", (o) => o.name === name);
    const sources: Array<[string, SourceType]> = [
      ["poi_feeding_station_1", "feeding_station"],
      ["poi_feeding_station_2", "feeding_station"],
      ["poi_feeding_station_3", "feeding_station"],
      ["poi_fountain", "fountain"],
      ["poi_fountain_exchange", "fountain"],
      ["poi_water_bowl_1", "water_bowl"],
      ["poi_water_bowl_2", "water_bowl"],
      ["poi_water_bowl_3", "water_bowl"],
      ["poi_starbucks_water", "water_bowl"],
      ["poi_restaurant_scraps", "restaurant_scraps"],
      ["poi_restaurant_scraps_manam", "restaurant_scraps"],
      ["poi_shops_supermarket", "restaurant_scraps"],
    ];
    for (const [poiName, type] of sources) {
      const obj = poi(poiName);
      if (obj) this.foodSources.addSource(type, obj.x ?? 0, obj.y ?? 0);
    }
    this.foodSources.addBugSpawns(this.map, 20);
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
    return this.shelterPoints.some((s) => Phaser.Math.Distance.Between(worldX, worldY, s.x, s.y) < 80);
  }

  private cacheShelterPoints(): void {
    const shelterNames = [
      "poi_pyramid_steps",
      "poi_starbucks",
      "poi_safe_sleep",
      "poi_safe_sleep_central",
      "poi_safe_sleep_blackbird",
      "poi_covered_area",
      "poi_escalator",
      "poi_library",
    ];
    this.shelterPoints = shelterNames
      .map((name) => this.map.findObject("spawns", (o) => o.name === name))
      .filter((s): s is Phaser.Types.Tilemaps.TiledObject => Boolean(s))
      .map((s) => ({ x: s.x ?? 0, y: s.y ?? 0 }));
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

    if (name.startsWith("Colony Cat")) {
      this.dialogue.show([getRandomColonyLine()]);
      return;
    }

    this.requestCatDialogue(cat);
  }

  /**
   * Request dialogue from the DialogueService, show it, and process the
   * response events on completion. Conversation is stored in IndexedDB.
   */
  private async requestCatDialogue(cat: NPCCat): Promise<void> {
    const name = cat.npcName;
    const trustBefore = this.trust.getCatTrust(name);

    const history = await getRecentConversations(name, 10);
    const conversationHistory: ConversationEntry[] = history.map((r) => ({
      timestamp: r.timestamp,
      speaker: r.speaker,
      text: r.lines.join(" "),
    }));

    const request = {
      speaker: name,
      speakerType: "cat" as const,
      target: "Mamma Cat",
      gameState: {
        chapter: this.chapters.chapter,
        timeOfDay: this.dayNight.currentPhase,
        trustGlobal: this.trust.global,
        trustWithSpeaker: trustBefore,
        hunger: this.stats.hunger,
        thirst: this.stats.thirst,
        energy: this.stats.energy,
        daysSurvived: this.dayNight.dayCount,
        knownCats: Array.from(this.knownCats),
        recentEvents: [] as string[],
      },
      conversationHistory,
    };

    const response = await this.dialogueService.getDialogue(request);

    if (response.narration) {
      const hud = this.scene.get("HUDScene") as HUDScene | undefined;
      hud?.showNarration(response.narration);
    }

    this.dialogue.show(response.lines, () => {
      this.processDialogueResponse(cat, name, trustBefore, response);
    });
  }

  /**
   * Handle all side effects from a completed dialogue:
   * trust awards, registry updates, indicator reveals, disposition
   * changes, conversation storage, and auto-saves.
   */
  private processDialogueResponse(cat: NPCCat, catName: string, trustBefore: number, response: DialogueResponse): void {
    const event = response.event;
    if (!event) return;

    const isFirst = event.endsWith("_first");

    if (isFirst) {
      this.addKnownCat(catName);
      this.npcs.find((e) => e.cat === cat)?.indicator.reveal();
      this.awardFirstConversation(catName);
    } else if (event.endsWith("_return") || event.endsWith("_warmup")) {
      this.awardReturnConversation(catName);
    }

    // Cat-specific event handling for registry and disposition changes
    switch (event) {
      case "blacky_first":
        this.registry.set("MET_BLACKY", true);
        break;
      case "tiger_first":
        this.registry.set("TIGER_TALKS", 1);
        break;
      case "tiger_warmup":
        this.registry.set("TIGER_TALKS", 2);
        cat.disposition = "friendly";
        this.npcs.find((e) => e.cat === cat)?.indicator.setDisposition("friendly");
        break;
      case "jayco_first":
        this.registry.set("JAYCO_TALKS", 1);
        cat.disposition = "friendly";
        {
          const entry = this.npcs.find((e) => e.cat === cat);
          entry?.indicator.setDisposition("friendly");
        }
        break;
      case "jaycojr_first":
        this.registry.set("JAYCO_JR_TALKS", 1);
        break;
      case "fluffy_first":
        this.registry.set("FLUFFY_TALKS", 1);
        break;
      case "pedigree_first":
        this.registry.set("PEDIGREE_TALKS", 1);
        break;
      case "ginger_first":
        this.registry.set("MET_GINGER_A", true);
        break;
      case "gingerb_first":
        this.registry.set("MET_GINGER_B", true);
        break;
    }

    if (response.emote) {
      this.emotes.show(this, cat, response.emote as EmoteType);
    }

    if (isFirst) {
      this.autoSave();
    }

    // Persist to IndexedDB for Phase 5 AI context
    storeConversation({
      speaker: catName,
      timestamp: this.dayNight.totalGameTimeMs,
      gameDay: this.dayNight.dayCount,
      lines: response.lines,
      trustBefore,
      trustAfter: this.trust.getCatTrust(catName),
      chapter: this.chapters.chapter,
    });
  }

  // ──────────── Snatchers (Task 4) ────────────

  private checkSnatcherSpawn(): void {
    if (this.dayNight.currentPhase !== "night") {
      this.snatcherSpawnChecked = false;
      this.despawnSnatchers();
      return;
    }
    if (this.snatcherSpawnChecked) return;
    this.snatcherSpawnChecked = true;

    // 40% chance per night
    if (Math.random() > 0.4) return;

    const snatcherCount = 1 + (Math.random() > 0.5 ? 1 : 0);
    for (let i = 0; i < snatcherCount; i++) {
      this.spawnSnatcher(i);
    }
  }

  private spawnSnatcher(index: number): void {
    // Snatchers patrol garden paths
    const patrolPaths = [
      [
        { x: 600, y: 1100 },
        { x: 1200, y: 800 },
        { x: 1800, y: 600 },
        { x: 2200, y: 700 },
        { x: 1600, y: 1200 },
      ],
      [
        { x: 2400, y: 1000 },
        { x: 1900, y: 1000 },
        { x: 1400, y: 1100 },
        { x: 900, y: 1000 },
        { x: 1200, y: 700 },
      ],
    ];
    const path = patrolPaths[index % patrolPaths.length]!;

    // Snatcher patrol speed must be slow and stealthy
    const config: HumanConfig = {
      type: "jogger",
      speed: 20,
      activePhases: ["night"],
      path,
    };
    const snatcher = new HumanNPC(this, config);
    snatcher.setTint(0x111111);
    if (this.groundLayer) this.physics.add.collider(snatcher, this.groundLayer);
    if (this.objectsLayer) this.physics.add.collider(snatcher, this.objectsLayer);
    this.snatchers.push(snatcher);
    this.humans.push(snatcher);

    // Screen-edge darkening warning
    const hud = this.scene.get("HUDScene") as HUDScene | undefined;
    hud?.showNarration("Something moves in the dark...");
  }

  private despawnSnatchers(): void {
    for (const snatcher of this.snatchers) {
      const idx = this.humans.indexOf(snatcher);
      if (idx !== -1) this.humans.splice(idx, 1);
      snatcher.destroy();
    }
    this.snatchers = [];
  }

  /**
   * Check if a snatcher has detected and caught Mamma Cat.
   * Called from updateHumans during night phase.
   */
  private checkSnatcherDetection(): void {
    if (this.snatchers.length === 0) return;

    for (const snatcher of this.snatchers) {
      if (!snatcher.visible) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, snatcher.x, snatcher.y);

      // Detection radius: 128px normal, 32px if crouching near cover
      let detectionRadius = 128;
      if (this.player.isCrouching && this.isUnderCanopy(this.player.x, this.player.y)) {
        detectionRadius = 32;
      } else if (this.player.isCrouching) {
        detectionRadius = 64;
      } else if (this.player.isRunning) {
        detectionRadius = 192;
      }

      // Safe sleeping spots are invisible to snatchers
      if (this.player.isResting && this.isNearShelter(this.player.x, this.player.y)) {
        continue;
      }

      if (dist < detectionRadius) {
        // Snatcher detected the player — move toward them
        const angle = Phaser.Math.Angle.Between(snatcher.x, snatcher.y, this.player.x, this.player.y);
        const chaseSpeed = 35;
        snatcher.setVelocity(Math.cos(angle) * chaseSpeed, Math.sin(angle) * chaseSpeed);

        if (dist < 16) {
          this.handleSnatcherCapture();
          return;
        }
      }
    }
  }

  private handleSnatcherCapture(): void {
    this.cameras.main.fade(100, 0, 0, 0, false, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress >= 1) {
        this.dialogue.show(["Hands. Darkness. You can't move. You can't breathe.", "..."], () => {
          const hasSave = SaveSystem.load() !== null;
          if (hasSave) {
            this.cameras.main.resetFX();
            this.scene.restart({ loadSave: true, snatcherCapture: true });
          } else {
            this.cameras.main.resetFX();
          }
        });
      }
    });
  }

  // ──────────── Colony Dynamics (Task 5) ────────────

  /**
   * Check for colony population changes and dumping events.
   * Colony count fluctuates to make the world feel alive.
   */
  private checkColonyDynamics(): void {
    const dumpingSeen = (this.registry.get("DUMPING_EVENTS_SEEN") as number) ?? 0;
    const chapter = this.chapters.chapter;

    // Dumping Event 1: during Chapter 2-3
    if (dumpingSeen === 0 && chapter >= 2 && chapter <= 3 && this.dayNight.currentPhase === "night") {
      if (Math.random() < 0.1) {
        this.triggerDumpingEvent(1);
      }
    }
    // Dumping Event 2: during Chapter 3-4
    else if (dumpingSeen === 1 && chapter >= 3 && chapter <= 4 && this.dayNight.currentPhase === "evening") {
      if (Math.random() < 0.08) {
        this.triggerDumpingEvent(2);
      }
    }
    // Dumping Event 3: during Chapter 4-5
    else if (dumpingSeen === 2 && chapter >= 4 && chapter <= 5 && this.dayNight.currentPhase === "dawn") {
      if (Math.random() < 0.08) {
        this.triggerDumpingEvent(3);
      }
    }
  }

  private triggerDumpingEvent(eventNum: number): void {
    this.registry.set("DUMPING_EVENTS_SEEN", eventNum);
    const hud = this.scene.get("HUDScene") as HUDScene | undefined;

    switch (eventNum) {
      case 1:
        this.dialogue.show(["A car. A door. A cat.", "You remember."], () => {
          this.colonyCount++;
          this.registry.set("COLONY_COUNT", this.colonyCount);
          hud?.showNarration("A new cat has appeared in the gardens.");
          this.addBackgroundCat();
        });
        break;

      case 2:
        this.dialogue.show(
          [
            "This one wasn't thrown away. This one was... left.",
            "With love, and grief, and no choice.",
            "You sit beside her. You don't speak. There's nothing to say.",
          ],
          () => {
            this.colonyCount++;
            this.registry.set("COLONY_COUNT", this.colonyCount);
            this.addBackgroundCat();
          },
        );
        break;

      case 3:
        this.dialogue.show(["Another one. How many of us started this way?"], () => {
          this.colonyCount++;
          this.registry.set("COLONY_COUNT", this.colonyCount);
          this.addBackgroundCat();
        });
        break;
    }
  }

  /**
   * Spawn an additional background colony cat after a dumping event.
   */
  private addBackgroundCat(): void {
    const sprites = ["mammacat", "blacky", "tiger", "jayco", "fluffy"];
    const sprite = sprites[Math.floor(Math.random() * sprites.length)]!;
    const x = 600 + Math.random() * 200;
    const y = 1100 + Math.random() * 200;

    const cat = new NPCCat(this, {
      name: `Colony Cat ${this.npcs.length + 1}`,
      spriteKey: sprite,
      x,
      y,
      homeZone: { cx: x, cy: y, radius: 100 },
      disposition: "wary",
    });
    if (this.groundLayer) this.physics.add.collider(cat, this.groundLayer);
    if (this.objectsLayer) this.physics.add.collider(cat, this.objectsLayer);
    const indicator = new ThreatIndicator(this, cat, "???", "wary", false);
    this.npcs.push({ cat, indicator });
  }

  // ──────────── Territory Benefits ────────────

  /**
   * When in claimed territory, apply benefits:
   * faster energy restore and food proximity indicator.
   */
  private checkTerritoryBenefits(): void {
    if (!this.territory.isClaimed) return;
    if (!this.isInTerritory(this.player.x, this.player.y)) return;

    // Territory provides a subtle comfort indicator
    if (this.player.isResting) {
      // Bonus energy restore is handled through shelter detection (poi_pyramid_steps)
      // which is already in the shelter list. No additional logic needed.
    }
  }
}
