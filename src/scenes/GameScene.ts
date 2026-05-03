import Phaser from "phaser";
import { MammaCat } from "../sprites/MammaCat";
import { NPCCat } from "../sprites/NPCCat";
import { GuardNPC } from "../sprites/GuardNPC";
import type { HumanConfig } from "../sprites/HumanNPC";
import { DogNPC } from "../sprites/DogNPC";
import { DayNightCycle } from "../systems/DayNightCycle";
import { StatsSystem } from "../systems/StatsSystem";
import { FoodSourceManager } from "../systems/FoodSource";
import type { SourceType } from "../systems/FoodSource";
import { ThreatIndicator } from "../systems/ThreatIndicator";
import { SaveSystem } from "../systems/SaveSystem";
import { TrustSystem } from "../systems/TrustSystem";
import { ScoringSystem, type ScoreBreakdown } from "../systems/ScoringSystem";
import { EmoteSystem } from "../systems/EmoteSystem";
import { ChapterSystem } from "../systems/ChapterSystem";
import { TerritorySystem } from "../systems/TerritorySystem";
import { ColonyDynamicsSystem } from "../systems/ColonyDynamicsSystem";
import { SnatcherSystem } from "../systems/SnatcherSystem";
import { HumanPresenceSystem } from "../systems/HumanPresenceSystem";
import { CollapseSystem } from "../systems/CollapseSystem";
import { CatDialogueController } from "../systems/CatDialogueController";
import type { HUDScene } from "./HUDScene";
import {
  GP,
  REST_HOLD_MS,
} from "../config/gameplayConstants";
import { StoryKeys, migrateLegacyIntroFlag } from "../registry/storyKeys";
import {
  ScriptedDialogueService,
  type DialogueService,
} from "../services/DialogueService";
import { AIDialogueService } from "../services/AIDialogueService";
import { FallbackDialogueService } from "../services/FallbackDialogueService";
import type { DialogueHooks } from "../systems/DialogueSystem";
import { AI_PERSONAS } from "../ai/personas";
import { NPC_DIALOGUE_SCRIPTS } from "../data/npc-dialogue";
import { AudioSystem } from "../systems/AudioSystem";
import { CamilleEncounterSystem } from "../systems/CamilleEncounterSystem";
import { hasLineOfSightTiles } from "../utils/lineOfSight";
import { createNavigationGrid, routeHumanPath, type NavigationGrid } from "../utils/humanRoutePath";
import { applyLifeLoss, MAX_LIVES } from "../utils/lifeFlow";
import { markGameOver } from "../utils/gameOverState";
import { consumeSnatchedThisNight, restoreSnatchedThisNight } from "../utils/snatcherNightState";
import { EMPTY_MOVEMENT_INTENT, type MovementIntent } from "../input/playerIntent";

const INTERACTION_DISTANCE = GP.INTERACTION_DIST;
const LEARN_NAME_DISTANCE = GP.LEARN_NAME_DIST;
const TILE_SIZE = GP.TILE_SIZE;

// Cat-dialogue emote tables, `CatDialoguePersistenceSnapshot`, and the
// named-cat "first meeting" registry mapping all live in
// `CatDialogueController` now (Commit D).

const DEFAULT_ZOOM = 2.5;
const PEEK_ZOOM = 0.8;
const ZOOM_DURATION = 500;
const DROPOFF_SUV_TEXTURE = "suv_small";
const DROPOFF_COROLLA_TEXTURE = "corolla_small";
const DROPOFF_SUV_DISPLAY_WIDTH = 72;
const DROPOFF_SUV_DISPLAY_HEIGHT = 28;
const DROPOFF_COROLLA_DISPLAY_WIDTH = 68;
const DROPOFF_COROLLA_DISPLAY_HEIGHT = 28;
const DROPOFF_SUV_TINT_CYCLE: ReadonlyArray<number | null> = [
  0x111111,
  0xffd43b,
  0x2f9e44,
  0xd9480f,
  0x1c7ed6,
  null,
];

export interface DropoffVehicleOptions {
  texture?: string;
  displayWidth?: number;
  displayHeight?: number;
  tint?: number | null;
}

export interface NPCEntry {
  cat: NPCCat;
  indicator: ThreatIndicator;
}

export class GameScene extends Phaser.Scene {
  player!: MammaCat;
  dayNight!: DayNightCycle;
  stats!: StatsSystem;
  trust!: TrustSystem;
  scoring!: ScoringSystem;
  lives = MAX_LIVES;

  /** Expose for HUDScene to read rest progress. */
  restHoldTimer = 0;
  restHoldActive = false;
  isPeeking = false;
  isPaused = false;
  cinematicActive = false;

  /** Pending intro cinematic timers/tweens — cleared on scene shutdown to avoid callbacks after destroy. */
  private introTimerEvents: Phaser.Time.TimerEvent[] = [];
  private introCinematicTweens: Phaser.Tweens.Tween[] = [];

  /** NPC cat roster, shared with {@link ColonyDynamicsSystem} + {@link SnatcherSystem}. */
  npcs: NPCEntry[] = [];
  private guard!: GuardNPC;
  private guardIndicator!: ThreatIndicator;
  private foodSources!: FoodSourceManager;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private restKey!: Phaser.Input.Keyboard.Key;
  private tabKey!: Phaser.Input.Keyboard.Key;
  private escapeKey!: Phaser.Input.Keyboard.Key;
  private journalKey!: Phaser.Input.Keyboard.Key;
  private touchMovementIntent: MovementIntent = { ...EMPTY_MOVEMENT_INTENT };
  private touchInteractQueued = false;
  private touchRestDown = false;
  private touchRestPressedQueued = false;
  private touchRestReleased = false;
  private touchPeekQueued = false;
  private touchJournalQueued = false;
  private touchPauseQueued = false;
  private journalToggleLocked = false;
  journalOpenedFromPause = false;
  /** Ground collision layer, shared with {@link ColonyDynamicsSystem} + {@link SnatcherSystem}. */
  groundLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  /** Objects collision layer, shared with {@link ColonyDynamicsSystem} + {@link SnatcherSystem}. */
  objectsLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private overheadLayer!: Phaser.Tilemaps.TilemapLayer | null;
  /** Shared with {@link CamilleEncounterSystem} for spawn-point lookup. */
  map!: Phaser.Tilemaps.Tilemap;
  /** Shared with {@link CamilleEncounterSystem} for AI dialogue context. */
  knownCats: Set<string> = new Set();
  private shelterPoints: Array<{ x: number; y: number }> = [];
  /**
   * Owns the collapse → recovery → witness-narration state machine.
   * Scene polls {@link CollapseSystem.tick} each frame; see the system
   * for the detailed invariants (pre-teleport witness snapshot, etc.).
   */
  collapse!: CollapseSystem;
  /** Shared with {@link SnatcherSystem} for scripted-sighting flee emotes. */
  emotes!: EmoteSystem;
  chapters!: ChapterSystem;
  private chapterCheckTimer = 0;
  /**
   * Owns the park's human NPC roster: ambient spawns (joggers, feeders,
   * dog walkers), AI bubble throttle, stationary-greet cap, and the
   * `register` / `unregister` API used by {@link SnatcherSystem} and
   * {@link CamilleEncounterSystem} for their own spawned humans. After
   * Commit C, no other code touches a raw `humans[]` array.
   */
  humans!: HumanPresenceSystem;
  /** Dog NPCs tethered to dog-walker humans; pushed to by {@link HumanPresenceSystem.spawnAmbientHumans}. */
  dogs: DogNPC[] = [];
  /** Tracks which cats have already shown narration this approach, to avoid repeating. */
  private narrationShown = new Set<string>();
  /** Shared with {@link CamilleEncounterSystem} for Camille beat LLM calls. */
  dialogueService!: DialogueService;
  territory!: TerritorySystem;
  /** Owns dumping events + dynamic colony population (mirrors `StoryKeys.COLONY_COUNT`). */
  colony!: ColonyDynamicsSystem;
  /** Owns nightly snatcher spawn/detect/capture + colony-cat grab sweep. */
  snatcher!: SnatcherSystem;
  /**
   * Owns the looping background music (ambient ↔ danger crossfade) and
   * one-shot SFX. Public so HUDScene can hook the mute toggle.
   */
  audio!: AudioSystem;

