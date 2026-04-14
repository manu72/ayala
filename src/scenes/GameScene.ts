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
import { EmoteSystem } from "../systems/EmoteSystem";
import { ChapterSystem } from "../systems/ChapterSystem";
import type { HUDScene } from "./HUDScene";
import { REST_HOLD_MS } from "../config/constants";

const INTERACTION_DISTANCE = 50;
const LEARN_NAME_DISTANCE = 100;
const TILE_SIZE = 32;
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

  /** Dialogue lives in HUDScene (1x zoom) so it's always visible. */
  private get dialogue(): { isActive: boolean; show: (lines: string[], onComplete?: () => void) => void } {
    const hud = this.scene.get("HUDScene") as HUDScene | undefined;
    if (hud?.dialogue) return hud.dialogue;
    return { isActive: false, show: () => {} };
  }

  constructor() {
    super({ key: "GameScene" });
  }

  create(data?: { loadSave?: boolean }): void {
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

    // Clear story state from any prior session before restoring
    for (const key of [
      "MET_BLACKY", "TIGER_TALKS", "JAYCO_TALKS", "KNOWN_CATS",
      "CHAPTER", "CH1_RESTED", "FLUFFY_TALKS", "PEDIGREE_TALKS",
      "MET_GINGER_A", "MET_GINGER_B", "JAYCO_JR_TALKS", "JOURNAL_MET_DAYS",
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
        for (const [key, val] of Object.entries(save.variables)) {
          this.registry.set(key, val);
        }
        const savedChapter = save.variables.CHAPTER;
        if (typeof savedChapter === "number") {
          this.chapters.restore(savedChapter);
        }
      }
    }

    this.player = new MammaCat(this, spawnX, spawnY);

    if (this.objectsLayer) {
      this.physics.add.collider(this.player, this.objectsLayer);
    }

    const savedKnown = this.registry.get("KNOWN_CATS") as string[] | undefined;
    this.knownCats = new Set(savedKnown ?? []);

    const blacky = this.spawnNPC("Blacky", "blacky", "spawn_blacky", "neutral", 150, 1024, 544);
    blacky.setTint(0x333333);
    this.spawnNPC("Tiger", "tiger", "spawn_tiger", "territorial", 200, 1600, 1152);
    this.spawnNPC("Jayco", "jayco", "spawn_jayco", "friendly", 150, 2560, 512);

    // Phase 3 named cats
    this.spawnNPC("Jayco Jr", "jayco", "spawn_jayco_jr", "friendly", 100, 2580, 530, {
      scale: 0.7,
      walkSpeed: 40,
      hyperactive: true,
    });
    this.spawnNPC("Fluffy", "fluffy", "spawn_fluffy", "neutral", 180, 1500, 1000);
    this.spawnNPC("Pedigree", "fluffy", "spawn_pedigree", "neutral", 150, 800, 1400);
    this.spawnGingerTwins();
    this.spawnColonyCats();

    this.restoreDispositions();

    const guardPoint = this.map.findObject("spawns", (o) => o.name === "spawn_guard");
    this.guard = new GuardNPC(this, guardPoint?.x ?? 2336, guardPoint?.y ?? 1728);
    this.guard.setTarget(this.player);
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

    if (!this.scene.isActive("HUDScene")) {
      this.scene.launch("HUDScene");
    }

    // Chapter 1 intro narration for new games
    if (!data?.loadSave) {
      this.time.delayedCall(500, () => {
        const hud = this.scene.get("HUDScene") as HUDScene | undefined;
        const intro = this.chapters.getIntroNarration();
        if (hud && intro.length > 0) {
          this.dialogue.show(intro);
        }
      });
    }
  }

  update(time: number, delta: number): void {
    // Escape must be checked before the pause gate so it can unpause
    if (this.escapeKey && Phaser.Input.Keyboard.JustDown(this.escapeKey)) {
      this.togglePause();
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
      } else if (!this.isPaused) {
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

    // ──── Tab peek ────
    if (this.tabKey?.isDown) {
      this.player.setVelocity(0);
      if (!this.isPeeking) {
        this.isPeeking = true;
        this.cameras.main.zoomTo(PEEK_ZOOM, ZOOM_DURATION);
      }
      this.updateNPCs(delta);
      this.updateHumans(delta);
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
    this.updateHumans(delta);

    // Check chapter progression every 5 seconds
    this.chapterCheckTimer += delta;
    if (this.chapterCheckTimer >= 5_000) {
      this.chapterCheckTimer = 0;
      this.checkChapterProgression();
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

    const namedKnown = new Set(
      [...this.knownCats].filter((name) => !name.startsWith("Colony Cat")),
    );
    const triggered = this.chapters.check({
      trust: this.trust,
      dayNight: this.dayNight,
      knownCats: namedKnown,
      registry: this.registry,
    });
    if (triggered) {
      const narration = this.chapters.consumeNarration();
      if (narration && narration.length > 0) {
        this.dialogue.show(narration, () => {
          this.autoSave();
        });
      }
    }
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

    // Trust-based disposition upgrades for all named cats
    for (const { cat, indicator } of this.npcs) {
      const catTrust = this.trust.getCatTrust(cat.npcName);
      if (catTrust >= 50 && cat.disposition !== "friendly") {
        cat.disposition = "friendly";
        indicator.setDisposition("friendly");
      } else if (catTrust >= 15 && cat.disposition === "territorial") {
        cat.disposition = "neutral";
        indicator.setDisposition("neutral");
      }
    }
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

  private showBodyLanguage(
    cat: NPCCat,
    _dist: number,
    hud: HUDScene | undefined,
  ): void {
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

  private getNarrationForCat(
    cat: NPCCat,
    effectiveDisposition: string,
  ): string | null {
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
    opts?: { scale?: number; walkSpeed?: number; hyperactive?: boolean; animPrefix?: string; offsetX?: number; offsetY?: number },
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
    if (this.objectsLayer) {
      this.physics.add.collider(cat, this.objectsLayer);
    }
    const known = this.knownCats.has(name);
    const indicator = new ThreatIndicator(this, cat, name, disposition, known);
    this.npcs.push({ cat, indicator });
    return cat;
  }

  private spawnGingerTwins(): void {
    const ginger = this.spawnNPC("Ginger", "fluffy", "spawn_ginger", "wary", 200, 1900, 700);
    ginger.setTint(0xffaa44);
    const gingerB = this.spawnNPC("Ginger B", "fluffy", "spawn_ginger", "wary", 200, 1900, 700, {
      offsetX: 60,
    });
    gingerB.setTint(0xffaa44);
  }

  private spawnColonyCats(): void {
    const sprites = ["mammacat", "blacky", "tiger", "jayco", "fluffy"];
    const dispositions: Array<"neutral" | "wary" | "friendly" | "territorial"> = [
      "neutral", "neutral", "neutral", "neutral",
      "wary", "wary", "wary",
      "friendly", "friendly",
      "territorial",
    ];

    // Scatter across zones 2-4 (approximate world positions)
    const zones = [
      { cx: 800, cy: 1300, radius: 250 },
      { cx: 1600, cy: 1100, radius: 300 },
      { cx: 1900, cy: 800, radius: 250 },
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
      // Jogger 1: runs a loop through the main paths
      {
        type: "jogger",
        speed: 100,
        activePhases: ["dawn", "evening"],
        path: [
          { x: 400, y: 600 },
          { x: 1200, y: 600 },
          { x: 2000, y: 800 },
          { x: 2400, y: 1200 },
          { x: 1600, y: 1400 },
          { x: 800, y: 1200 },
        ],
      },
      // Jogger 2: shorter path near the gardens
      {
        type: "jogger",
        speed: 90,
        activePhases: ["dawn", "evening"],
        path: [
          { x: 1200, y: 1000 },
          { x: 1800, y: 1000 },
          { x: 1800, y: 1400 },
          { x: 1200, y: 1400 },
        ],
      },
      // Feeder 1: visits feeding station 1 at dawn/evening
      {
        type: "feeder",
        speed: 40,
        activePhases: ["dawn", "evening"],
        lingerSec: 45,
        lingerWaypointIndex: 1,
        path: [
          { x: 300, y: 800 },
          { x: 600, y: 700 },
          { x: 300, y: 800 },
        ],
      },
      // Feeder 2: visits feeding station 2
      {
        type: "feeder",
        speed: 40,
        activePhases: ["dawn", "evening"],
        lingerSec: 40,
        lingerWaypointIndex: 1,
        path: [
          { x: 2200, y: 500 },
          { x: 2000, y: 600 },
          { x: 2200, y: 500 },
        ],
      },
      // Dog walker 1
      {
        type: "dogwalker",
        speed: 60,
        activePhases: ["dawn", "evening", "day"],
        path: [
          { x: 500, y: 1100 },
          { x: 1000, y: 1100 },
          { x: 1400, y: 1300 },
          { x: 1000, y: 1500 },
          { x: 500, y: 1300 },
        ],
      },
      // Dog walker 2
      {
        type: "dogwalker",
        speed: 55,
        activePhases: ["dawn", "evening"],
        path: [
          { x: 1800, y: 600 },
          { x: 2200, y: 800 },
          { x: 2400, y: 1100 },
          { x: 2000, y: 1300 },
          { x: 1800, y: 900 },
        ],
      },
    ];

    const walkerDogKeys = Phaser.Utils.Array.Shuffle(["SmallDog", "BrownDog"]);
    let walkerDogIdx = 0;

    for (const config of configs) {
      const human = new HumanNPC(this, config);
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
  }

  // ──────────── Food Sources ────────────

  private placeFoodSources(): void {
    const poi = (name: string) => this.map.findObject("spawns", (o) => o.name === name);
    const sources: Array<[string, SourceType]> = [
      ["poi_feeding_station_1", "feeding_station"],
      ["poi_feeding_station_2", "feeding_station"],
      ["poi_fountain", "fountain"],
      ["poi_water_bowl_1", "water_bowl"],
      ["poi_water_bowl_2", "water_bowl"],
      ["poi_restaurant_scraps", "restaurant_scraps"],
    ];
    for (const [poiName, type] of sources) {
      const obj = poi(poiName);
      if (obj) this.foodSources.addSource(type, obj.x ?? 0, obj.y ?? 0);
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
    return this.shelterPoints.some((s) => Phaser.Math.Distance.Between(worldX, worldY, s.x, s.y) < 80);
  }

  private cacheShelterPoints(): void {
    const shelterNames = ["poi_pyramid_steps", "poi_starbucks", "poi_safe_sleep"];
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
      this.showColonyDialogue();
      return;
    }
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
              this.addKnownCat("Blacky");
              this.npcs.find((e) => e.cat === cat)?.indicator.reveal();
              this.trust.firstConversation("Blacky");
              this.autoSave();
            },
          );
        } else {
          this.dialogue.show(["Still here? Good. You're tougher than you look."], () => {
            this.trust.returnConversation("Blacky");
          });
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
              this.addKnownCat("Tiger");
              this.npcs.find((e) => e.cat === cat)?.indicator.reveal();
              this.trust.firstConversation("Tiger");
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
              this.trust.returnConversation("Tiger");
              this.autoSave();
            },
          );
        } else {
          this.dialogue.show(['"Mrrp. You can rest here. Under this tree. I\'ll keep watch."'], () => {
            this.trust.returnConversation("Tiger");
          });
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
              '"The humans below, the coffee place, they leave good scraps. But watch for the guard."',
            ],
            () => {
              this.registry.set("JAYCO_TALKS", 1);
              this.addKnownCat("Jayco");
              const entry = this.npcs.find((e) => e.cat === cat);
              entry?.indicator.reveal();
              entry?.indicator.setDisposition("friendly");
              cat.disposition = "friendly";
              this.trust.firstConversation("Jayco");
              this.autoSave();
            },
          );
        } else {
          this.dialogue.show(['"The ginger ones fight over the bench near the fountain. Stay clear at dusk."'], () => {
            this.trust.returnConversation("Jayco");
          });
        }
        break;
      }
      case "Jayco Jr": {
        const talks = (this.registry.get("JAYCO_JR_TALKS") as number) ?? 0;
        if (talks === 0) {
          this.dialogue.show(
            [
              "*A tiny cat bounces toward you, tail straight up.*",
              "\"Mrrp! Mrrp! You're new! Dad says I shouldn't talk to strangers but you smell okay!\"",
            ],
            () => {
              this.registry.set("JAYCO_JR_TALKS", 1);
              this.addKnownCat("Jayco Jr");
              this.npcs.find((e) => e.cat === cat)?.indicator.reveal();
              this.trust.firstConversation("Jayco Jr");
              this.autoSave();
            },
          );
        } else {
          this.dialogue.show(
            ["\"Did you find the water bowls? They're near the big trees! I can show you!\""],
            () => { this.trust.returnConversation("Jayco Jr"); },
          );
        }
        break;
      }
      case "Fluffy": {
        const talks = (this.registry.get("FLUFFY_TALKS") as number) ?? 0;
        const catTrust = this.trust.getCatTrust("Fluffy");
        if (talks === 0) {
          this.dialogue.show(
            [
              "*This cat regards you with half-closed eyes. Its long fur is immaculate.*",
              "\"...\"",
              "*It returns to grooming. You've been dismissed.*",
            ],
            () => {
              this.registry.set("FLUFFY_TALKS", 1);
              this.addKnownCat("Fluffy");
              this.npcs.find((e) => e.cat === cat)?.indicator.reveal();
              this.trust.firstConversation("Fluffy");
              this.autoSave();
            },
          );
        } else if (catTrust >= 20) {
          this.dialogue.show(
            [
              "\"You're still alive. That's something, I suppose.\"",
              "\"The humans with the bags come at dawn and dusk. Follow the sound of rustling.\"",
            ],
            () => { this.trust.returnConversation("Fluffy"); },
          );
        } else {
          this.dialogue.show(["*The cat flicks an ear in your direction but doesn't look up.*"], () => {
            this.trust.returnConversation("Fluffy");
          });
        }
        break;
      }
      case "Pedigree": {
        const talks = (this.registry.get("PEDIGREE_TALKS") as number) ?? 0;
        if (talks === 0) {
          this.dialogue.show(
            [
              "*This cat has a look you recognise. Well-groomed but confused. A former pet, like you.*",
              "\"I had a home once. A bed. A name they called me.\"",
              "\"They moved away. I didn't.\"",
            ],
            () => {
              this.registry.set("PEDIGREE_TALKS", 1);
              this.addKnownCat("Pedigree");
              this.npcs.find((e) => e.cat === cat)?.indicator.reveal();
              this.trust.firstConversation("Pedigree");
              this.autoSave();
            },
          );
        } else {
          this.dialogue.show(
            ["\"The ones in dark clothes at night... they took my friend. Stay hidden after dark.\""],
            () => { this.trust.returnConversation("Pedigree"); },
          );
        }
        break;
      }
      case "Ginger": {
        const met = this.registry.get("MET_GINGER_A") as boolean | undefined;
        const catTrust = this.trust.getCatTrust("Ginger");
        if (!met) {
          this.dialogue.show(
            [
              "*Two orange cats glare at you from beside the fountain. One hisses.*",
              "\"SSSS! This water is OURS.\"",
            ],
            () => {
              this.registry.set("MET_GINGER_A", true);
              this.addKnownCat("Ginger");
              this.npcs.find((e) => e.cat === cat)?.indicator.reveal();
              this.trust.firstConversation("Ginger");
              this.autoSave();
            },
          );
        } else if (catTrust >= 30) {
          this.dialogue.show(
            [
              "*The ginger cat flicks an ear at you.*",
              "\"...Fine. Drink. But don't bring anyone else.\"",
            ],
            () => { this.trust.returnConversation("Ginger"); },
          );
        } else {
          this.dialogue.show(["*The ginger cat hisses softly.*"], () => {
            this.trust.returnConversation("Ginger");
          });
        }
        break;
      }
      case "Ginger B": {
        const met = this.registry.get("MET_GINGER_B") as boolean | undefined;
        if (!met) {
          this.dialogue.show(
            ["*This one just watches. It doesn't speak. Its twin does the talking.*"],
            () => {
              this.registry.set("MET_GINGER_B", true);
              this.addKnownCat("Ginger B");
              this.npcs.find((e) => e.cat === cat)?.indicator.reveal();
              this.trust.firstConversation("Ginger B");
              this.autoSave();
            },
          );
        } else {
          this.dialogue.show(["*The cat stares at you, unblinking.*"], () => {
            this.trust.returnConversation("Ginger B");
          });
        }
        break;
      }
      default:
        this.dialogue.show(["*The cat regards you warily.*"]);
    }
  }

  private showColonyDialogue(): void {
    const lines = [
      "*This cat ignores you.*",
      "*This cat hisses softly and turns away.*",
      "*This cat sniffs in your direction, then goes back to sleep.*",
      "*This cat watches you for a moment, then loses interest.*",
      "*This cat's ear twitches, but it doesn't move.*",
    ];
    this.dialogue.show([lines[Math.floor(Math.random() * lines.length)]!]);
  }
}