  /**
   * Owns the Camille Beat 1–5 narrative arc: ambient care-route spawns
   * during the Camille era, the scripted 4-day encounter schedule, the
   * Beat 5 consent window, pickup tween, and Kish "slow down" aside. See
   * {@link CamilleEncounterSystem}.
   */
  camille!: CamilleEncounterSystem;

  /**
   * Owns the entire cat-dialogue lifecycle: engagement gating, the async
   * AI request, response rendering, and the post-close side effects
   * (trust awards, registry flags, persistence, autosave). The scene
   * keeps {@link tryInteract} as the entry point and calls into this
   * controller for the dialogue path. See {@link CatDialogueController}.
   */
  catDialogue!: CatDialogueController;

  // Snatcher + colony dynamics state now live on `this.snatcher` and
  // `this.colony` respectively. Camille beat state lives on `this.camille`.

  /**
   * Freeze flag for player input during the beat-5 pickup sequence. Set by
   * {@link CamilleEncounterSystem.runBeat5Pickup} just before the tween
   * starts and cleared on accept completion / scene shutdown. While true,
   * movement, interact, and rest inputs are all ignored so the pickup
   * cinematic cannot be short-circuited. Public because the Camille system
   * mutates it; scene update reads it to short-circuit movement.
   */
  playerInputFrozen = false;
  // Human stationary-greet anchor moved to HumanPresenceSystem.
  private previousPlayerX = 0;
  private previousPlayerY = 0;
  // Flood-filled reachable-cell set moved to `this.territory.reachableCells`
  // (Commit D). Use `this.territory.initialiseExploration(...)` and
  // `this.territory.visitCell(...)` instead.
  private trustEventUnsubscribe: (() => void) | null = null;
  pendingGameOverReason: "collapse" | "snatched" | null = null;
  private gameOverTriggered = false;

  // Kish "slow down" flag + Camille personal lines moved into
  // `CamilleEncounterSystem`. Use `this.camille.getPersonalLineForNamedCat(name)`
  // when Camille recognises a named colony cat in `pickScriptedGreeting`.

  /** Dialogue lives in HUDScene (1x zoom) so it's always visible. */
  get dialogue(): {
    isActive: boolean;
    show: (lines: string[], onComplete?: () => void, hooks?: DialogueHooks) => void;
    advance: () => void;
    dismiss: () => void;
  } {
    const hud = this.scene.get("HUDScene") as HUDScene | undefined;
    if (hud?.dialogue) return hud.dialogue;
    return { isActive: false, show: () => {}, advance: () => {}, dismiss: () => {} };
  }

  constructor() {
    super({ key: "GameScene" });
  }

  shutdown(): void {
    this.trustEventUnsubscribe?.();
    this.trustEventUnsubscribe = null;
    this.clearTouchInputState(true);
    this.clearIntroCinematicResources();
    if (this.cinematicActive) {
      this.cinematicActive = false;
      const body = this.player?.body as Phaser.Physics.Arcade.Body | undefined;
      body?.setEnable(true);
      this.player?.setVisible(true);
    }
    this.player?.stopGreeting();
    this.pendingGameOverReason = null;
    this.gameOverTriggered = false;
    this.dialogue.dismiss();

    // Ambient human-bubble abort + roster reset delegated to
    // {@link HumanPresenceSystem.shutdown} (see its docstring for why the
    // abort is load-bearing across scene restarts).

    // Beat-5 cleanup. A scene shutdown mid-pickup could strand the player
    // invisible with a disabled body and an active input freeze, which
    // would make the next scene start unplayable. Delegated to the Camille
    // system, which owns the decision timer, Beat-5 flags, paused-human
    // roster, and scripted-slow-down flag. We still defensively restore
    // player body/alpha here because `playerInputFrozen` is a scene-level
    // flag read by scene `update()`.
    this.playerInputFrozen = false;
    if (this.player) {
      const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
      body?.setEnable(true);
      this.player.setAlpha(1);
      this.player.setVisible(true);
    }

    // Stop music + release sound instances so a scene restart (e.g. after a
    // snatcher capture at GameScene.ts:3750) doesn't stack overlapping loops.
    this.audio?.stop();

    // Tear down extracted systems. Phaser does not auto-invoke `shutdown()`
    // on our subsystems; it only fires the scene-level SHUTDOWN event, which
    // we chain into these (WORKING_MEMORY "Scene Lifecycle — shutdown is
    // NOT auto-wired").
    this.snatcher?.shutdown();
    this.colony?.shutdown();
    this.camille?.shutdown();
    this.humans?.shutdown();
    this.collapse?.shutdown();
    this.catDialogue?.shutdown();
  }

  /** Remove pending intro delayed calls and tweens (idempotent). */
  private clearIntroCinematicResources(): void {
    for (const ev of this.introTimerEvents) {
      ev.remove(false);
    }
    this.introTimerEvents = [];
    for (const tw of this.introCinematicTweens) {
      tw.remove();
    }
    this.introCinematicTweens = [];
  }

  /**
   * Queue a delayed call for the intro cinematic; tracked so `shutdown` can cancel it.
   */
  private queueIntroDelayed(delayMs: number, callback: () => void): Phaser.Time.TimerEvent {
    const ev = this.time.delayedCall(delayMs, callback);
    this.introTimerEvents.push(ev);
    return ev;
  }

  /**
   * Add a tween for the intro cinematic; tracked so `shutdown` can cancel it.
   */
  private queueIntroTween(config: Phaser.Types.Tweens.TweenBuilderConfig): Phaser.Tweens.Tween {
    const tw = this.tweens.add(config);
    this.introCinematicTweens.push(tw);
    return tw;
  }

  create(data?: { loadSave?: boolean; newGamePlus?: boolean; snatcherCapture?: boolean }): void {
    // Phaser 3 auto-calls init/preload/create/update but NOT shutdown; our
    // cleanup (intro timers/tweens, engaged NPC, dialogue) only runs if we
    // subscribe to the scene-lifecycle "shutdown" event explicitly. `once` is
    // correct here because a new create() will re-subscribe on scene restart.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.clearTouchInputState(true);

    this.npcs = [];
    this.dogs = [];
    this.shelterPoints = [];
    this.restHoldTimer = 0;
    this.restHoldActive = false;
    this.isPeeking = false;
    this.isPaused = false;
    this.collapse = new CollapseSystem(this);
    this.collapse.resetTransient();

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
    this.placePlaygroundCarabao();
    this.placeStarbucksLogo();
    this.cacheShelterPoints();

    const spawnPoint = this.map.findObject("spawns", (obj) => obj.name === "spawn_mammacat");
    let spawnX = spawnPoint?.x ?? this.map.widthInPixels / 2;
    let spawnY = spawnPoint?.y ?? this.map.heightInPixels / 2;

    this.stats = new StatsSystem();
    this.dayNight = new DayNightCycle(this);
    this.trust = new TrustSystem();
    this.scoring = new ScoringSystem();
    this.lives = MAX_LIVES;
    this.pendingGameOverReason = null;
    this.gameOverTriggered = false;
    this.emotes = new EmoteSystem();
    this.chapters = new ChapterSystem();
    this.audio = new AudioSystem();
    this.audio.start(this);
    this.colony = new ColonyDynamicsSystem(this);
    this.colony.resetTransient();
    this.snatcher = new SnatcherSystem(this);
    this.snatcher.snatchedThisNight = data?.snatcherCapture === true;
    this.camille = new CamilleEncounterSystem(this);
    this.camille.resetTransient();
    this.humans = new HumanPresenceSystem(this);
    // resetTransient() seeds the stationary anchor at the player's spawn
    // so an instant interaction on frame 0 doesn't fire the
    // "moved beyond threshold" reset that clears every greet counter.
    this.humans.resetTransient(spawnX, spawnY);
    this.catDialogue = new CatDialogueController(this);
    this.catDialogue.resetTransient();
    this.chapterCheckTimer = 0;
    this.narrationShown = new Set();
    const scripted = new ScriptedDialogueService(NPC_DIALOGUE_SCRIPTS);
    const proxyUrl = import.meta.env.VITE_AI_PROXY_URL;
    const primary = import.meta.env.VITE_AI_PRIMARY === "openai" ? ("openai" as const) : ("deepseek" as const);
    const fb = import.meta.env.VITE_AI_FALLBACK;
    const secondary: "deepseek" | "openai" =
      fb === "openai" || fb === "deepseek" ? fb : primary === "deepseek" ? "openai" : "deepseek";
    this.dialogueService =
      typeof proxyUrl === "string" && proxyUrl.length > 0
        ? new FallbackDialogueService(
            new AIDialogueService({
              proxyUrl,
              personas: AI_PERSONAS,
              primaryProvider: primary,
              secondaryProvider: secondary,
            }),
            scripted,
          )
        : scripted;
    this.territory = new TerritorySystem();

    // Clear story state from any prior session before restoring
    for (const key of [
      // Cat / chapter progression keys (not in StoryKeys — no registry typed module yet).
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
      // Story / endgame keys — always use StoryKeys so typos become compile errors.
      StoryKeys.CATS_SNATCHED,
      StoryKeys.PLAYER_SNATCHED_COUNT,
      StoryKeys.SNATCHED_THIS_NIGHT,
      StoryKeys.CAMILLE_ENCOUNTER,
      StoryKeys.CAMILLE_ENCOUNTER_DAY,
      StoryKeys.CAMILLE_AMBIENT_DAWN_DAY,
      StoryKeys.CAMILLE_AMBIENT_EVENING_DAY,
      StoryKeys.ENCOUNTER_5_COMPLETE,
      StoryKeys.DUMPING_EVENTS_SEEN,
      StoryKeys.GAME_COMPLETED,
      StoryKeys.GAME_OVER,
      StoryKeys.NEW_GAME_PLUS,
      StoryKeys.INTRO_SEEN,
      StoryKeys.FIRST_SNATCHER_SEEN,
      StoryKeys.COLLAPSE_COUNT,
      StoryKeys.COLONY_COUNT,
    ]) {
      this.registry.remove(key);
    }

    // Seed the colony total so a fresh game has a well-defined starting value
    // in the registry (not just the field). If a save is loaded below, the
    // `Object.entries(save.variables)` loop overwrites this with the persisted
    // value, then `colony.reconcileFromSave` clamps / defaults it. Keeping
    // field + registry in lockstep is the invariant used by the background
    // roster spawn, `JournalScene`, and the decrement/increment paths.
    this.colony.seedFreshGame();

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
        this.lives = save.lives;
        this.scoring.fromJSON(save.runScore);
        for (const [key, val] of Object.entries(save.variables)) {
          this.registry.set(key, val);
        }
        this.snatcher.snatchedThisNight = restoreSnatchedThisNight(this.registry, this.snatcher.snatchedThisNight);
        const savedChapter = save.variables.CHAPTER;
        if (typeof savedChapter === "number") {
          this.chapters.restore(savedChapter);
        }
        // Reconcile `COLONY_COUNT` defensively. The `for ([key, val])` loop
        // above restored `save.variables` blindly, so a corrupt save (e.g. a
        // string, null, NaN, Infinity) has already overwritten the seed in
        // the registry. Valid numeric saves are clamped to the named+Mamma
        // floor; invalid / missing saves fall back to the fresh-game seed
        // (not the floor, which would collapse the visible background
        // roster to zero on an otherwise-healthy save with one corrupt
        // field). See {@link ColonyDynamicsSystem.reconcileFromSave}.
        this.colony.reconcileFromSave(save.variables as Record<string, unknown>);
      }
    }

    this.player = new MammaCat(this, spawnX, spawnY);
    this.previousPlayerX = spawnX;
    this.previousPlayerY = spawnY;

    if (this.territory.isClaimed) {
      this.player.setHasTerritory(true);
    }

    if (this.groundLayer) {
      this.physics.add.collider(this.player, this.groundLayer);
    }
    if (this.objectsLayer) {
      this.physics.add.collider(this.player, this.objectsLayer);
    }
    this.initialiseTerritoryExploration(spawnX, spawnY);

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
    this.colony.spawnInitialBackgroundCats();

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

    this.humans.spawnAmbientHumans();

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

    const isNewGame = !data?.loadSave && !data?.newGamePlus && !data?.snatcherCapture;
    // Access to `localStorage` can itself throw (not just getItem) in restricted
    // contexts — Firefox with dom.storage.enabled=false, sandboxed iframes,
    // Safari with storage blocked for third-party contexts. `typeof` does not
    // help here because the global is declared; evaluating the identifier
    // triggers the getter. Fall back to `undefined` on any throw so scene boot
    // never fails because of storage availability.
    let legacyStorage: Storage | undefined;
    try {
      legacyStorage = typeof localStorage !== "undefined" ? localStorage : undefined;
    } catch {
      legacyStorage = undefined;
    }
    migrateLegacyIntroFlag(this.registry, legacyStorage);
    const shouldPlayCinematic = isNewGame && this.registry.get(StoryKeys.INTRO_SEEN) !== true;

    if (!shouldPlayCinematic) {
      this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
      this.cameras.main.setDeadzone(50, 50);
    }

    this.dayNight.on("newDay", () => {
      this.trust.survivedDay();
      const { clean } = consumeSnatchedThisNight(this.registry, this.snatcher.snatchedThisNight);
      this.scoring.recordNightSurvived({ clean });
      this.snatcher.onNewDay();
    });

    // New Game+ setup: full trust, all cats known, territory claimed
    if (data?.newGamePlus) {
      this.registry.set(StoryKeys.NEW_GAME_PLUS, true);
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

    this.trustEventUnsubscribe = this.trust.onEvent((event) => {
      this.scoring.recordTrustEvent(event);
      this.updateCloseFriendsScore();
    });
    this.updateCloseFriendsScore();

    if (!this.scene.isActive("HUDScene")) {
      this.scene.launch("HUDScene");
    }

    if (shouldPlayCinematic) {
      this.startIntroCinematic(spawnX, spawnY);
    } else if (isNewGame) {
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

    // Recovery: encounter 5 was started but narrative never completed
    // (save/load mid-encounter). Must call CamilleEncounterSystem.startEncounter
    // to actually spawn Camille; just setting flags leaves
    // `pendingCamilleEncounter` orphaned with no NPC to trigger proximity.
    if (
      data?.loadSave &&
      (this.registry.get(StoryKeys.CAMILLE_ENCOUNTER) as number) >= 5 &&
      this.registry.get(StoryKeys.ENCOUNTER_5_COMPLETE) !== true
    ) {
      this.time.delayedCall(500, () => this.camille.startEncounter(5));
    }
  }

  private placePlaygroundCarabao(): void {
    const playgroundPoint = this.map.findObject("spawns", (obj) => obj.name === "poi_playground");
    const carabaoX = (playgroundPoint?.x ?? 22 * TILE_SIZE) + TILE_SIZE * 0.5;
    const carabaoY = (playgroundPoint?.y ?? 31 * TILE_SIZE) + TILE_SIZE * 4;
    const hornbillX = carabaoX - TILE_SIZE * 3;
    const hornbillY = carabaoY - TILE_SIZE * 3;

    this.add.image(carabaoX, carabaoY, "carabao_small").setOrigin(0.5, 1).setScale(0.5).setDepth(4);
    this.add.image(hornbillX, hornbillY, "hornbill_small").setOrigin(0.5, 1).setScale(0.3).setDepth(4);
  }

  private placeStarbucksLogo(): void {
    const waterPoint = this.map.findObject("spawns", (obj) => obj.name === "poi_starbucks_water");
    const logoX = (waterPoint?.x ?? 74 * TILE_SIZE) + TILE_SIZE * 2;
    const logoY = (waterPoint?.y ?? 2 * TILE_SIZE) - TILE_SIZE;

    this.add.image(logoX, logoY, "starbucks_logo").setOrigin(0.5, 0.5).setScale(0.3).setDepth(4);
  }

  private tintForSuvDropoff(sequenceIndex: number): number | null {
    return DROPOFF_SUV_TINT_CYCLE[(sequenceIndex - 1) % DROPOFF_SUV_TINT_CYCLE.length] ?? null;
  }

  /** Called by the intro cinematic (this scene) and {@link ColonyDynamicsSystem} dumping events. */
  vehicleOptionsForDumpingEvent(eventNum: number): DropoffVehicleOptions {
    if (eventNum === 1) {
      return {
        texture: DROPOFF_COROLLA_TEXTURE,
        displayWidth: DROPOFF_COROLLA_DISPLAY_WIDTH,
        displayHeight: DROPOFF_COROLLA_DISPLAY_HEIGHT,
      };
    }

    return { tint: this.tintForSuvDropoff(eventNum - 1) };
  }

  /** Called by the intro cinematic (this scene) and {@link ColonyDynamicsSystem} dumping events. */
  addDropoffVehicle(x: number, y: number, options: DropoffVehicleOptions = {}): Phaser.GameObjects.Image {
    const texture = options.texture ?? DROPOFF_SUV_TEXTURE;
    const displayWidth = options.displayWidth ?? DROPOFF_SUV_DISPLAY_WIDTH;
    const displayHeight = options.displayHeight ?? DROPOFF_SUV_DISPLAY_HEIGHT;
    const tint = options.tint ?? null;

    const vehicle = this.add
      .image(x, y, texture)
      .setDisplaySize(displayWidth, displayHeight)
      .setDepth(4);

    if (tint !== null) {
      vehicle.setTint(tint);
    }

    return vehicle;
  }

  // ──────────── Intro Cinematic ────────────

  private startIntroCinematic(spawnX: number, spawnY: number): void {
    this.clearIntroCinematicResources();
    this.cinematicActive = true;
    this.dayNight.snapVisualToPhase("night");

    this.player.setVisible(false);
    this.player.setVelocity(0, 0);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body | undefined;
    playerBody?.setEnable(false);

    this.cameras.main.centerOn(spawnX, spawnY);

    const screenW = this.cameras.main.width;
    const screenH = this.cameras.main.height;

    const overlay = this.add
      .rectangle(screenW / 2, screenH / 2, screenW, screenH, 0x000000, 1)
      .setScrollFactor(0)
      .setDepth(300);

    const narStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: "16px",
      fontStyle: "italic",
      color: "#999999",
      align: "center",
    };

    const openingText = this.add
      .text(screenW / 2, screenH / 2, "A car. A door. Hands.", narStyle)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(301)
      .setAlpha(0);

    const motionReduced = this.registry.get("MOTION_REDUCED") === true;
    const openFadeInMs = motionReduced ? 200 : 1500;
    const overlayRevealDelayMs = motionReduced ? 600 : 3000;
    const textFadeOutMs = motionReduced ? 200 : 500;
    const overlayFadeMs = motionReduced ? 300 : 1500;

    this.queueIntroTween({
      targets: openingText,
      alpha: 1,
      duration: openFadeInMs,
      ease: "Linear",
    });

    this.queueIntroDelayed(overlayRevealDelayMs, () => {
      this.queueIntroTween({
        targets: openingText,
        alpha: 0,
        duration: textFadeOutMs,
        onComplete: () => openingText.destroy(),
      });
      this.queueIntroTween({
        targets: overlay,
        alpha: 0,
        duration: overlayFadeMs,
        ease: "Linear",
        onComplete: () => overlay.destroy(),
      });
    });

    const roadY = spawnY + 32;
    const carOffscreenX = spawnX + 400;
    const carStopX = spawnX + 24;

    const car = this.addDropoffVehicle(carOffscreenX, roadY);

    this.queueIntroDelayed(4500, () => {
      this.queueIntroTween({
        targets: car,
        x: carStopX,
        duration: 2000,
        ease: "Cubic.easeOut",
      });
    });

    this.queueIntroDelayed(7500, () => {
      this.player.setPosition(carStopX - 20, roadY - 4);
      this.player.setVisible(true);
      this.player.enterForcedCrouchPose();
    });

    this.queueIntroDelayed(9000, () => {
      this.queueIntroTween({
        targets: car,
        x: carOffscreenX + 200,
        duration: 2500,
        ease: "Cubic.easeIn",
        onComplete: () => car.destroy(),
      });
    });

    // Car exits ~11500ms; spec: 2s pause before first narration line
    this.queueIntroDelayed(13500, () => {
      const hud = this.scene.get("HUDScene") as HUDScene | undefined;
      hud?.showNarration("The engine fades. The concrete is hot. Everything smells wrong.");
    });

    this.queueIntroDelayed(16800, () => {
      const hud = this.scene.get("HUDScene") as HUDScene | undefined;
      hud?.showNarration("You are alone.");
    });

    this.queueIntroDelayed(19200, () => {
      this.endIntroCinematic();
    });
  }

  private endIntroCinematic(): void {
    this.cinematicActive = false;
    // Route cleanup through the shared helper so any still-running tweens or
    // pending delayed calls are actually cancelled (not just dereferenced).
    // Today the final scheduled tween finishes at ~11.5s and endIntroCinematic
    // runs at ~19.2s, so every tracked resource is already complete — but a
    // future tween/timer added to the tail of the intro would otherwise
    // silently leak past shutdown. Matches startIntroCinematic() + shutdown().
    this.clearIntroCinematicResources();

    // Blend night→dawn instead of snapping so the intro bleeds into
    // gameplay. Motion-reduced users still get a quick cross-fade rather
    // than a jarring hard cut. `dayNight.update()` will drive the lerp now
    // that `cinematicActive` is false.
    const motionReduced = this.registry.get("MOTION_REDUCED") === true;
    const dawnBlendMs = motionReduced ? 400 : 5000;
    this.dayNight.transitionVisualToPhase("dawn", dawnBlendMs);

    this.player.exitForcedCrouchPose();
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body | undefined;
    playerBody?.setEnable(true);

    // Anchor the camera on Mamma Cat's dumped position before starting the
    // follow lerp; otherwise the camera was centered on `spawn_player` and
    // would visibly drift ~28px to the cat, which reads as the cat teleporting.
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(50, 50);

    try {
      localStorage.setItem("ayala_intro_seen", "1");
    } catch {
      /* storage may be unavailable in some contexts */
    }
    this.registry.set(StoryKeys.INTRO_SEEN, true);
  }

  setTouchMovementIntent(intent: MovementIntent): void {
    const run = this.touchMovementIntent.run;
    this.touchMovementIntent = { ...intent, run };
    this.player?.setExternalMovementIntent(this.touchMovementIntent);
  }

  clearTouchMovementIntent(): void {
    this.touchMovementIntent = { ...EMPTY_MOVEMENT_INTENT };
    this.player?.clearExternalMovementIntent();
  }

  clearTouchInputState(clearQueues = true): void {
    this.touchMovementIntent = { ...EMPTY_MOVEMENT_INTENT };
    this.touchRestDown = false;
    this.touchRestPressedQueued = false;
    this.touchRestReleased = false;
    if (clearQueues) {
      this.touchInteractQueued = false;
      this.touchPeekQueued = false;
      this.touchJournalQueued = false;
      this.touchPauseQueued = false;
    }
    this.player?.clearExternalMovementIntent();
    this.player?.cancelExternalCrouchPress();
  }

  setTouchRun(active: boolean): void {
    this.touchMovementIntent = { ...this.touchMovementIntent, run: active };
    this.player?.setExternalMovementIntent(this.touchMovementIntent);
  }

  beginTouchCrouch(): void {
    this.player?.beginExternalCrouchPress();
  }

  endTouchCrouch(): void {
    this.player?.endExternalCrouchPress();
  }

  queueTouchInteract(): void {
    this.touchInteractQueued = true;
  }

  beginTouchRest(): void {
    this.touchRestDown = true;
    this.touchRestPressedQueued = true;
  }

  endTouchRest(): void {
    this.touchRestDown = false;
    this.touchRestReleased = true;
  }

  queueTouchPeek(): void {
    this.touchPeekQueued = true;
  }

  queueTouchJournal(): void {
    this.touchJournalQueued = true;
  }

  queueTouchPause(): void {
    this.touchPauseQueued = true;
  }

  private consumeTouchPauseQueue(): boolean {
    const requested = this.touchPauseQueued;
    this.touchPauseQueued = false;
    return requested;
  }

  private consumeTouchJournalQueue(): boolean {
    const requested = this.touchJournalQueued;
    this.touchJournalQueued = false;
    return requested;
  }

  private consumeTouchPeekQueue(): boolean {
    const requested = this.touchPeekQueued;
    this.touchPeekQueued = false;
    return requested;
  }

  private consumeTouchInteractQueue(): boolean {
    const requested = this.touchInteractQueued;
    this.touchInteractQueued = false;
    return requested;
  }

  private handlePauseInput(): void {
    if (this.scene.isActive("JournalScene")) {
      this.scene.stop("JournalScene");
      if (this.journalOpenedFromPause) {
        this.journalOpenedFromPause = false;
        const hud = this.scene.get("HUDScene") as HUDScene | undefined;
        hud?.showPauseMenu?.();
      } else {
        this.resumeGame();
      }
      return;
    }

    this.togglePause();
  }

  private handleJournalToggleInput(): void {
    if (this.scene.isActive("JournalScene")) {
      this.scene.stop("JournalScene");
      if (this.journalOpenedFromPause) {
        this.journalOpenedFromPause = false;
        const hud = this.scene.get("HUDScene") as HUDScene | undefined;
        hud?.showPauseMenu?.();
      } else {
        this.resumeGame();
      }
      return;
    }

    if (!this.isPaused && !this.dialogue.isActive && !this.stats.collapsed) {
      this.openJournal();
    }
  }

  private togglePeekInput(): void {
    this.isPeeking = !this.isPeeking;
    this.cameras.main.zoomTo(this.isPeeking ? PEEK_ZOOM : DEFAULT_ZOOM, ZOOM_DURATION);
  }

  private tryPrimaryInteract(time: number): void {
    if (this.dialogue.isActive || this.playerInputFrozen) return;

    const usedSource = this.foodSources.tryInteract(
      this.player.x,
      this.player.y,
      this.stats,
      this.dayNight.currentPhase,
      time,
    );

    if (usedSource) {
      this.scoring.discoverFoodSource(this.foodSourceKey(usedSource));
      // Play the directional drinking / eating animation as feedback.
      // Shared by every FoodSource type (water_bowl, fountain,
      // feeding_station, restaurant_scraps, bugs); startConsuming() is a
      // no-op while resting/waking/greeting/already-consuming so it can't
      // stack or restart a half-played beat.
      this.player.startConsuming();

      for (const { cat } of this.npcs) {
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, cat.x, cat.y) < LEARN_NAME_DISTANCE) {
          this.trust.seenEating();
          break;
        }
      }
      return;
    }

    this.tryInteract();
  }

  update(time: number, delta: number): void {
    if (this.cinematicActive) return;

    // Dialogue engagement release (close / out-of-range / flee / destroy)
    // is owned by {@link CatDialogueController.tickEngagement}.
    this.catDialogue.tickEngagement();

    // Escape must be checked before the pause gate so it can unpause.
    // When the journal is open, ESC closes it (same pattern as J key).
    const pauseRequested =
      (this.escapeKey && Phaser.Input.Keyboard.JustDown(this.escapeKey)) || this.consumeTouchPauseQueue();
    if (pauseRequested) {
      if (!this.playerInputFrozen) {
        this.handlePauseInput();
        return;
      }
    }

    // Release J toggle lock only after the key is fully released.
    if (this.journalKey && !this.journalKey.isDown) {
      this.journalToggleLocked = false;
    }

    // J toggles the colony journal. Use key-locking to avoid double-toggles
    // when multiple scenes process the same key-down event in one frame.
    const touchJournalRequested = this.consumeTouchJournalQueue();
    if (this.playerInputFrozen && this.journalKey?.isDown) {
      this.journalToggleLocked = true;
    }
    const journalRequested = touchJournalRequested || (this.journalKey?.isDown && !this.journalToggleLocked);
    if (journalRequested && !this.playerInputFrozen) {
      if (this.journalKey?.isDown) this.journalToggleLocked = true;
      this.handleJournalToggleInput();
      return;
    }

    if (this.isPaused) return;

    const deltaSec = delta / 1000;
    this.dayNight.update(delta);
    this.camille.trySpawnAmbientDawnVisit();

    this.player.speedMultiplier = this.stats.speedMultiplier;

    // Collapse rising/falling-edge detection + 3 s blackout timer live
    // in {@link CollapseSystem}. The scene only has to translate the
    // returned outcome into its local control flow.
    const collapseOutcome = this.collapse.tick(delta);
    if (collapseOutcome === "game_over") {
      this.triggerGameOver("collapse");
      return;
    }
    if (collapseOutcome === "blackout") return;

    // ──── Resting state ────
    if (this.player.isResting) {
      this.updateResting(deltaSec);
      this.updateNPCs(delta);
      this.updateHumansAndHazards(delta);
      this.foodSources.update(this.dayNight.currentPhase, time);
      this.guard.update(delta);
      this.guardIndicator.update();
      return;
    }

    // ──── Tab peek (toggle) ────
    const peekRequested = (this.tabKey && Phaser.Input.Keyboard.JustDown(this.tabKey)) || this.consumeTouchPeekQueue();
    if (peekRequested) {
      if (!this.playerInputFrozen) this.togglePeekInput();
    }
    if (this.isPeeking) {
      if (this.player.isMoving) {
        this.isPeeking = false;
        this.cameras.main.zoomTo(DEFAULT_ZOOM, ZOOM_DURATION);
      } else {
        this.player.setVelocity(0);
        this.updateNPCs(delta);
        this.updateHumansAndHazards(delta);
        this.foodSources.update(this.dayNight.currentPhase, time);
        this.guard.update(delta);
        this.guardIndicator.update();
        return;
      }
    }

    // ──── Interact (Space tap) ────
    const touchInteract = this.consumeTouchInteractQueue();
    const dialogueWasActiveForTouch = touchInteract && this.dialogue.isActive;
    const spaceJust = this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey);
    if (spaceJust && (this.dialogue.isActive || this.playerInputFrozen) && import.meta.env.DEV) {
      // console.log (not .debug) so the diagnostic shows at Chrome's
      // "Default levels" filter — .debug maps to Verbose which is hidden
      // by default, making Space-press bugs impossible to self-diagnose.
      // No meow here: the press was absorbed by an open dialogue / input
      // freeze, so firing audio feedback would be confusing.
      console.log("[interact]", {
        outcome: "space blocked at outer gate",
        dialogueActive: this.dialogue.isActive,
        frozen: this.playerInputFrozen,
      });
    }
    let dialogueAdvanced = false;
    if (dialogueWasActiveForTouch) {
      this.dialogue.advance();
      dialogueAdvanced = true;
    }
    if (
      (spaceJust || (touchInteract && !dialogueWasActiveForTouch)) &&
      !dialogueAdvanced &&
      !this.dialogue.isActive &&
      !this.playerInputFrozen
    ) {
      this.tryPrimaryInteract(time);
    }

    // ──── Z key: tap toggles catloaf, hold enters sleep ────
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const playerStationary = playerBody.velocity.length() < 1;
    const zDown = (this.restKey?.isDown ?? false) || this.touchRestDown;
    const zJustUp = (this.restKey ? Phaser.Input.Keyboard.JustUp(this.restKey) : false) || this.touchRestReleased;
    this.touchRestReleased = false;
    const REST_TAP_MS = 300;

    if (
      zDown &&
      playerStationary &&
      !this.dialogue.isActive &&
      !this.player.isGreeting &&
      !this.player.isConsuming &&
      !this.playerInputFrozen
    ) {
      this.restHoldTimer += delta;
      this.restHoldActive = true;
      if (this.restHoldTimer >= REST_HOLD_MS) {
        // Consume stale JustDown flag so updateResting doesn't immediately wake
        if (this.restKey) Phaser.Input.Keyboard.JustDown(this.restKey);
        this.touchRestPressedQueued = false;
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
      // Detect tap: key released quickly while stationary, not moving, no dialogue
      if (
        zJustUp &&
        this.restHoldTimer > 0 &&
        this.restHoldTimer < REST_TAP_MS &&
        playerStationary &&
        !this.dialogue.isActive &&
        !this.player.isMoving &&
        !this.player.isGreeting &&
        !this.player.isConsuming
      ) {
        if (this.player.isCatloaf) {
          this.player.exitCatloaf();
        } else if (this.player.playerState === "normal" || this.player.playerState === "crouching") {
          this.player.enterCatloaf();
        }
      }
      this.restHoldTimer = 0;
      this.restHoldActive = false;
    }
    this.touchRestPressedQueued = false;

    // Exit catloaf when any movement key is pressed
    if (this.player.isCatloaf && this.player.isMoving) {
      this.player.exitCatloaf();
    }

    // ──── Normal movement ────
    const inShade = this.isUnderCanopy(this.player.x, this.player.y);
    const inShelter = this.isNearShelter(this.player.x, this.player.y);

    if (this.playerInputFrozen) {
      // Pickup cinematic is running. Mamma Cat's position is driven by the
      // beat-5 tween; we zero velocity + skip input polling so cursor keys
      // cannot drift her out from under the tween, and skip stats updates
      // that would interpret tween-driven motion as the player walking.
      this.player.setVelocity(0);
    } else {
      this.player.update(this.stats.canRun, delta);
      this.recordPlayerMovementAndTerritory();
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

    this.humans.updatePlayerStationaryAnchor();

    this.foodSources.update(this.dayNight.currentPhase, time);
    this.guard.update(delta);
    this.guardIndicator.update();
    this.updateNPCs(delta);
    this.updateHumansAndHazards(delta);

    // Check chapter progression every 5 seconds
    this.chapterCheckTimer += delta;
    if (this.chapterCheckTimer >= 5_000) {
      this.chapterCheckTimer = 0;
      this.checkZone6Visit();
      this.checkChapterProgression();
      this.recheckTerritoryEligibility();
      this.camille.tick();
      this.snatcher.updateSpawnCheck();
      this.colony.tick();
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

    // Wake on any movement key, Space, Z, or their touch equivalents.
    if (this.player.isMoving) {
      this.player.wakeUp();
      return;
    }
    const wakePressed =
      (this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey)) ||
      (this.restKey && Phaser.Input.Keyboard.JustDown(this.restKey)) ||
      this.consumeTouchInteractQueue() ||
      this.touchRestPressedQueued;
    this.touchRestPressedQueued = false;
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
    if (this.camille.isEncounterActive) return;

    const namedKnown = new Set([...this.knownCats].filter((name) => !name.startsWith("Colony Cat")));
    const triggered = this.chapters.check({
      trust: this.trust,
      dayNight: this.dayNight,
      knownCats: namedKnown,
      registry: this.registry,
      territory: this.territory,
    });
    if (triggered) {
      const hud = this.scene.get("HUDScene") as HUDScene | undefined;
      hud?.showChapterTitle(this.chapters.titleCard);

      const narration = this.chapters.consumeNarration();
      if (narration && narration.length > 0) {
        this.dialogue.show(narration, () => {
          this.autoSave();
        });
      }

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
        const jayco = this.npcs.find((e) => e.cat.npcName === "Jayco")?.cat;
        this.narrateIfPerceivable(
          "Jayco watches you from the steps. You haven't earned his trust yet.",
          jayco ? { x: jayco.x, y: jayco.y } : undefined,
        );
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

  // ──────────── Chapter 6: Home ────────────

  private onChapter6Start(): void {
    this.startChapter6Sequence();
  }

  /**
   * Chapter 6 fade-to-black hand-off. Called by
   * {@link CamilleEncounterSystem.playBeat5Journey} the moment the pickup
   * tween completes, so the home-room narration is synchronised with
   * Mamma Cat disappearing into Camille's carrier.
   */
  startChapter6Sequence(): void {
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
        this.registry.set(StoryKeys.GAME_COMPLETED, true);
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
      this.lives,
      this.scoring.toJSON(),
    );
    if (ok) {
      const hud = this.scene.get("HUDScene") as HUDScene | undefined;
      hud?.showSaveNotice?.();
    }
  }

  /** Called by {@link SnatcherSystem} via `scene.loseLife()`. */
  loseLife(): boolean {
    const result = applyLifeLoss(this.lives);
    this.lives = result.lives;
    return result.gameOver;
  }

  triggerGameOver(reason: "collapse" | "snatched"): void {
    if (this.gameOverTriggered) return;
    this.gameOverTriggered = true;
    this.pendingGameOverReason = reason;
    this.isPaused = true;
    this.dialogue.dismiss();
    this.physics.pause();
    this.time.removeAllEvents();
    this.scene.stop("JournalScene");
    this.scene.stop("HUDScene");
    SaveSystem.clear();
    markGameOver(this.registry);

    const breakdown: ScoreBreakdown = this.scoring.getBreakdown();
    this.audio.stop();
    this.scene.launch("GameOverScene", {
      reason,
      score: this.scoring.total,
      breakdown,
    });
    this.scene.pause();
  }

  private initialiseTerritoryExploration(spawnX: number, spawnY: number): void {
    const total = this.territory.initialiseExploration({
      width: this.map.width,
      height: this.map.height,
      startX: Math.floor(spawnX / TILE_SIZE),
      startY: Math.floor(spawnY / TILE_SIZE),
      isBlocked: (x, y) => this.isExplorationCellBlocked(x, y),
    });
    this.scoring.setTotalExplorableCells(total);
    this.visitCurrentCell();
  }

  private isExplorationCellBlocked(tileX: number, tileY: number): boolean {
    const groundTile = this.groundLayer?.getTileAt(tileX, tileY);
    const objectTile = this.objectsLayer?.getTileAt(tileX, tileY);
    return Boolean(groundTile?.collides || objectTile?.collides);
  }

  /** Exposed so {@link SnatcherSystem} can route snatcher patrol paths. */
  createHumanNavigationGrid(): NavigationGrid {
    const clearance = GP.HUMAN_NAV_CLEARANCE_CHEBYSHEV_TILES;
    return createNavigationGrid({
      width: this.map.width,
      height: this.map.height,
      tileSize: TILE_SIZE,
      isBlocked: (tileX, tileY) => {
        if (this.isExplorationCellBlocked(tileX, tileY)) return true;
        if (clearance <= 0) return false;
        for (let dy = -clearance; dy <= clearance; dy += 1) {
          for (let dx = -clearance; dx <= clearance; dx += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) > clearance) continue;
            const nx = tileX + dx;
            const ny = tileY + dy;
            if (this.isExplorationCellBlocked(nx, ny)) return true;
          }
        }
        return false;
      },
    });
  }

  /** Exposed so {@link SnatcherSystem} can route snatcher patrol paths. */
  routeHumanConfig(config: HumanConfig, navigationGrid: NavigationGrid): HumanConfig {
    const shouldRoutePath = config.routePath !== false;
    const routed = shouldRoutePath
      ? routeHumanPath(config.path, navigationGrid, {
          waypointPauseMs: config.waypointPauseMs,
          lingerWaypointIndex: config.lingerWaypointIndex,
        })
      : null;

    return {
      ...config,
      path: routed?.path ?? config.path,
      waypointPauseMs: routed?.waypointPauseMs ?? config.waypointPauseMs,
      lingerWaypointIndex: routed?.lingerWaypointIndex ?? config.lingerWaypointIndex,
      routeLocalDetour: (from, to) => {
        const segment = routeHumanPath([from, to], navigationGrid);
        if (segment.path.length <= 1) return null;
        const hops = segment.path.slice(1, -1);
        return hops.length > 0 ? hops : null;
      },
      routeToExit: (from, exits) => {
        const nearest = this.nearestExitPoint(from, exits);
        if (!nearest) return [from];
        return [from, ...routeHumanPath([from, nearest], navigationGrid).path];
      },
    };
  }

  private nearestExitPoint(
    from: { x: number; y: number },
    exits: ReadonlyArray<{ x: number; y: number }>,
  ): { x: number; y: number } | null {
    let nearest = exits[0];
    if (!nearest) return null;
    let bestDist = Phaser.Math.Distance.Between(from.x, from.y, nearest.x, nearest.y);

    for (let i = 1; i < exits.length; i += 1) {
      const exit = exits[i]!;
      const dist = Phaser.Math.Distance.Between(from.x, from.y, exit.x, exit.y);
      if (dist < bestDist) {
        nearest = exit;
        bestDist = dist;
      }
    }

    return nearest;
  }

  private recordPlayerMovementAndTerritory(): void {
    const distance = Phaser.Math.Distance.Between(
      this.previousPlayerX,
      this.previousPlayerY,
      this.player.x,
      this.player.y,
    );
    if (this.player.isMoving && !this.playerInputFrozen) {
      this.scoring.addDistance(distance);
    }
    this.previousPlayerX = this.player.x;
    this.previousPlayerY = this.player.y;
    this.visitCurrentCell();
  }

  private visitCurrentCell(): void {
    const tileX = Math.floor(this.player.x / TILE_SIZE);
    const tileY = Math.floor(this.player.y / TILE_SIZE);
    const key = this.territory.visitCell(tileX, tileY, this.map.width);
    if (key !== null) this.scoring.visitCell(key);
  }

  private foodSourceKey(source: { type: SourceType; x: number; y: number }): string {
    return `${source.type}:${Math.round(source.x)}:${Math.round(source.y)}`;
  }

  /**
   * Called by {@link CollapseSystem.recoverFromCollapse} the moment it
   * teleports Mamma Cat to the safe-sleep POI. Snapshots the new
   * position so the next movement poll doesn't register a 1000+ px
   * "step" (WORKING_MEMORY "Position-dependent checks across a
   * teleport"), and re-fires the territory visit hook so the cell
   * under the safe-sleep spawn counts toward the exploration grid.
   */
  onCollapseTeleport(x: number, y: number): void {
    this.previousPlayerX = x;
    this.previousPlayerY = y;
    this.visitCurrentCell();
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
  syncTrustDisposition(catName: string): void {
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

  // awardFirstConversation / awardReturnConversation moved into
  // {@link CatDialogueController} (Commit D). Both helpers were only
  // called from the dialogue close callback.

  private setNPCDisposition(name: string, disposition: "friendly" | "neutral" | "territorial" | "wary"): void {
    const entry = this.npcs.find((e) => e.cat.npcName === name);
    if (entry) {
      entry.cat.disposition = disposition;
      entry.indicator.setDisposition(disposition);
    }
  }

  addKnownCat(name: string): void {
    this.knownCats.add(name);
    this.registry.set("KNOWN_CATS", Array.from(this.knownCats));

    const metDays = (this.registry.get("JOURNAL_MET_DAYS") as Record<string, number> | undefined) ?? {};
    if (typeof metDays[name] !== "number") {
      metDays[name] = this.dayNight.dayCount;
      this.registry.set("JOURNAL_MET_DAYS", metDays);
    }
    this.updateCloseFriendsScore();
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

      // Clear the "just spoke to" guard once the player leaves interaction
      // range OR enough time has elapsed, so coming back later naturally
      // triggers the next scripted response instead of it chaining from the
      // last one. The time branch prevents stationary Mamma from being
      // locked out of re-engaging a cat she didn't walk away from.
      // Logic lives in {@link CatDialogueController.refreshLastPartner}.
      this.catDialogue.refreshLastPartner(cat, dist, now);

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
      if (dist < GP.CAT_PERSON_GREET_DIST) {
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

    if (cat.state === "sleeping") {
      this.emotes.show(this, cat, "sleep");
    } else if (cat.state === "alert" || cat.state === "fleeing") {
      this.emotes.show(this, cat, "alert");
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
    const ginger = this.spawnNPC("Ginger", "fluffy", "spawn_ginger", "wary", 200, 774, 1378);
    ginger.setTint(0xffaa44);
    const gingerB = this.spawnNPC("Ginger B", "fluffy", "spawn_ginger", "wary", 200, 774, 1378, {
      offsetX: 60,
    });
    gingerB.setTint(0xffaa44);
  }

  // ──────────── Humans (thin scene-facade) ────────────

  /**
   * Tick per-human behaviour, then the hazards they depend on (dog
   * updates, snatcher detection, danger music, colony-cat flee-from-
   * snatcher sweep). Kept on the scene because the flee loop and the
   * audio danger crossfade touch systems that aren't human-presence
   * concerns. Called from three arms of {@link update} (resting, peek,
   * normal) so the ordering around food sources / guards is preserved.
   */
  private updateHumansAndHazards(delta: number): void {
    this.humans.tick(delta);

    const now = this.time.now;
    for (const dog of this.dogs) {
      dog.update(now, this.player, this.npcs, this.emotes, this);
    }

    if (this.dayNight.currentPhase === "night") {
      this.snatcher.checkDetection();
    }

    // Crossfade background music to the danger theme whenever any
    // snatcher exists in the park. setDanger() is idempotent, so
    // calling it every frame is cheap.
    this.audio.setDanger(this.snatcher.hasAnyActive);

    // NPC cats flee from snatchers.
    if (this.snatcher.hasAnyActive) {
      for (const snatcher of this.snatcher.activeSnatchers) {
        if (!snatcher.visible) continue;
        for (const { cat } of this.npcs) {
          if (cat.state === "sleeping" || cat.state === "alert" || cat.state === "fleeing") continue;
          const dist = Phaser.Math.Distance.Between(snatcher.x, snatcher.y, cat.x, cat.y);
          if (dist < GP.NPC_FLEE_SNATCHER_DIST) {
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

  /** True when Mamma Cat is within radial distance of the Makati Ave road centreline. */
  isNearMakatiAve(worldX: number, worldY: number): boolean {
    return Phaser.Math.Distance.Between(worldX, worldY, GP.MAKATI_AVE_CENTER_X, worldY) <= GP.MAKATI_AVE_WITNESS_DIST;
  }

  /** Approximate line-of-sight check by raymarching through collision tiles. */
  hasLineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    if (!this.objectsLayer) return true;
    return hasLineOfSightTiles(ax, ay, bx, by, TILE_SIZE, (wx, wy) => {
      const tileX = Math.floor(wx / TILE_SIZE);
      const tileY = Math.floor(wy / TILE_SIZE);
      const tile = this.objectsLayer!.getTileAt(tileX, tileY);
      return Boolean(tile?.collides);
    });
  }

  /**
   * Sensory narration: only fires when the source is within range AND the
   * player has line-of-sight to it. Inner monologue: omit `source` to bypass
   * both checks. LOS matters because these narrations describe visual cues
   * ("Jayco watches you from the steps", cat body-language lines); firing
   * them through a wall or building would lie about what the player can see.
   */
  narrateIfPerceivable(
    line: string,
    source?: { x: number; y: number },
    radius: number = GP.NARRATION_WITNESS_DIST,
  ): void {
    const hud = this.scene.get("HUDScene") as HUDScene | undefined;
    if (!source) {
      hud?.showNarration(line);
      return;
    }
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, source.x, source.y);
    if (d > radius) return;
    if (!this.hasLineOfSight(this.player.x, this.player.y, source.x, source.y)) return;
    hud?.showNarration(line);
  }

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
    // Greeting and consuming are both lock-in animation states that register
    // a `once(ANIMATION_COMPLETE)` listener in MammaCat. Opening cat dialogue
    // here calls `player.faceToward(...)` → `anims.stop()` on the running
    // drink/greet animation, which fires ANIMATION_STOP (not COMPLETE) and
    // orphans the listener — leaving the state machine stuck and the player
    // frozen. Skip the whole engagement path until the animation finishes.
    if (this.player.isGreeting) {
      this.logInteractDiag("skipped: player mid-greeting", null, Infinity, null, Infinity);
      return;
    }
    if (this.player.isConsuming) {
      this.logInteractDiag("skipped: player mid-consuming", null, Infinity, null, Infinity);
      return;
    }

    let nearestEntry: NPCEntry | null = null;
    let nearestDist = Infinity;
    // Track the absolute-nearest cat ignoring the `lastDialoguePartner`
    // skip, so the diagnostic can tell "no cat in range" apart from "a cat
    // is right next to you but is being intentionally skipped".
    let nearestRawEntry: NPCEntry | null = null;
    let nearestRawDist = Infinity;
    for (const entry of this.npcs) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, entry.cat.x, entry.cat.y);
      if (dist < nearestRawDist) {
        nearestRawEntry = entry;
        nearestRawDist = dist;
      }
      // Skip the cat we just finished talking to until the player has stepped
      // out of range. Without this guard, a single Space press can both close
      // the current dialogue (Phaser dispatches key events before update())
      // and immediately re-open the next scripted response for the same NPC.
      if (this.catDialogue.isSkippedPartner(entry.cat)) continue;
      if (dist < INTERACTION_DISTANCE && dist < nearestDist) {
        nearestEntry = entry;
        nearestDist = dist;
      }
    }
    if (!nearestEntry) {
      // Beat-5 decision gate takes priority over the free greet: if the
      // player pressed Space close enough to Camille while her 10s window
      // is open, consume the press as the "yes, take me home" answer.
      // acceptBeat5() fires Mamma's greeting animation itself so we return
      // early here and do NOT double-trigger startGreeting().
      if (this.camille.tryAcceptBeat5Decision()) {
        this.logInteractDiag("consumed by Beat-5 decision", null, Infinity, nearestRawEntry, nearestRawDist);
        this.audio.playMeow();
        return;
      }
      // No cat in range — space becomes a free Mamma-Cat greeting action.
      // This is NOT proximity-gated and does NOT target any NPC: the player
      // can greet anywhere, any time. The humans' own passive proximity greet
      // loop in updateHumans() is untouched and still runs independently.
      this.logInteractDiag("free greet (no cat in range)", null, Infinity, nearestRawEntry, nearestRawDist);
      this.player.startGreeting();
      // Only meow on a free greet if Mamma is actually greeting *someone* —
      // i.e. a human NPC is within the player-initiated greet range. A free
      // greet in empty space is silent.
      if (this.humans.isHumanInGreetRange()) {
        this.audio.playMeow();
        this.humans.recordHumanEngagement();
      }
      return;
    }
    const cat = nearestEntry.cat;
    if (cat.state === "sleeping") {
      this.logInteractDiag("alerted sleeping cat", nearestEntry, nearestDist, nearestRawEntry, nearestRawDist);
      cat.triggerAlert();
      this.audio.playMeow();
      return;
    }
    this.logInteractDiag("engaging dialogue", nearestEntry, nearestDist, nearestRawEntry, nearestRawDist);
    this.audio.playMeow();
    this.catDialogue.show(cat);
  }

  private updateCloseFriendsScore(): void {
    let closeFriends = 0;
    for (const name of this.knownCats) {
      if (name.startsWith("Colony Cat")) continue;
      if (this.trust.getCatTrust(name) >= 50) closeFriends += 1;
    }
    this.scoring.setCloseFriendsMade(closeFriends);
  }

  /**
   * DEV-only one-line breakdown of every Space-interact press, so "why
   * didn't that do anything?" is self-diagnosing. Prints the guard state
   * (dialogue/frozen/greeting), the selected target (respecting the
   * `lastDialoguePartner` skip), and the absolute-nearest cat so you can
   * see at a glance whether proximity or the just-spoke-to guard was what
   * blocked engagement. No-ops in production builds.
   *
   * Uses `console.log` (not `.debug`) because Chrome's "Default levels"
   * filter hides `.debug` under the Verbose bucket — the whole point of
   * this diagnostic is to be visible without tweaking DevTools.
   */
  private logInteractDiag(
    outcome: string,
    selected: NPCEntry | null,
    selectedDist: number,
    rawNearest: NPCEntry | null,
    rawNearestDist: number,
  ): void {
    if (!import.meta.env.DEV) return;
    console.log("[interact]", {
      outcome,
      dialogueActive: this.dialogue.isActive,
      frozen: this.playerInputFrozen,
      isGreeting: this.player.isGreeting,
      lastPartner: this.catDialogue.lastPartnerName,
      selected: selected ? { name: selected.cat.npcName, dist: Math.round(selectedDist) } : null,
      nearestAny: rawNearest ? { name: rawNearest.cat.npcName, dist: Math.round(rawNearestDist) } : null,
      interactDist: INTERACTION_DISTANCE,
    });
  }

  // Cat-dialogue engagement, AI request orchestration, response
  // rendering + post-close bookkeeping all live in
  // {@link CatDialogueController}. Scene entry point is `tryInteract()`.

  // ──────────── Snatchers + Colony (extracted) ────────────
  // Snatcher lifecycle (spawn/detect/capture) lives in SnatcherSystem.
  // Dumping events + dynamic colony total + background roster spawn
  // live in ColonyDynamicsSystem. The scene keeps the narrow bridge
  // below for removing a colony cat entity: both systems share the
  // `npcs[]` roster with cat dialogue / chapter progression code that
  // stays on the scene until Commit D.

  /**
   * Remove a colony-cat entity when it's captured by a snatcher. Splices
   * the roster, destroys the indicator + sprite, and clears the dialogue
   * chaining guard if it pointed at this cat (WORKING_MEMORY "Input
   * Guards — Dialogue State"). Called from
   * {@link SnatcherSystem.handleColonyCatSnatch}.
   *
   * The witness gate + registry bookkeeping (CATS_SNATCHED counter,
   * narration) is owned by {@link SnatcherSystem} so the pre-destroy
   * `cat.x/y` position is captured before this helper runs — see
   * WORKING_MEMORY "Position-dependent checks across a teleport".
   */
  removeColonyCat(cat: NPCCat): void {
    const idx = this.npcs.findIndex((entry) => entry.cat === cat);
    if (idx !== -1) {
      const entry = this.npcs[idx]!;
      this.npcs.splice(idx, 1);
      entry.indicator.destroy();
      entry.cat.destroy();
    } else {
      cat.destroy();
    }

    this.catDialogue.clearPartnerIfMatches(cat);
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
