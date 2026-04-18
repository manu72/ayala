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
import {
  GP,
  REST_HOLD_MS,
  COLLAPSE_RECOVERY_MS,
  INITIAL_COLONY_TOTAL,
  NAMED_AND_MAMMA_COUNT,
  VISIBLE_BACKGROUND_CAP,
  CAMILLE_BEAT5_DECISION_MS,
  STATIONARY_GREET_CAP,
  STATIONARY_MOVE_THRESHOLD_PX,
} from "../config/gameplayConstants";
import { StoryKeys, migrateLegacyIntroFlag } from "../registry/storyKeys";
import { computeBackgroundSpawnCount, decrementColonyTotal } from "../utils/colonySpawn";
import {
  ScriptedDialogueService,
  type DialogueService,
  type DialogueRequest,
  type DialogueResponse,
  type ConversationEntry,
} from "../services/DialogueService";
import { AIDialogueService } from "../services/AIDialogueService";
import { FallbackDialogueService } from "../services/FallbackDialogueService";
import type { DialogueHooks } from "../systems/DialogueSystem";
import { storeConversation, getRecentConversations } from "../services/ConversationStore";
import { AI_PERSONAS } from "../ai/personas";
import { CAT_DIALOGUE_SCRIPTS, getRandomColonyLine } from "../data/cat-dialogue";
import {
  CAMILLE_ENCOUNTER_BEATS,
  CAMILLE_ENCOUNTER_5_PREDECISION_STEPS,
  CAMILLE_ENCOUNTER_5_JOURNEY_STEPS,
  CAMILLE_BEAT5_ACCEPT_LINE,
  CAMILLE_BEAT5_TIMEOUT_LINE,
  mergeCamilleBeatSteps,
  type EncounterStep,
} from "../data/camille-encounter-beats";
import { resolveSnatcherSpawnAction } from "../systems/SnatcherSystem";
import { AudioSystem } from "../systems/AudioSystem";
import { hasLineOfSightTiles } from "../utils/lineOfSight";

const INTERACTION_DISTANCE = GP.INTERACTION_DIST;
const DIALOGUE_BREAK_DISTANCE = GP.DIALOGUE_BREAK_DIST;
const LEARN_NAME_DISTANCE = GP.LEARN_NAME_DIST;
const TILE_SIZE = GP.TILE_SIZE;
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
  cinematicActive = false;

  /** Pending intro cinematic timers/tweens — cleared on scene shutdown to avoid callbacks after destroy. */
  private introTimerEvents: Phaser.Time.TimerEvent[] = [];
  private introCinematicTweens: Phaser.Tweens.Tween[] = [];

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
  /**
   * Rising/falling-edge tracker for `stats.collapsed`. `onCollapsed` /
   * `onRecovered` only fire on the frame the flag transitions. Reset in
   * `create()` after a save load so `fromJSON` never triggers narration.
   */
  private wasCollapsed = false;
  /**
   * The nearest friendly NPC cat captured at the moment of collapse, used by
   * `recoverFromCollapse()` for witness-aware narration and bonus trust. Held
   * by object ref (not name) so the check survives name churn. Null when no
   * witness was in range, or between collapses.
   */
  private collapseWitness: NPCCat | null = null;
  private emotes!: EmoteSystem;
  chapters!: ChapterSystem;
  private chapterCheckTimer = 0;
  private humans: HumanNPC[] = [];
  private dogs: DogNPC[] = [];
  /** Tracks which cats have already shown narration this approach, to avoid repeating. */
  private narrationShown = new Set<string>();
  private dialogueService!: DialogueService;
  territory!: TerritorySystem;
  /**
   * Owns the looping background music (ambient ↔ danger crossfade) and
   * one-shot SFX. Public so HUDScene can hook the mute toggle.
   */
  audio!: AudioSystem;

  // Camille encounter sequence state
  private camilleNPC: HumanNPC | null = null;
  private manuNPC: HumanNPC | null = null;
  private kishNPC: HumanNPC | null = null;
  private camilleEncounterActive = false;
  private camilleRollDay = 0;

  /** NPC currently locked in dialogue with the player. */
  private engagedDialogueNPC: NPCCat | null = null;
  private dialogueRequestInFlight = false;
  /** Fires a subtle "thinking" emote if AI dialogue is slow to return. */
  private aiThinkingTimer: Phaser.Time.TimerEvent | null = null;

  /**
   * Per-human cooldown (wall ms) before another AI-driven ambient bubble is
   * requested. Scripted bubbles continue firing during the cooldown so the
   * world does not fall silent. Keyed by HumanNPC instance so named entities
   * (Camille) and anonymous-but-identified entities (feeders) each get their
   * own timer.
   */
  private humanAiBubbleCooldownUntil: WeakMap<HumanNPC, number> = new WeakMap();
  /**
   * Global single-flight guard: at most one AI ambient bubble may be in
   * flight at a time. Prevents a crowded scene (Camille + Manu + Kish all
   * approaching cats at once) from burning a burst of LLM calls. Engaged
   * (Space-triggered) cat dialogue uses its own `dialogueRequestInFlight`
   * guard and is independent.
   */
  private humanAiBubbleInFlight = false;
  /** Abort controller for the currently in-flight human bubble (if any). */
  private humanAiBubbleAbort: AbortController | null = null;

  /**
   * NPC the player just finished a conversation with. The player must leave
   * the cat's interaction range before re-engaging, otherwise a single Space
   * press (or held key) chains straight into the next scripted response —
   * turning Blacky's first-meeting dialogue into the "Still here? Good..."
   * return dialogue immediately, with no time having elapsed in-world.
   *
   * Cleared in `updateNPCs` when EITHER the player steps outside
   * `INTERACTION_DISTANCE`, OR `LAST_PARTNER_HOLD_MS` elapses. The time
   * expiry rescues the stationary-Mamma case: if the player closes a
   * dialogue and doesn't move, waiting a beat is enough to re-engage —
   * without it, the only way out was to walk a pixel away and back.
   */
  private lastDialoguePartner: NPCCat | null = null;
  private lastDialoguePartnerAt = 0;
  private static readonly LAST_PARTNER_HOLD_MS = 1500;

  // Snatcher tracking
  private snatchers: HumanNPC[] = [];
  private snatcherSpawnChecked = false;

  // Colony dynamics. `colonyCount` mirrors `StoryKeys.COLONY_COUNT` in the
  // registry — total cat population (named + Mamma + background). See
  // gameplayConstants.ts for the model. Source of truth is the registry;
  // the field is a cache read on load and written alongside every registry
  // mutation so code paths that already reference `this.colonyCount` keep
  // working without a second registry round-trip each frame.
  private colonyCount = INITIAL_COLONY_TOTAL;
  private dumpingArmed = 0;
  private dumpingInProgress = false;
  private pendingCamilleEncounter = 0;

  /**
   * True while Camille's beat-5 10-second decision window is open. The player
   * must walk Mamma Cat within CAMILLE_BEAT5_TOUCH_DIST of Camille and press
   * Space to greet her within the window for the beat to resolve as "yes";
   * otherwise Camille speaks a gentle timeout line and the beat re-arms.
   */
  private beat5DecisionActive = false;
  /** TimerEvent for the beat-5 decision window; cancelled on accept / shutdown. */
  private beat5DecisionTimer: Phaser.Time.TimerEvent | null = null;
  /**
   * Freeze flag for player input during the beat-5 pickup sequence. Set just
   * before the pickup tween starts and cleared on scene shutdown / cleanup.
   * While true, movement, interact, and rest inputs are all ignored so the
   * pickup cinematic cannot be short-circuited.
   */
  private playerInputFrozen = false;
  /**
   * Reference position used to decide whether Mamma Cat is "stationary" for
   * the purposes of the per-human greeting cap. Reset to the player's
   * current position whenever she moves more than STATIONARY_MOVE_THRESHOLD_PX
   * from this anchor; every human's stationary greet counter is cleared at
   * the same time. See {@link STATIONARY_GREET_CAP}.
   */
  private playerStationaryAnchorX = 0;
  private playerStationaryAnchorY = 0;

  /** One scripted "Kish, slow down" beat per Camille evening spawn. */
  private kishCamilleSlowDownShown = false;

  /** Camille lines when she recognises a named colony cat (Phase 4.5). */
  private readonly camillePersonalLines: Record<string, string[]> = {
    Blacky: ["Blacky, you handsome boy.", "Hey, Blacky.", "There's my boy."],
    Tiger: ["Tiger, not hissing today?", "Hi, Tiger.", "Easy, Tiger."],
    Jayco: ["Jayco. Good to see you.", "Hey, Jayco."],
    "Jayco Jr": ["Hey, little one.", "Jayco Jr — you're getting big."],
    Fluffy: ["Fluffy. How's the fountain?", "Hi, Fluffy."],
    Pedigree: ["Well, look at you.", "Hello, beautiful."],
    Ginger: ["Ginger. Hey, sweetie.", "Hi, Ginger."],
    "Ginger B": ["There you are, Ginger B.", "Hey, you."],
  };

  /** Dialogue lives in HUDScene (1x zoom) so it's always visible. */
  private get dialogue(): {
    isActive: boolean;
    show: (
      lines: string[],
      onComplete?: () => void,
      hooks?: DialogueHooks,
    ) => void;
    dismiss: () => void;
  } {
    const hud = this.scene.get("HUDScene") as HUDScene | undefined;
    if (hud?.dialogue) return hud.dialogue;
    return { isActive: false, show: () => {}, dismiss: () => {} };
  }

  constructor() {
    super({ key: "GameScene" });
  }

  shutdown(): void {
    this.clearIntroCinematicResources();
    if (this.cinematicActive) {
      this.cinematicActive = false;
      const body = this.player?.body as Phaser.Physics.Arcade.Body | undefined;
      body?.setEnable(true);
      this.player?.setVisible(true);
    }
    if (this.engagedDialogueNPC) {
      this.engagedDialogueNPC.disengageDialogue();
      this.engagedDialogueNPC = null;
    }
    this.lastDialoguePartner = null;
    this.lastDialoguePartnerAt = 0;
    this.player?.stopGreeting();
    this.collapseWitness = null;
    this.wasCollapsed = false;
    this.collapseRecovering = false;
    this.collapseRecoveryTimer = 0;
    this.dialogue.dismiss();
    this.aiThinkingTimer?.remove(false);
    this.aiThinkingTimer = null;

    // Abort any in-flight ambient AI bubble and clear the single-flight
    // guard. Without this, a scene restart mid-fetch (e.g. snatcher capture
    // during a 1.5s human bubble call) leaves `humanAiBubbleInFlight = true`
    // persisted on the Phaser-reused scene instance, blocking every ambient
    // AI bubble after restart until the orphaned fetch's finally runs. The
    // abort also tells AIDialogueService (via FallbackDialogueService's new
    // caller-abort-rethrow path) that the caller no longer wants this work.
    if (this.humanAiBubbleAbort) {
      this.humanAiBubbleAbort.abort();
      this.humanAiBubbleAbort = null;
    }
    this.humanAiBubbleInFlight = false;

    // Beat-5 cleanup. A scene shutdown mid-pickup could strand the player
    // invisible with a disabled body and an active input freeze, which
    // would make the next scene start unplayable. Clear all of it.
    this.cancelBeat5Decision();
    this.beat5DecisionActive = false;
    this.playerInputFrozen = false;
    if (this.player) {
      const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
      body?.setEnable(true);
      this.player.setAlpha(1);
      this.player.setVisible(true);
    }
    this.resumeCamilleEraHumans();

    // Stop music + release sound instances so a scene restart (e.g. after a
    // snatcher capture at GameScene.ts:3750) doesn't stack overlapping loops.
    this.audio?.stop();
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
    this.wasCollapsed = false;
    this.collapseWitness = null;

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
    this.audio = new AudioSystem();
    this.audio.start(this);
    this.chapterCheckTimer = 0;
    this.narrationShown = new Set();
    const scripted = new ScriptedDialogueService(CAT_DIALOGUE_SCRIPTS);
    const proxyUrl = import.meta.env.VITE_AI_PROXY_URL;
    const primary =
      import.meta.env.VITE_AI_PRIMARY === "openai" ? ("openai" as const) : ("deepseek" as const);
    const fb = import.meta.env.VITE_AI_FALLBACK;
    const secondary: "deepseek" | "openai" =
      fb === "openai" || fb === "deepseek"
        ? fb
        : primary === "deepseek"
          ? "openai"
          : "deepseek";
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
    this.camilleNPC = null;
    this.manuNPC = null;
    this.kishNPC = null;
    this.camilleEncounterActive = false;
    this.camilleRollDay = 0;
    this.snatchers = [];
    this.snatcherSpawnChecked = false;
    this.colonyCount = INITIAL_COLONY_TOTAL;

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
      StoryKeys.CAMILLE_ENCOUNTER,
      StoryKeys.CAMILLE_ENCOUNTER_DAY,
      StoryKeys.ENCOUNTER_5_COMPLETE,
      StoryKeys.DUMPING_EVENTS_SEEN,
      StoryKeys.GAME_COMPLETED,
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
    // value. Keeping field + registry in lockstep is the invariant used by
    // `spawnColonyCats`, `JournalScene`, and the decrement/increment paths.
    this.registry.set(StoryKeys.COLONY_COUNT, INITIAL_COLONY_TOTAL);

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
        // Reconcile `COLONY_COUNT` defensively. The `for ([key, val])` loop
        // above restored `save.variables` blindly, so a corrupt save (e.g. a
        // string, null, NaN, Infinity) has already overwritten the seed in
        // the registry. If we only re-write the field here, field and
        // registry drift — and `SaveSystem.save` reads the registry directly
        // on the next autosave, persisting the garbage back to disk.
        //
        // Valid numeric saves are clamped to the floor (unchanged behaviour).
        // Invalid / missing saves fall back to the fresh-game seed rather
        // than the floor, because the floor would collapse the visible
        // background roster to zero on what may otherwise be a mostly-healthy
        // save with a single corrupt field.
        const savedColony = save.variables[StoryKeys.COLONY_COUNT];
        if (typeof savedColony === "number" && Number.isFinite(savedColony)) {
          this.colonyCount = Math.max(NAMED_AND_MAMMA_COUNT, Math.floor(savedColony));
        } else {
          this.colonyCount = INITIAL_COLONY_TOTAL;
        }
        this.registry.set(StoryKeys.COLONY_COUNT, this.colonyCount);
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

    // Recovery: encounter 5 was started but narrative never completed (save/load mid-encounter).
    // Must call startCamilleEncounter to actually spawn Camille; just setting flags
    // leaves pendingCamilleEncounter orphaned with no NPC to trigger proximity.
    if (
      data?.loadSave &&
      (this.registry.get(StoryKeys.CAMILLE_ENCOUNTER) as number) >= 5 &&
      this.registry.get(StoryKeys.ENCOUNTER_5_COMPLETE) !== true
    ) {
      this.time.delayedCall(500, () => this.startCamilleEncounter(5));
    }
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
    this.generateCarTextures();

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

    const car = this.add.image(carOffscreenX, roadY, "car_closed").setDepth(4);

    this.queueIntroDelayed(4500, () => {
      this.queueIntroTween({
        targets: car,
        x: carStopX,
        duration: 2000,
        ease: "Cubic.easeOut",
      });
    });

    this.queueIntroDelayed(7000, () => {
      car.setTexture("car_open");
    });

    this.queueIntroDelayed(7500, () => {
      this.player.setPosition(carStopX - 20, roadY - 4);
      this.player.setVisible(true);
      this.player.enterForcedCrouchPose();
    });

    this.queueIntroDelayed(8500, () => {
      car.setTexture("car_closed");
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

  private generateCarTextures(): void {
    if (this.textures.exists("car_closed")) return;

    const g = this.make.graphics({ x: 0, y: 0 });

    g.fillStyle(0x2a2a3a);
    g.fillRoundedRect(0, 2, 48, 20, 3);
    g.fillStyle(0x111111);
    g.fillCircle(10, 24, 4);
    g.fillCircle(38, 24, 4);
    g.fillStyle(0x445566);
    g.fillRect(28, 4, 12, 8);
    g.generateTexture("car_closed", 48, 28);

    g.clear();
    g.fillStyle(0x2a2a3a);
    g.fillRoundedRect(0, 2, 48, 20, 3);
    g.fillStyle(0x111111);
    g.fillCircle(10, 24, 4);
    g.fillCircle(38, 24, 4);
    g.fillStyle(0x445566);
    g.fillRect(28, 4, 12, 8);
    g.fillStyle(0x2a2a3a);
    g.fillRect(22, 10, 2, 12);
    g.generateTexture("car_open", 48, 28);

    g.destroy();
  }

  update(time: number, delta: number): void {
    if (this.cinematicActive) return;

    // Release NPC from dialogue engagement if dialogue was dismissed
    if (this.engagedDialogueNPC && !this.dialogue.isActive) {
      this.engagedDialogueNPC.disengageDialogue();
      this.engagedDialogueNPC = null;
    } else if (this.engagedDialogueNPC && this.dialogue.isActive) {
      const cat = this.engagedDialogueNPC;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, cat.x, cat.y);
      const broken = dist > DIALOGUE_BREAK_DISTANCE || cat.state === "fleeing" || !cat.active;
      if (broken) {
        this.dialogue.dismiss();
        cat.disengageDialogue();
        this.engagedDialogueNPC = null;
      }
    }

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
      } else if (!this.isPaused && !this.dialogue.isActive && !this.stats.collapsed) {
        this.openJournal();
      }
      return;
    }

    if (this.isPaused) return;

    const deltaSec = delta / 1000;
    this.dayNight.update(delta);

    this.player.speedMultiplier = this.stats.speedMultiplier;

    // Collapse rising/falling-edge detection. Kept symmetrical and co-located
    // with the polling branch below so the whole collapse state machine lives
    // in one place. `onCollapsed` runs narrative side effects (narration, trust
    // penalty, registry increment, witness capture) exactly once per collapse;
    // `onRecovered` mirrors it for bookkeeping after `recoverFromCollapse()`
    // flips `stats.collapsed` back to false.
    if (this.stats.collapsed && !this.wasCollapsed) {
      this.onCollapsed();
    } else if (!this.stats.collapsed && this.wasCollapsed) {
      this.onRecovered();
    }
    this.wasCollapsed = this.stats.collapsed;

    // Collapse recovery — pins the player and drives the 3 s blackout timer.
    // Consistent with every other polled state transition in this scene; no
    // event emitter, no delayedCall, no listener lifecycle to manage.
    if (this.stats.collapsed) {
      this.player.setVelocity(0);
      if (!this.collapseRecovering) {
        this.collapseRecovering = true;
        this.collapseRecoveryTimer = 0;
      }
      this.collapseRecoveryTimer += delta;
      if (this.collapseRecoveryTimer >= COLLAPSE_RECOVERY_MS) {
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
    if (spaceJust && (this.dialogue.isActive || this.playerInputFrozen)) {
      // Play the happy meow even when the press is absorbed by the outer
      // gate (dialogue open / player frozen), so every Space tap has audio
      // feedback and the mute state is consistent across all [interact]
      // outcomes.
      this.audio.playMeow();
      if (import.meta.env.DEV) {
        // console.log (not .debug) so the diagnostic shows at Chrome's
        // "Default levels" filter — .debug maps to Verbose which is hidden
        // by default, making Space-press bugs impossible to self-diagnose.
        console.log("[interact]", {
          outcome: "space blocked at outer gate",
          dialogueActive: this.dialogue.isActive,
          frozen: this.playerInputFrozen,
        });
      }
    }
    if (spaceJust && !this.dialogue.isActive && !this.playerInputFrozen) {
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

    // ──── Z key: tap toggles catloaf, hold enters sleep ────
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const playerStationary = playerBody.velocity.length() < 1;
    const zDown = this.restKey?.isDown ?? false;
    const zJustUp = this.restKey ? Phaser.Input.Keyboard.JustUp(this.restKey) : false;
    const REST_TAP_MS = 300;

    if (
      zDown &&
      playerStationary &&
      !this.dialogue.isActive &&
      !this.player.isGreeting &&
      !this.playerInputFrozen
    ) {
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
      // Detect tap: key released quickly while stationary, not moving, no dialogue
      if (
        zJustUp &&
        this.restHoldTimer > 0 &&
        this.restHoldTimer < REST_TAP_MS &&
        playerStationary &&
        !this.dialogue.isActive &&
        !this.player.isMoving &&
        !this.player.isGreeting
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

    this.updatePlayerStationaryAnchor();

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
      this.checkCamilleProximity();
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

    const currentEncounter = (this.registry.get(StoryKeys.CAMILLE_ENCOUNTER) as number) ?? 0;
    if (currentEncounter >= 5) return;

    // One encounter per game day — check if we've already done one today
    const lastDay = (this.registry.get(StoryKeys.CAMILLE_ENCOUNTER_DAY) as number) ?? 0;
    if (lastDay >= this.dayNight.dayCount) return;

    // Roll once per evening, not every periodic check
    if (this.camilleRollDay >= this.dayNight.dayCount) return;
    this.camilleRollDay = this.dayNight.dayCount;

    // 60% chance per eligible evening (100% for first encounter)
    if (currentEncounter > 0 && Math.random() > 0.6) return;

    this.startCamilleEncounter(currentEncounter + 1);
  }

  /**
   * Check if Mamma Cat is close enough to Camille (and has line-of-sight)
   * to trigger the pending encounter narrative.
   */
  private checkCamilleProximity(): void {
    if (this.pendingCamilleEncounter === 0) return;
    if (!this.camilleNPC?.visible) return;
    if (this.dialogue.isActive) return;

    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.camilleNPC.x, this.camilleNPC.y);
    if (dist > GP.CAMILLE_ENCOUNTER_DIST) return;
    if (!this.hasLineOfSight(this.player.x, this.player.y, this.camilleNPC.x, this.camilleNPC.y)) return;

    const encounterNum = this.pendingCamilleEncounter;
    this.pendingCamilleEncounter = 0;
    this.playCamilleEncounterNarrative(encounterNum);
  }

  private cleanupCamilleNPCs(): void {
    this.kishCamilleSlowDownShown = false;
    this.cancelBeat5Decision();
    this.beat5DecisionActive = false;
    this.playerInputFrozen = false;
    for (const npc of [this.camilleNPC, this.manuNPC, this.kishNPC]) {
      if (!npc) continue;
      npc.resumeFromEncounter();
      const idx = this.humans.indexOf(npc);
      if (idx !== -1) this.humans.splice(idx, 1);
      npc.destroy();
    }
    this.camilleNPC = null;
    this.manuNPC = null;
    this.kishNPC = null;
  }

  /**
   * Pause Camille (and any nearby story humans Manu/Kish) for the duration
   * of a paired beat so they stop walking their circuits during narration.
   * Mirrors the Phase 5.1a contract: the visual speaker is fixed while the
   * modal + bubble play. Idempotent.
   */
  private pauseCamilleEraHumans(faceTargetX: number): void {
    this.camilleNPC?.pauseForEncounter(faceTargetX);
    this.manuNPC?.pauseForEncounter(faceTargetX);
    this.kishNPC?.pauseForEncounter(faceTargetX);
  }

  /** Resume any paused Camille-era humans. Safe to call when nothing is paused. */
  private resumeCamilleEraHumans(): void {
    this.camilleNPC?.resumeFromEncounter();
    this.manuNPC?.resumeFromEncounter();
    this.kishNPC?.resumeFromEncounter();
  }

  private startCamilleEncounter(encounterNum: number): void {
    this.cleanupCamilleNPCs();
    this.camilleEncounterActive = true;

    const poi = (name: string) => this.map.findObject("spawns", (o) => o.name === name);
    const underpasses = poi("spawn_blacky");
    const spawnX = (underpasses?.x ?? 411) - 50;
    const spawnY = underpasses?.y ?? 1083;

    const px = (obj: Phaser.Types.Tilemaps.TiledObject | null, fb: number) => obj?.x ?? fb;
    const py = (obj: Phaser.Types.Tilemaps.TiledObject | null, fb: number) => obj?.y ?? fb;

    const station1 = poi("poi_feeding_station_1");
    const station2 = poi("poi_feeding_station_2");
    const camilleCircuit: Array<{ x: number; y: number }> = [
      { x: spawnX, y: spawnY },
      { x: px(underpasses, 411), y: py(underpasses, 1083) },
      { x: px(poi("spawn_ginger"), 774), y: py(poi("spawn_ginger"), 1378) },
      { x: px(station1, 1000), y: py(station1, 900) },
      { x: px(poi("spawn_tiger"), 1141), y: py(poi("spawn_tiger"), 632) },
      { x: px(poi("spawn_jayco"), 1427), y: py(poi("spawn_jayco"), 484) },
      { x: px(poi("spawn_fluffy"), 1500), y: py(poi("spawn_fluffy"), 900) },
      { x: px(station2, 1600), y: py(station2, 1000) },
      { x: px(poi("spawn_pedigree"), 2500), y: py(poi("spawn_pedigree"), 1700) },
      { x: spawnX, y: spawnY },
    ];

    const camilleConfig: HumanConfig = {
      type: "camille",
      speed: 35,
      activePhases: ["evening"],
      path: camilleCircuit,
    };

    this.camilleNPC = new HumanNPC(this, camilleConfig);
    if (this.groundLayer) this.physics.add.collider(this.camilleNPC, this.groundLayer);
    if (this.objectsLayer) this.physics.add.collider(this.camilleNPC, this.objectsLayer);
    this.humans.push(this.camilleNPC);

    if (encounterNum >= 3) {
      const manuCircuit = camilleCircuit.map((wp) => ({ x: wp.x + 30, y: wp.y + 20 }));
      const manuConfig: HumanConfig = {
        type: "manu",
        speed: 35,
        activePhases: ["evening"],
        path: manuCircuit,
      };
      this.manuNPC = new HumanNPC(this, manuConfig);
      if (this.groundLayer) this.physics.add.collider(this.manuNPC, this.groundLayer);
      if (this.objectsLayer) this.physics.add.collider(this.manuNPC, this.objectsLayer);
      this.humans.push(this.manuNPC);
    }

    if (encounterNum >= 4) {
      const kishCircuit = camilleCircuit.map((wp) => ({ x: wp.x - 20, y: wp.y + 30 }));
      const kishConfig: HumanConfig = {
        type: "kish",
        speed: 50,
        activePhases: ["evening"],
        path: kishCircuit,
      };
      this.kishNPC = new HumanNPC(this, kishConfig);
      if (this.groundLayer) this.physics.add.collider(this.kishNPC, this.groundLayer);
      if (this.objectsLayer) this.physics.add.collider(this.kishNPC, this.objectsLayer);
      this.humans.push(this.kishNPC);
    }

    this.pendingCamilleEncounter = encounterNum;
  }

  /**
   * Delayed Camille beat: re-check proximity + LOS before dialogue (Phase 4.5).
   * If conditions fail, re-arm {@link pendingCamilleEncounter} for the next 5s poll.
   */
  private scheduleCamilleEncounterDialogue(delayMs: number, encounterNum: number, run: () => void): void {
    this.time.delayedCall(delayMs, () => {
      if (!this.camilleNPC?.active) {
        this.pendingCamilleEncounter = encounterNum;
        return;
      }
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.camilleNPC.x, this.camilleNPC.y);
      if (dist > GP.CAMILLE_ENCOUNTER_DIST) {
        this.pendingCamilleEncounter = encounterNum;
        return;
      }
      if (!this.hasLineOfSight(this.player.x, this.player.y, this.camilleNPC.x, this.camilleNPC.y)) {
        this.pendingCamilleEncounter = encounterNum;
        return;
      }
      if (this.dialogue.isActive) {
        this.pendingCamilleEncounter = encounterNum;
        return;
      }
      run();
    });
  }

  /**
   * Authored fallback lines + beat objectives for Camille's five encounters.
   *
   * Beat 1 and beat 5 stay scripted (pure narrator POV, plus the chapter-6
   * handoff at the end) — those beats carry crucial story weight and must
   * survive LLM failure byte-for-byte. Beats 2-4 attempt AI dialogue sourced
   * from Camille's persona with the `encounterBeat` objective; on timeout,
   * parse failure, or any network issue the `fallbackLines` array is shown
   * so the player always sees the beat.
   *
   * All registry/trust/chapter side-effects live in {@link runCamilleEncounterBeat}
   * — the LLM never controls story progression.
   */
  /**
   * Paired narrator + spoken beats for Camille's 2–4th encounters.
   * See {@link ../data/camille-encounter-beats} for the authored data
   * and pairing contract; {@link runCamilleEncounterBeat} drives it.
   */
  private readonly camilleEncounterBeats = CAMILLE_ENCOUNTER_BEATS;

  /**
   * Beat 5 split into a pre-decision phase (Camille asks) and a journey
   * phase (narration over the pickup tween). The 10-second player decision
   * window sits between them. See
   * {@link ../data/camille-encounter-beats.CAMILLE_ENCOUNTER_5_PREDECISION_STEPS}.
   */
  private readonly camilleBeat5PredecisionSteps = CAMILLE_ENCOUNTER_5_PREDECISION_STEPS;
  private readonly camilleBeat5JourneySteps = CAMILLE_ENCOUNTER_5_JOURNEY_STEPS;

  private playCamilleEncounterNarrative(encounterNum: number): void {
    const hud = this.scene.get("HUDScene") as HUDScene | undefined;
    hud?.pulseEdge(0x332200, 0.2, 2000);

    switch (encounterNum) {
      case 1:
        this.registry.set(StoryKeys.CAMILLE_ENCOUNTER, encounterNum);
        this.registry.set(StoryKeys.CAMILLE_ENCOUNTER_DAY, this.dayNight.dayCount);
        hud?.showNarration(
          "A new human. She moves differently from the others. Slowly. Gently. She smells like... kindness?",
        );
        break;

      case 2:
        this.scheduleCamilleEncounterDialogue(8000, 2, () => {
          this.runCamilleEncounterBeat(2, hud);
        });
        break;

      case 3:
        this.scheduleCamilleEncounterDialogue(10000, 3, () => {
          this.runCamilleEncounterBeat(3, hud);
        });
        break;

      case 4:
        this.scheduleCamilleEncounterDialogue(10000, 4, () => {
          this.runCamilleEncounterBeat(4, hud);
        });
        break;

      case 5:
        this.scheduleCamilleEncounterDialogue(12000, 5, () => {
          this.registry.set(StoryKeys.CAMILLE_ENCOUNTER, encounterNum);
          this.registry.set(StoryKeys.CAMILLE_ENCOUNTER_DAY, this.dayNight.dayCount);
          this.playCamilleBeat5Predecision(hud);
        });
        break;
    }
  }

  /**
   * Drive a paired narrator+spoken sequence.
   *
   * For each step:
   *  1. The narrator line appears in the modal dialogue box.
   *  2. If the step has a `spoken` line and a valid `speaker`, a
   *     persistent bubble is spawned above the speaker with that line.
   *  3. When the player presses Space, both the modal advances AND the
   *     current spoken bubble is torn down before the next step begins.
   *
   * On entry the speaker (and, when the speaker is Camille, the other
   * Camille-era humans) is frozen via `pauseForEncounter` so they stop
   * walking their circuits for the beat. Pause lifecycle is then owned
   * by the CALLER: {@link onComplete} runs with the pause still engaged,
   * and the caller decides whether to resume (a single-shot beat), hold
   * (chain into a decision window or follow-up beat), or reconfigure.
   * Early dismissals (modal closed via click/x or external `.hide()`) are
   * the only case where `playPairedBeat` itself releases the pause — via
   * its internal `onHide` fallback — because there is no caller continuation.
   *
   * `onComplete` is only invoked when the player reads through the
   * full sequence — matching the existing DialogueSystem contract.
   *
   * `onStepShown(index)` fires after the narrator line + spoken bubble for
   * step `index` are on screen. Used by the beat-5 journey phase to kick
   * off the pickup tween in lockstep with the first journey narration line.
   */
  private playPairedBeat(
    steps: ReadonlyArray<EncounterStep>,
    speaker: HumanNPC | null,
    onComplete: () => void,
    opts?: { onStepShown?: (index: number) => void },
  ): void {
    if (steps.length === 0) {
      onComplete();
      return;
    }

    if (speaker) {
      speaker.pauseForEncounter(this.player.x);
    }
    const isCamilleBeat = speaker !== null && speaker === this.camilleNPC;
    if (isCamilleBeat) {
      this.pauseCamilleEraHumans(this.player.x);
    }

    const narratorLines = steps.map((s) => s.narrator);
    let currentBubble: Phaser.GameObjects.Text | null = null;
    let completed = false;
    const clearBubble = (): void => {
      if (currentBubble) {
        currentBubble.destroy();
        currentBubble = null;
      }
    };

    this.dialogue.show(
      narratorLines,
      () => {
        completed = true;
        clearBubble();
        onComplete();
      },
      {
        onLineShown: (index: number): void => {
          clearBubble();
          const step = steps[index];
          if (step?.spoken && speaker && speaker.active && speaker.visible) {
            currentBubble = this.renderHumanBubble(speaker, step.spoken, { persistent: true });
          }
          opts?.onStepShown?.(index);
        },
        onHide: (): void => {
          clearBubble();
          // Only auto-release pause on EARLY dismiss (player closed the
          // modal before the final line). Natural completion hands control
          // to onComplete, which owns the pause lifecycle from there.
          if (!completed) {
            if (isCamilleBeat) {
              this.resumeCamilleEraHumans();
            } else if (speaker) {
              speaker.resumeFromEncounter();
            }
          }
        },
      },
    );
  }

  /**
   * Execute one of Camille's middle encounter beats (2/3/4).
   *
   * Flow:
   *  1. Pin registry side-effects *before* any async work so pause/resume
   *     doesn't re-trigger the beat.
   *  2. Play Camille's crouch animation.
   *  3. Try AI dialogue for Camille's SPOKEN lines only (beat `objective`
   *     makes this explicit). The authored narrator lines always run.
   *     AI lines replace authored spoken fallbacks positionally.
   *  4. Drive the paired narrator+spoken sequence via {@link playPairedBeat}
   *     so the narrator renders in the modal and Camille's voice renders
   *     as a floating bubble above her head.
   *  5. Apply beat-specific side-effects in `onComplete` (stats restore,
   *     emotes, HUD narration) so they run regardless of whether AI
   *     spoken lines succeeded or the scripted fallback ran.
   */
  private runCamilleEncounterBeat(n: 2 | 3 | 4, hud: HUDScene | undefined): void {
    this.registry.set(StoryKeys.CAMILLE_ENCOUNTER, n);
    this.registry.set(StoryKeys.CAMILLE_ENCOUNTER_DAY, this.dayNight.dayCount);
    this.camilleNPC?.playCrouchToward(this.player.x);

    const beat = this.camilleEncounterBeats[n];
    const onComplete = (): void => {
      switch (n) {
        case 2:
          hud?.showNarration("She watches you eat. She doesn't reach for you. She understands.");
          this.stats.restore("hunger", 30);
          break;
        case 3:
          this.emotes.show(this, this.player, "heart");
          if (this.camilleNPC) this.emotes.show(this, this.camilleNPC, "heart");
          hud?.showNarration("Something shifts between you. A thread, invisible but real.");
          break;
        case 4:
          this.emotes.show(this, this.player, "heart");
          if (this.camilleNPC) this.emotes.show(this, this.camilleNPC, "heart");
          hud?.showNarration("The small one is loud. But Camille keeps her still. She understands you.");
          break;
      }
      // Release the encounter pause so Camille (and Manu / Kish during the
      // later beats) resume their circuits. playPairedBeat now intentionally
      // leaves the pause engaged through onComplete so callers like the
      // beat-5 state machine can chain into a follow-up phase without a
      // one-frame "resume then re-pause" flicker.
      this.resumeCamilleEraHumans();
    };

    // `runBeatWith` drives a single beat render + persist pass. It is
    // called with either the AI-returned spoken lines (success path) or
    // `null` (AI failed / unavailable — scripted fallback only).
    //
    // Persistence MUST happen here rather than in
    // `requestCamilleEncounterLines` because the AI payload and the
    // merged render surface can diverge: `mergeCamilleBeatSteps` maps
    // AI lines only into authored-spoken slots (narrator-only steps stay
    // silent), drops surplus AI lines, and substitutes authored
    // fallbacks when AI lines are missing. Persisting the raw AI payload
    // would therefore misrepresent what Camille actually said to Mamma
    // Cat on screen — and future LLM calls, which condition on this
    // history, would be grounded in a fiction.
    const runBeatWith = (spokenOverrides: string[] | null): void => {
      const { steps, spokenRendered } = mergeCamilleBeatSteps(beat.steps, spokenOverrides);
      this.playPairedBeat(steps, this.camilleNPC, onComplete);
      if (spokenRendered.length > 0) {
        void this.persistCamilleBeatHistory(n, spokenRendered);
      }
    };

    void this.requestCamilleEncounterLines(n, beat.objective)
      .then((lines) => runBeatWith(lines))
      .catch(() => runBeatWith(null));
  }

  /**
   * Persist the spoken lines Camille was actually seen saying during a
   * middle encounter beat (2/3/4). Called from `runCamilleEncounterBeat`
   * after the render surface has been computed by `mergeCamilleBeatSteps`,
   * so the stored record matches what the player saw — not the raw AI
   * payload, which may be reshaped by the merge.
   *
   * Errors are swallowed: conversation history is best-effort context for
   * future LLM calls, not a source of truth, and an IDB hiccup should
   * never break a Camille beat.
   */
  private async persistCamilleBeatHistory(
    n: 2 | 3 | 4,
    spokenRendered: string[],
  ): Promise<void> {
    try {
      const snapshotTrust = this.trust.global;
      await storeConversation({
        speaker: "Camille",
        timestamp: this.dayNight.totalGameTimeMs,
        realTimestamp: Date.now(),
        gameDay: this.dayNight.dayCount,
        lines: spokenRendered,
        trustBefore: snapshotTrust,
        trustAfter: snapshotTrust,
        chapter: this.chapters.chapter,
        playerAction: `camille_encounter_${n}`,
        gameStateSnapshot: {
          trustWithSpeaker: snapshotTrust,
          trustGlobal: this.trust.global,
          timeOfDay: this.dayNight.currentPhase,
          hunger: this.stats.hunger,
          thirst: this.stats.thirst,
          energy: this.stats.energy,
        },
      });
    } catch {
      // Best-effort persistence; deliberately silent.
    }
  }

  // ──────────── Camille Beat 5 (three-phase decision gate) ────────────
  //
  // Beat 5 is the Chapter-6 handoff: Camille asks Mamma Cat to come home
  // with her, and the PLAYER must consent by walking Mamma Cat to Camille
  // and greeting her (Space) within {@link CAMILLE_BEAT5_DECISION_MS}. This
  // replaces the pre-v0.3.2 auto-pickup flow where Camille simply narrated
  // the journey regardless of player action — the new flow gives agency to
  // Mamma Cat and cleanly resolves the narrative/visual desync where
  // Camille would walk off without her.
  //
  // Phases:
  //   A: playCamilleBeat5Predecision  — paired beat, Camille asks.
  //   B: beginBeat5Decision            — 10s window, player consent gate.
  //   C: playCamilleBeat5Journey       — paired beat over pickup tween.
  //
  // On timeout Camille speaks {@link CAMILLE_BEAT5_TIMEOUT_LINE}, resumes
  // her circuit, and `pendingCamilleEncounter = 5` so the next proximity
  // poll re-arms the beat. The ENCOUNTER_5_COMPLETE registry flag is only
  // set at the end of Phase C — a timed-out beat does NOT count as done.

  /** Phase A: Camille asks. Runs first; holds the encounter pause through onComplete. */
  private playCamilleBeat5Predecision(hud: HUDScene | undefined): void {
    void hud;
    this.camilleNPC?.playCrouchToward(this.player.x);
    this.playPairedBeat(
      this.camilleBeat5PredecisionSteps,
      this.camilleNPC,
      () => this.beginBeat5Decision(),
    );
  }

  /**
   * Phase B: open the 10-second decision window. Camille stays crouched
   * (encounter pause remains engaged from Phase A), a gentle HUD narration
   * primes the player, and a heart emote floats above Camille so the ask
   * reads emotionally without embedding a heart glyph in bubble text.
   *
   * Acceptance is driven from {@link tryInteract}: the same Space-to-greet
   * action the player already knows. Timeout falls through to {@link failBeat5}.
   */
  private beginBeat5Decision(): void {
    this.beat5DecisionActive = true;
    this.cancelBeat5Decision(); // defensive: drop any stale timer
    if (this.camilleNPC) {
      this.emotes.show(this, this.camilleNPC, "heart");
      this.pauseCamilleEraHumans(this.player.x);
    }
    const hud = this.scene.get("HUDScene") as HUDScene | undefined;
    hud?.showNarration("Approach Camille and press Space to go with her.");
    this.beat5DecisionTimer = this.time.delayedCall(CAMILLE_BEAT5_DECISION_MS, () => {
      if (!this.beat5DecisionActive) return;
      this.failBeat5();
    });
  }

  /** Cancel any in-flight beat-5 decision timer. Safe to call repeatedly. */
  private cancelBeat5Decision(): void {
    if (this.beat5DecisionTimer) {
      this.beat5DecisionTimer.remove(false);
      this.beat5DecisionTimer = null;
    }
  }

  /**
   * Check whether the player has accepted beat 5 this frame. Called from
   * {@link tryInteract} when a no-target Space greet would otherwise fire.
   * Returns `true` if the greet was consumed as the beat-5 acceptance (the
   * caller should then SKIP the usual `player.startGreeting()`), `false`
   * otherwise (normal greet flow).
   */
  private tryAcceptBeat5Decision(): boolean {
    if (!this.beat5DecisionActive) return false;
    if (!this.camilleNPC || !this.camilleNPC.active || !this.camilleNPC.visible) return false;
    const dist = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.camilleNPC.x,
      this.camilleNPC.y,
    );
    if (dist > GP.CAMILLE_BEAT5_TOUCH_DIST) return false;
    this.acceptBeat5();
    return true;
  }

  /** Player accepted within the window → play the accept line, then Phase C. */
  private acceptBeat5(): void {
    this.beat5DecisionActive = false;
    this.cancelBeat5Decision();
    this.player.startGreeting();
    if (this.camilleNPC) {
      this.emotes.show(this, this.camilleNPC, "heart");
      this.emotes.show(this, this.player, "heart");
    }
    // Show Camille's acceptance line as a persistent bubble, then Phase C.
    const speaker = this.camilleNPC;
    if (!speaker) {
      // Shouldn't happen — defensive fallthrough.
      this.playCamilleBeat5Journey();
      return;
    }
    const bubble = this.renderHumanBubble(speaker, CAMILLE_BEAT5_ACCEPT_LINE, {
      persistent: true,
    });
    this.time.delayedCall(3200, () => {
      bubble?.destroy();
      this.playCamilleBeat5Journey();
    });
  }

  /** Window expired → gentle fallback, resume Camille, re-arm the beat. */
  private failBeat5(): void {
    this.beat5DecisionActive = false;
    this.cancelBeat5Decision();
    const speaker = this.camilleNPC;
    if (speaker && speaker.active && speaker.visible) {
      const bubble = this.renderHumanBubble(speaker, CAMILLE_BEAT5_TIMEOUT_LINE, {
        persistent: true,
      });
      this.time.delayedCall(2600, () => bubble?.destroy());
    }
    this.resumeCamilleEraHumans();
    // Re-arm so the next CAMILLE_ENCOUNTER_DIST proximity poll retries.
    this.pendingCamilleEncounter = 5;
  }

  /**
   * Phase C: narration over the pickup tween. The journey paired beat runs
   * two narrator-only steps in the modal; on the FIRST step shown we kick
   * off the pickup tween ({@link runBeat5Pickup}) so "The garden shrinks
   * behind you" is perfectly synchronised with Mamma Cat being lifted into
   * the carrier and Camille walking toward the underpass exit.
   */
  private playCamilleBeat5Journey(): void {
    this.playerInputFrozen = true;
    this.player.setVelocity(0);
    this.playPairedBeat(
      this.camilleBeat5JourneySteps,
      this.camilleNPC,
      () => {
        this.registry.set(StoryKeys.ENCOUNTER_5_COMPLETE, true);
        this.autoSave();
        this.startChapter6Sequence();
      },
      {
        onStepShown: (index) => {
          if (index === 0) this.runBeat5Pickup();
        },
      },
    );
  }

  /**
   * Run the "Camille picks up Mamma Cat" visual:
   *   1. Tween Mamma Cat to Camille's feet while fading out (carrier).
   *   2. Disable Mamma's physics body + hide her.
   *   3. Tween Camille off-screen toward the underpass exit (her spawn
   *      waypoint) with her walk animation.
   * All under the existing `playerInputFrozen` and `beat5PickupInProgress`
   * guards so nothing else can steer the player while this plays out.
   */
  private runBeat5Pickup(): void {
    const speaker = this.camilleNPC;
    if (!speaker) return;

    // Step 1+2: Mamma → Camille's feet, fade, hide.
    const mammaBody = this.player.body as Phaser.Physics.Arcade.Body | undefined;
    this.tweens.add({
      targets: this.player,
      x: speaker.x,
      y: speaker.y + 4,
      alpha: 0,
      duration: 900,
      ease: "Sine.easeInOut",
      onComplete: () => {
        mammaBody?.setEnable(false);
        this.player.setVisible(false);
      },
    });

    // Step 3: Camille walks off-screen toward her underpass spawn waypoint.
    // Release just Camille (not the whole Camille-era group — Manu/Kish
    // should continue their own circuits normally once the beat resolves).
    const exitTarget = speaker.config.path[0] ?? { x: speaker.x - 200, y: speaker.y };
    this.manuNPC?.resumeFromEncounter();
    this.kishNPC?.resumeFromEncounter();
    speaker.resumeFromEncounter();
    this.tweens.add({
      targets: speaker,
      x: exitTarget.x,
      y: exitTarget.y,
      duration: 3200,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        const dx = exitTarget.x - speaker.x;
        const dy = exitTarget.y - speaker.y;
        const key = speaker.humanType;
        const dir =
          Math.abs(dx) > Math.abs(dy)
            ? dx < 0
              ? "left"
              : "right"
            : dy < 0
              ? "up"
              : "down";
        if (this.anims.exists(`${key}-walk-${dir}`)) {
          speaker.anims.play(`${key}-walk-${dir}`, true);
        }
      },
      onComplete: () => {
        speaker.setVisible(false);
      },
    });
  }

  /**
   * Ask Camille's AI persona for beat-appropriate spoken lines. Returns the
   * trimmed lines on success, or `null` on any failure (the caller then
   * substitutes authored fallback text without error propagation).
   *
   * This method is intentionally SIDE-EFFECT-FREE — it does not persist
   * conversation history. Persistence happens in
   * {@link persistCamilleBeatHistory} after the caller has merged the AI
   * lines with the authored beat via {@link mergeCamilleBeatSteps}, so the
   * stored record reflects what Camille actually said on screen rather
   * than the raw AI payload (which may be reshaped or partially dropped
   * by the merge).
   */
  private async requestCamilleEncounterLines(
    n: 2 | 3 | 4,
    objective: string,
  ): Promise<string[] | null> {
    if (!(this.dialogueService instanceof FallbackDialogueService)) {
      return null;
    }
    if (!("Camille" in AI_PERSONAS)) return null;

    try {
      const history = await getRecentConversations("Camille", 20);
      const conversationHistory: ConversationEntry[] = history.map((r) => ({
        timestamp: r.timestamp,
        speaker: r.speaker,
        text: r.lines.join(" "),
      }));

      const request: DialogueRequest = {
        speaker: "Camille",
        speakerType: "human",
        target: "Mamma Cat",
        gameState: {
          chapter: this.chapters.chapter,
          timeOfDay: this.dayNight.currentPhase,
          trustGlobal: this.trust.global,
          trustWithSpeaker: this.trust.global,
          hunger: this.stats.hunger,
          thirst: this.stats.thirst,
          energy: this.stats.energy,
          daysSurvived: this.dayNight.dayCount,
          knownCats: Array.from(this.knownCats),
          recentEvents: [],
        },
        conversationHistory,
        encounterBeat: { kind: "camille_encounter", n, objective },
      };

      const response = await this.dialogueService.getDialogue(request, {
        // Engaged-style budget: encounters are modal beats, the player is
        // committed to the beat and can tolerate a longer wait than an
        // ambient bubble.
        timeoutMs: 5000,
      });

      const lines = response.lines
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      return lines.length === 0 ? null : lines;
    } catch {
      return null;
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
    );
    if (ok) {
      const hud = this.scene.get("HUDScene") as HUDScene | undefined;
      hud?.showSaveNotice?.();
    }
  }

  /**
   * Rising-edge handler for `stats.collapsed`. Fires exactly once on the frame
   * the flag transitions from false to true. All side effects are idempotent
   * enough to survive save-load (but `StatsSystem.fromJSON` also resets the
   * flag, so in practice this only fires on a genuine in-session collapse).
   */
  private onCollapsed(): void {
    // Capture the nearest friendly NPC cat (with LOS) as a witness. Stored by
    // object ref so a rename would still point to the same cat; we re-check
    // `.active` before using it in `recoverFromCollapse`.
    this.collapseWitness = this.findCollapseWitness();

    const hud = this.scene.get("HUDScene") as HUDScene | undefined;
    hud?.showNarration?.("You can't... go any further.");

    this.trust.collapsedInColony();

    // Defensive pre-increment normalisation — matches the peer counters
    // (CATS_SNATCHED, PLAYER_SNATCHED_COUNT). Treating negative, fractional,
    // or non-finite registry values as 0 prevents a corrupt value from
    // propagating forward (and then being persisted by the next autosave,
    // which reads `registry.get` directly without its own validation).
    const prior = this.registry.get(StoryKeys.COLLAPSE_COUNT);
    const priorCount =
      typeof prior === "number" && Number.isFinite(prior) && prior >= 0 ? Math.floor(prior) : 0;
    this.registry.set(StoryKeys.COLLAPSE_COUNT, priorCount + 1);
  }

  /**
   * Falling-edge handler. Currently a no-op hook; the recovery narration and
   * trust credit are emitted from `recoverFromCollapse()` itself because they
   * depend on witness range at the moment of teleport, not at the moment the
   * flag flips. Kept as a distinct symbol so the edge detection above reads
   * symmetrically and a future change (e.g. an end-of-blackout SFX cue) has an
   * obvious home.
   */
  private onRecovered(): void {
    // intentionally empty — see doc comment above.
  }

  /**
   * Find the nearest friendly NPC cat within narration-witness range that has
   * line-of-sight to the player. Returns null when no candidate qualifies.
   * Used at the moment of collapse so a friendly cat who wanders off during
   * the 3 s blackout can still be credited at recovery time.
   */
  private findCollapseWitness(): NPCCat | null {
    let nearest: NPCCat | null = null;
    let nearestDist: number = GP.NARRATION_WITNESS_DIST;
    for (const { cat } of this.npcs) {
      if (!cat.active) continue;
      if (cat.disposition !== "friendly") continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, cat.x, cat.y);
      if (dist > nearestDist) continue;
      if (!this.hasLineOfSight(this.player.x, this.player.y, cat.x, cat.y)) continue;
      nearest = cat;
      nearestDist = dist;
    }
    return nearest;
  }

  private recoverFromCollapse(): void {
    const safeSleep = this.map.findObject("spawns", (o) => o.name === "poi_safe_sleep");
    const safeX = safeSleep?.x ?? this.map.widthInPixels / 2;
    const safeY = safeSleep?.y ?? this.map.heightInPixels / 2;

    // Witness-aware recovery narration. Must be evaluated BEFORE the teleport
    // below: the intent of `witnessStillHere` is "did the witness stay close
    // to where Mamma Cat collapsed during the 3 s blackout?" If we compute the
    // distance after `setPosition(safeX, safeY)`, we measure from the safe-
    // sleep POI instead — and since the POI is a dedicated map location and
    // witnesses are ordinary colony cats scattered across the map, the range
    // check at GP.NARRATION_WITNESS_DIST (~150 px) would almost always fail
    // and the witness-aware branch would become unreachable. The player is
    // velocity-pinned for the full blackout (see the `stats.collapsed` guard
    // in update()), so `this.player.x/y` here still reflects the collapse
    // location.
    const witness = this.collapseWitness;
    const witnessStillHere =
      witness !== null &&
      witness.active &&
      Phaser.Math.Distance.Between(this.player.x, this.player.y, witness.x, witness.y) <=
        GP.NARRATION_WITNESS_DIST;

    this.player.setPosition(safeX, safeY);
    this.stats.resetCollapse();
    this.collapseRecovering = false;
    this.collapseRecoveryTimer = 0;

    this.cameras.main.flash(500, 0, 0, 0);

    const hud = this.scene.get("HUDScene") as HUDScene | undefined;
    if (witnessStillHere && witness) {
      hud?.showNarration?.(`You wake. ${witness.npcName} stayed close.`);
      this.trust.supportedDuringCollapse(witness.npcName);
      this.syncTrustDisposition(witness.npcName);
    } else {
      hud?.showNarration?.("You wake. Safer ground.");
    }

    this.collapseWitness = null;

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

      // Clear the "just spoke to" guard once the player leaves interaction
      // range OR enough time has elapsed, so coming back later naturally
      // triggers the next scripted response instead of it chaining from the
      // last one. The time branch prevents stationary Mamma from being
      // locked out of re-engaging a cat she didn't walk away from.
      if (this.lastDialoguePartner === cat) {
        const elapsedSinceChat = now - this.lastDialoguePartnerAt;
        if (dist > INTERACTION_DISTANCE || elapsedSinceChat >= GameScene.LAST_PARTNER_HOLD_MS) {
          this.lastDialoguePartner = null;
          this.lastDialoguePartnerAt = 0;
        }
      }

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

    // Visible background roster is derived from the registry's dynamic
    // `COLONY_COUNT` (total cat population), minus the named roster + Mamma
    // Cat, capped for performance/readability. On a healthy colony this
    // returns the cap (12); once enough cats have been snatched that
    // `COLONY_COUNT` drops below named+mamma+cap, the visible roster
    // shrinks in lockstep. Reads `this.colonyCount` which is kept in
    // lockstep with the registry by the seed/load/dumping/snatch paths.
    const count = computeBackgroundSpawnCount(
      this.colonyCount,
      NAMED_AND_MAMMA_COUNT,
      VISIBLE_BACKGROUND_CAP,
    );
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
      // Jogger 3 (male): clockwise perimeter loop around the park triangle.
      // Dawn + evenings only. Steers softly around other NPCs/cats (he
      // ignores cats socially but must not run through them).
      {
        type: "jogger_male",
        speed: 120,
        activePhases: ["dawn", "evening"],
        avoidanceRadius: 30,
        loopPauseSec: 5,
        path: [
          { x: 16, y: 1392 }, // tile (0,43)  — SW spawn on diagonal sidewalk
          { x: 1008, y: 432 }, // tile (31,13) — NE turn onto main N walkway
          { x: 3024, y: 432 }, // tile (94,13) — E end, turn south
          { x: 3024, y: 2480 }, // tile (94,77) — SE corner, turn west
          { x: 16, y: 2480 }, // tile (0,77)  — west-edge exit along Ayala Ave
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
   * Build feeder configs with circuit paths through cat areas.
   * Each feeder walks a circuit visiting cat locations, greeting each cat,
   * lingering at a feeding station, then exiting.
   */
  private buildFeederConfigs(): HumanConfig[] {
    const poi = (name: string) => this.map.findObject("spawns", (o) => o.name === name);
    const blacky = poi("spawn_blacky");
    const ginger = poi("spawn_ginger");
    const station1 = poi("poi_feeding_station_1");
    const station2 = poi("poi_feeding_station_2");
    const tiger = poi("spawn_tiger");
    const jayco = poi("spawn_jayco");
    const fluffy = poi("spawn_fluffy");

    const px = (obj: Phaser.Types.Tilemaps.TiledObject | null, fallback: number) => obj?.x ?? fallback;
    const py = (obj: Phaser.Types.Tilemaps.TiledObject | null, fallback: number) => obj?.y ?? fallback;

    const entryX = px(blacky, 411) - 50;
    const entryY = py(blacky, 1083);

    const feederCircuit: Array<{ x: number; y: number }> = [
      { x: entryX, y: entryY },
      { x: px(blacky, 411), y: py(blacky, 1083) },
      { x: px(ginger, 774), y: py(ginger, 1378) },
      { x: px(station1, 1000), y: py(station1, 900) },
      { x: px(tiger, 1141), y: py(tiger, 632) },
      { x: px(jayco, 1427), y: py(jayco, 484) },
      { x: px(fluffy, 1500), y: py(fluffy, 900) },
      { x: px(station2, 1600), y: py(station2, 1000) },
      { x: entryX, y: entryY },
    ];

    return [
      {
        type: "feeder",
        identityName: "Rose",
        speed: 40,
        activePhases: ["dawn", "evening"],
        lingerSec: 45,
        lingerWaypointIndex: 3,
        exitAfterLinger: false,
        path: feederCircuit,
      },
      {
        type: "feeder",
        identityName: "Ben",
        speed: 38,
        activePhases: ["dawn", "evening"],
        lingerSec: 40,
        lingerWaypointIndex: feederCircuit.length - 1 - 7,
        exitAfterLinger: false,
        path: [...feederCircuit].reverse(),
      },
    ];
  }

  /**
   * Track Mamma Cat's position to drive the per-human stationary greeting
   * cap. If she has moved more than {@link STATIONARY_MOVE_THRESHOLD_PX}
   * from the current anchor, reset every human's stationary greet counter
   * and re-anchor. While she is stationary (or asleep/resting) the counter
   * accumulates until it hits {@link STATIONARY_GREET_CAP}, at which point
   * `updateHumans` skips the ambient greeting branch until she moves again.
   *
   * Uses squared-distance to avoid a per-frame sqrt. O(humans) on threshold
   * crossings, otherwise O(1).
   */
  private updatePlayerStationaryAnchor(): void {
    const dx = this.player.x - this.playerStationaryAnchorX;
    const dy = this.player.y - this.playerStationaryAnchorY;
    const thresholdSq = STATIONARY_MOVE_THRESHOLD_PX * STATIONARY_MOVE_THRESHOLD_PX;
    if (dx * dx + dy * dy < thresholdSq) return;
    this.playerStationaryAnchorX = this.player.x;
    this.playerStationaryAnchorY = this.player.y;
    for (const human of this.humans) {
      human.resetStationaryGreet();
    }
  }

  private updateHumans(delta: number): void {
    const now = this.time.now;
    for (const human of this.humans) {
      human.setPhase(this.dayNight.currentPhase);
      human.update(delta);

      if (!human.visible) continue;

      // Humans that are paused for an encounter beat (Camille during her
      // dialogue, Manu/Kish while flanking her) must not enter the ambient
      // proximity-greeting branch — their encounter pause already sets
      // their pose, and firing a second greeting would clobber the crouch
      // animation and spawn a duplicate bubble above their head.
      if (human.isCatPerson && !human.isGreeting && !human.isEncounterPaused) {
        let greeted = false;

        // Mamma Cat proximity greeting, capped per human per stationary
        // session. See STATIONARY_GREET_CAP. The cap resets automatically
        // via `resetStationaryGreet` when Mamma moves more than
        // STATIONARY_MOVE_THRESHOLD_PX from her anchor (see
        // `updatePlayerStationaryAnchor`). The isGreeting cooldown (4-6s)
        // still prevents frame-spam during the N allowed attempts.
        const playerDist = Phaser.Math.Distance.Between(human.x, human.y, this.player.x, this.player.y);
        if (
          playerDist < GP.CAT_PERSON_PLAYER_GREET_DIST &&
          human.stationaryGreetCount < STATIONARY_GREET_CAP
        ) {
          let playerLine: string | undefined;
          if (human.humanType === "camille") {
            const enc = (this.registry.get(StoryKeys.CAMILLE_ENCOUNTER) as number) ?? 0;
            if (enc < 2) {
              playerLine = "And who are you, sweetheart?";
            }
          }
          human.startGreeting(this.player.x, this.player.y);
          human.incrementStationaryGreet();
          this.showGreetingBubble(human, { line: playerLine });
          this.emotes.show(this, human, "heart");
          this.emotes.show(this, this.player, "heart");
          greeted = true;
        }

        if (!greeted) {
          for (const { cat } of this.npcs) {
            if (cat.state === "fleeing") continue;
            const dist = Phaser.Math.Distance.Between(human.x, human.y, cat.x, cat.y);
            if (dist < GP.CAT_PERSON_GREET_DIST && !human.hasGreeted(cat)) {
              if (human.humanType === "manu" && human.shouldDeferManuGreet()) {
                human.markGreeted(cat);
                continue;
              }
              human.startGreeting(cat.x, cat.y);
              human.markGreeted(cat);
              this.showGreetingBubble(human, { nearNpcCat: cat });
              this.emotes.show(this, human, "heart");
              if (cat.state !== "sleeping") this.emotes.show(this, cat, "heart");
              break;
            }
          }
        }
      }

      if (
        !this.kishCamilleSlowDownShown &&
        this.camilleNPC &&
        this.kishNPC &&
        !this.kishNPC.isGreeting &&
        !this.camilleNPC.isEncounterPaused &&
        !this.kishNPC.isEncounterPaused &&
        Phaser.Math.Distance.Between(this.kishNPC.x, this.kishNPC.y, this.camilleNPC.x, this.camilleNPC.y) < 80
      ) {
        this.kishCamilleSlowDownShown = true;
        // Consolidated into the ambient-bubble channel so all human-spoken
        // dialogue uses the same visual surface as greetings and encounter
        // beats. Camille is the speaker; Kish just hears it.
        this.renderGreetingBubble(this.camilleNPC, "Kish, slow down.");
        this.emotes.show(this, this.camilleNPC, "curious");
      }

      // Category A: passers-through glance at nearby cats (including Mamma Cat).
      // Both female ("jogger") and male ("jogger_male") joggers behave the
      // same here: they glance, and their presence mildly alerts cats.
      const isJogger = human.humanType === "jogger" || human.humanType === "jogger_male";
      if (isJogger || human.humanType === "dogwalker") {
        let glanced = false;
        const playerDist = Phaser.Math.Distance.Between(human.x, human.y, this.player.x, this.player.y);
        if (playerDist < GP.GLANCE_DIST) {
          human.glanceAt(this.player.x, this.player.y);
          glanced = true;
        }

        if (!glanced) {
          for (const { cat } of this.npcs) {
            const dist = Phaser.Math.Distance.Between(human.x, human.y, cat.x, cat.y);
            if (dist < GP.GLANCE_DIST) {
              if (isJogger) {
                if (cat.state !== "sleeping" && cat.state !== "alert") {
                  cat.triggerAlert();
                  this.emotes.show(this, cat, "alert");
                }
              }
              human.glanceAt(cat.x, cat.y);
              break;
            }
          }
        }
      }

      // Soft steering avoidance for opted-in humans (e.g. the male jogger).
      // Runs after update() so we can bend the velocity pathing just set.
      const avoidR = human.config.avoidanceRadius ?? 0;
      if (avoidR > 0) {
        const neighbours: Array<{ x: number; y: number }> = [];
        for (const other of this.humans) {
          if (other === human || !other.visible) continue;
          neighbours.push({ x: other.x, y: other.y });
        }
        for (const { cat } of this.npcs) {
          if (!cat.visible) continue;
          neighbours.push({ x: cat.x, y: cat.y });
        }
        // Include the player so the jogger also weaves around them.
        neighbours.push({ x: this.player.x, y: this.player.y });
        human.applySteeringAvoidance(neighbours, avoidR);
      }
    }

    for (const dog of this.dogs) {
      dog.update(now, this.player, this.npcs, this.emotes, this);
    }

    // Snatcher detection during night
    if (this.dayNight.currentPhase === "night") {
      this.checkSnatcherDetection();
    }

    // Crossfade background music to the danger theme whenever any snatcher
    // exists in the park. setDanger() is idempotent, so calling it every
    // frame is cheap.
    this.audio.setDanger(this.snatchers.length > 0);

    // NPC cats flee from snatchers
    if (this.snatchers.length > 0) {
      for (const snatcher of this.snatchers) {
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

  // ──────────── Cat Person Greetings ────────────

  private readonly catPersonGreetings: Record<string, string[]> = {
    camille: ["Hi sweetie.", "Kamusta, pusa.", "There you are.", "Good girl.", "Hello, beautiful."],
    manu: ["Hey, little one.", "You're okay.", "Hi there."],
    kish: ["OMG KITTY!", "Hi hi hi!", "Look at you!", "SO CUTE!"],
    feeder: ["Hi sweetie.", "Kamusta, pusa.", "There you are.", "Good kitty."],
  };

  /**
   * Show a single greeting bubble above `human` using the best available
   * source in priority order: caller-forced line > AI persona > scripted pool.
   *
   * AI path: eligible when the human has an `identityName` registered in
   * `AI_PERSONAS`, its per-human cooldown has elapsed, no other AI bubble is
   * in flight, and no caller-forced line was passed. On success, stores the
   * exchange in `ConversationStore` keyed by the identity name so future
   * bubbles (and engaged dialogue if we ever wire humans to Space) pick up
   * prior beats. On timeout/failure, quietly falls back to the scripted pool.
   *
   * Timing: AI path uses a 1.5s budget (vs 8s for engaged cat dialogue) so
   * ambient bubbles never stall the scene. Caller's emote + greeting animation
   * fire synchronously in `updateHumans` regardless of which path is chosen.
   */
  private showGreetingBubble(human: HumanNPC, opts?: { line?: string; nearNpcCat?: NPCCat }): void {
    if (opts?.line) {
      this.renderGreetingBubble(human, opts.line);
      return;
    }

    const identity = human.identityName;
    const hasPersona = identity !== null && identity in AI_PERSONAS;
    const now = this.time.now;
    const cooldownUntil = this.humanAiBubbleCooldownUntil.get(human) ?? 0;
    const aiEligible =
      hasPersona &&
      !this.humanAiBubbleInFlight &&
      now >= cooldownUntil &&
      this.dialogueService instanceof FallbackDialogueService;

    if (aiEligible && identity !== null) {
      // Per-human cooldown is set up front (regardless of success) so a burst
      // of proximity events can't fire multiple AI calls for the same speaker.
      this.humanAiBubbleCooldownUntil.set(human, now + GameScene.HUMAN_AI_BUBBLE_COOLDOWN_MS);
      void this.requestHumanBubbleLine(human, identity, opts?.nearNpcCat).catch(() => {
        /* fallbackLine branch inside already renders scripted on failure */
      });
      return;
    }

    this.renderGreetingBubble(human, this.pickScriptedGreeting(human, opts?.nearNpcCat));
  }

  /**
   * Ask the AI service for a single ambient line and render it. Falls back to
   * a scripted line on timeout, network failure, parse failure, or if the
   * human becomes ineligible (off-screen, exited) mid-flight.
   */
  private async requestHumanBubbleLine(
    human: HumanNPC,
    speaker: string,
    nearNpcCat: NPCCat | undefined,
  ): Promise<void> {
    this.humanAiBubbleInFlight = true;
    const abort = new AbortController();
    this.humanAiBubbleAbort = abort;

    const renderFallback = (): void => {
      if (!human.active || !human.visible) return;
      this.renderGreetingBubble(human, this.pickScriptedGreeting(human, nearNpcCat));
    };

    try {
      const history = await getRecentConversations(speaker, 10);
      const conversationHistory: ConversationEntry[] = history.map((r) => ({
        timestamp: r.timestamp,
        speaker: r.speaker,
        text: r.lines.join(" "),
      }));

      const request: DialogueRequest = {
        speaker,
        speakerType: "human",
        target: "Mamma Cat",
        gameState: {
          chapter: this.chapters.chapter,
          timeOfDay: this.dayNight.currentPhase,
          trustGlobal: this.trust.global,
          trustWithSpeaker: this.trust.global,
          hunger: this.stats.hunger,
          thirst: this.stats.thirst,
          energy: this.stats.energy,
          daysSurvived: this.dayNight.dayCount,
          knownCats: Array.from(this.knownCats),
          recentEvents: [],
        },
        conversationHistory,
        nearbyCat: nearNpcCat?.npcName,
      };

      const response = await (this.dialogueService as FallbackDialogueService).getDialogue(
        request,
        { timeoutMs: GameScene.HUMAN_AI_BUBBLE_TIMEOUT_MS, signal: abort.signal },
      );

      if (abort.signal.aborted || !human.active || !human.visible) {
        return;
      }
      const line = response.lines[0]?.trim();
      if (!line) {
        renderFallback();
        return;
      }
      this.renderGreetingBubble(human, line);

      // Persist for future bubbles. Store is keyed by speaker so per-human
      // history stays consistent whether the player talks to this human via
      // bubbles or via an encounter beat.
      //
      // Persist ONLY the line we actually rendered (`line`), not the whole
      // `response.lines` payload. Ambient bubbles render a single bubble
      // above the NPC, so any additional lines in response.lines were
      // never seen by the player. Storing them would condition the next
      // LLM call on dialogue the player never heard — see the matching
      // lesson for Camille beats in WORKING_MEMORY.md.
      const snapshotTrust = this.trust.global;
      await storeConversation({
        speaker,
        timestamp: this.dayNight.totalGameTimeMs,
        realTimestamp: Date.now(),
        gameDay: this.dayNight.dayCount,
        lines: [line],
        trustBefore: snapshotTrust,
        trustAfter: snapshotTrust,
        chapter: this.chapters.chapter,
        playerAction: "ambient_greeting",
        gameStateSnapshot: {
          trustWithSpeaker: snapshotTrust,
          trustGlobal: this.trust.global,
          timeOfDay: this.dayNight.currentPhase,
          hunger: this.stats.hunger,
          thirst: this.stats.thirst,
          energy: this.stats.energy,
        },
      });
    } catch {
      renderFallback();
    } finally {
      this.humanAiBubbleInFlight = false;
      if (this.humanAiBubbleAbort === abort) this.humanAiBubbleAbort = null;
    }
  }

  /** Pick a scripted line for a human greeting, honouring Camille's per-cat overrides. */
  private pickScriptedGreeting(human: HumanNPC, nearNpcCat: NPCCat | undefined): string {
    if (nearNpcCat && human.humanType === "camille") {
      const named = this.camillePersonalLines[nearNpcCat.npcName];
      if (named?.length) {
        return named[Math.floor(Math.random() * named.length)]!;
      }
    }
    const lines = this.catPersonGreetings[human.humanType] ?? this.catPersonGreetings.feeder!;
    return lines[Math.floor(Math.random() * lines.length)]!;
  }

  /**
   * Render a floating speech bubble above `human` carrying `line`.
   *
   * All human-spoken dialogue — ambient greetings, Kish's "slow down"
   * beat, and Camille's encounter lines — renders through this single
   * helper so the game never shows more than one visual style for
   * human speech.
   *
   * Lifetime is controlled by `opts.persistent`:
   *  - `false` (default): auto-fades at ~2.5s and self-destroys; used
   *    for ambient greetings where the player keeps moving.
   *  - `true`: returns the Text GameObject and does NOT auto-destroy.
   *    The caller owns the bubble's lifetime (typically tied to an
   *    encounter beat step) and MUST `.destroy()` it when advancing
   *    or aborting. Used by the Camille encounter loop.
   */
  private renderHumanBubble(
    human: HumanNPC,
    line: string,
    opts?: { persistent?: boolean },
  ): Phaser.GameObjects.Text {
    const bubble = this.add
      .text(human.x, human.y - 30, line, {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "10px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2,
        backgroundColor: "#00000066",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(8);

    if (!opts?.persistent) {
      this.tweens.add({
        targets: bubble,
        y: human.y - 50,
        alpha: 0,
        delay: 2500,
        duration: 1000,
        onComplete: () => bubble.destroy(),
      });
    }

    return bubble;
  }

  /**
   * Back-compat wrapper for the ambient (auto-fading) bubble path.
   * Kept as a named helper so call sites read naturally at the greeting
   * sites.
   */
  private renderGreetingBubble(human: HumanNPC, line: string): void {
    this.renderHumanBubble(human, line);
  }

  /** Per-human wait between AI ambient bubbles, ms. */
  private static readonly HUMAN_AI_BUBBLE_COOLDOWN_MS = 30_000;
  /**
   * Budget for ambient bubble LLM calls, ms. Observed proxy round-trips run
   * 2000–4500 ms, so anything tighter forces almost every bubble through the
   * scripted fallback (and spams the console). 3500 ms catches the common
   * case while still well below the 8s engaged dialogue budget so a slow
   * model can't stall the scene.
   */
  private static readonly HUMAN_AI_BUBBLE_TIMEOUT_MS = 3500;

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
  private isNearMakatiAve(worldX: number, worldY: number): boolean {
    return Phaser.Math.Distance.Between(worldX, worldY, GP.MAKATI_AVE_CENTER_X, worldY) <= GP.MAKATI_AVE_WITNESS_DIST;
  }

  /** Approximate line-of-sight check by raymarching through collision tiles. */
  private hasLineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
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
  private narrateIfPerceivable(
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
    // Every Space press that reaches this handler gets a happy meow, regardless
    // of outcome (free greet, engage, alert a sleeper). JustDown gating upstream
    // guarantees this fires exactly once per key press.
    this.audio.playMeow();

    // Greeting locks the player; ignore re-presses until it finishes.
    if (this.player.isGreeting) {
      this.logInteractDiag("skipped: player mid-greeting", null, Infinity, null, Infinity);
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
      if (entry.cat === this.lastDialoguePartner) continue;
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
      if (this.tryAcceptBeat5Decision()) {
        this.logInteractDiag("consumed by Beat-5 decision", null, Infinity, nearestRawEntry, nearestRawDist);
        return;
      }
      // No cat in range — space becomes a free Mamma-Cat greeting action.
      // This is NOT proximity-gated and does NOT target any NPC: the player
      // can greet anywhere, any time. The humans' own passive proximity greet
      // loop in updateHumans() is untouched and still runs independently.
      this.logInteractDiag("free greet (no cat in range)", null, Infinity, nearestRawEntry, nearestRawDist);
      this.player.startGreeting();
      return;
    }
    const cat = nearestEntry.cat;
    if (cat.state === "sleeping") {
      this.logInteractDiag("alerted sleeping cat", nearestEntry, nearestDist, nearestRawEntry, nearestRawDist);
      cat.triggerAlert();
      return;
    }
    this.logInteractDiag("engaging dialogue", nearestEntry, nearestDist, nearestRawEntry, nearestRawDist);
    this.showCatDialogue(cat);
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
      lastPartner: this.lastDialoguePartner?.npcName ?? null,
      selected: selected ? { name: selected.cat.npcName, dist: Math.round(selectedDist) } : null,
      nearestAny: rawNearest
        ? { name: rawNearest.cat.npcName, dist: Math.round(rawNearestDist) }
        : null,
      interactDist: INTERACTION_DISTANCE,
    });
  }

  private showCatDialogue(cat: NPCCat): void {
    const name = cat.npcName;

    if (name.startsWith("Colony Cat")) {
      this.dialogue.show([getRandomColonyLine()]);
      return;
    }

    void this.requestCatDialogue(cat).catch(() => {
      /* Errors are logged and cleaned up inside requestCatDialogue */
    });
  }

  /**
   * Request dialogue from the DialogueService, show it, and process the
   * response events on completion. Conversation is stored in IndexedDB.
   */
  private async requestCatDialogue(cat: NPCCat): Promise<void> {
    if (this.dialogueRequestInFlight) return;
    this.dialogueRequestInFlight = true;
    this.aiThinkingTimer = this.time.delayedCall(400, () => {
      if (!this.dialogueRequestInFlight) return;
      this.emotes.show(this, cat, "curious");
    });

    try {
      const name = cat.npcName;
      const trustBefore = this.trust.getCatTrust(name);

      const history = await getRecentConversations(name, 20);
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

      // Revalidate after async gap: cat may have fled or another dialogue opened,
      // the player may have walked out of range, or line-of-sight may have
      // been lost (e.g. they slipped behind an obstacle). Failing any of these
      // checks means engaging would feel teleport-y, so we bail quietly.
      if (this.dialogue.isActive || cat.state === "fleeing" || !cat.active) return;
      const distToCat = Phaser.Math.Distance.Between(this.player.x, this.player.y, cat.x, cat.y);
      if (distToCat > DIALOGUE_BREAK_DISTANCE) return;
      if (!this.hasLineOfSight(this.player.x, this.player.y, cat.x, cat.y)) return;

      cat.engageDialogue(this.player.x, this.player.y, response.speakerPose);
      this.player.faceToward(cat.x, cat.y);
      this.engagedDialogueNPC = cat;

      if (response.speakerPose) {
        const poseEmote: Record<
          import("../services/DialogueService").SpeakerPose,
          import("../systems/EmoteSystem").EmoteType
        > = {
          friendly: "heart",
          hostile: "hostile",
          wary: "alert",
          curious: "curious",
          submissive: "curious",
          sleeping: "sleep",
        };
        this.emotes.show(this, cat, poseEmote[response.speakerPose]);
      }

      if (response.narration) {
        this.narrateIfPerceivable(response.narration, { x: cat.x, y: cat.y });
      }

      this.dialogue.show(response.lines, () => {
        cat.disengageDialogue();
        this.engagedDialogueNPC = null;
        this.lastDialoguePartner = cat;
        this.lastDialoguePartnerAt = this.time.now;
        this.processDialogueResponse(cat, name, trustBefore, response);
      });
    } catch (err) {
      console.error("[GameScene] requestCatDialogue failed:", err);
      cat.disengageDialogue();
      // Only clear engagement + dismiss the dialogue if WE own it. The error may
      // have fired before engageDialogue (no dialogue to dismiss), or a concurrent
      // UI path could be showing something unrelated; tearing that down would be
      // a bug.
      if (this.engagedDialogueNPC === cat) {
        this.engagedDialogueNPC = null;
        if (this.dialogue.isActive) {
          this.dialogue.dismiss();
        }
      }
      const hud = this.scene.get("HUDScene") as HUDScene | undefined;
      hud?.showNarration("Words fail. The moment passes.");
    } finally {
      this.aiThinkingTimer?.remove(false);
      this.aiThinkingTimer = null;
      this.dialogueRequestInFlight = false;
    }
  }

  /**
   * Handle all side effects from a completed dialogue:
   * trust awards, registry updates, indicator reveals, disposition
   * changes, conversation storage, and auto-saves.
   */
  private processDialogueResponse(cat: NPCCat, catName: string, trustBefore: number, response: DialogueResponse): void {
    if (response.emote) {
      this.emotes.show(this, cat, response.emote as EmoteType);
    }

    const event = response.event;
    const isFirst = event ? event.endsWith("_first") : false;

    if (event) {
      if (isFirst) {
        this.addKnownCat(catName);
        this.npcs.find((e) => e.cat === cat)?.indicator.reveal();
        this.awardFirstConversation(catName);
      } else if (event.endsWith("_return") || event.endsWith("_warmup")) {
        this.awardReturnConversation(catName);
      }

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
    }

    // Persist after trust awards so trustAfter matches gameplay state.
    void storeConversation({
      speaker: catName,
      timestamp: this.dayNight.totalGameTimeMs,
      realTimestamp: Date.now(),
      gameDay: this.dayNight.dayCount,
      lines: response.lines,
      trustBefore,
      trustAfter: this.trust.getCatTrust(catName),
      chapter: this.chapters.chapter,
      gameStateSnapshot: {
        trustWithSpeaker: this.trust.getCatTrust(catName),
        trustGlobal: this.trust.global,
        timeOfDay: this.dayNight.currentPhase,
        hunger: this.stats.hunger,
        thirst: this.stats.thirst,
        energy: this.stats.energy,
      },
    });

    if (isFirst) {
      this.autoSave();
    }
  }

  // ──────────── Snatchers (Task 4) ────────────

  private checkSnatcherSpawn(): void {
    const action = resolveSnatcherSpawnAction({
      isNight: this.dayNight.currentPhase === "night",
      snatcherSpawnChecked: this.snatcherSpawnChecked,
      firstSnatcherSeen: this.registry.get(StoryKeys.FIRST_SNATCHER_SEEN) as boolean | undefined,
      chapter: this.chapters.chapter,
      isResting: this.player.isResting,
      isNearShelter: this.isNearShelter(this.player.x, this.player.y),
    });

    if (action.type === "not_night") {
      this.snatcherSpawnChecked = false;
      this.despawnSnatchers();
      return;
    }
    if (action.type === "already_checked") return;
    if (action.type === "defer_first_sighting") return;

    if (action.type === "first_sighting") {
      this.snatcherSpawnChecked = true;
      this.playFirstSnatcherSighting();
      return;
    }

    this.snatcherSpawnChecked = true;
    if (Math.random() > 0.4) return;
    const snatcherCount = 1 + (Math.random() > 0.5 ? 1 : 0);
    for (let i = 0; i < snatcherCount; i++) {
      this.spawnSnatcher(i);
    }
  }

  /**
   * The first snatcher sighting is scripted: a snatcher walks into view,
   * nearby NPC cats flee visibly, then narration fires.
   *
   * All player-facing effects (edge pulse, narration) and the persistent
   * `FIRST_SNATCHER_SEEN` flag fire only once the player passes the
   * proximity + LOS gate below. If any of them fired up-front, a player
   * who is awake but across the map (or behind an obstacle) would either
   * see a mysterious red screen pulse with no visible cause (Phase 4.5
   * "effects only fire when Mamma Cat can perceive the source") or
   * silently burn their scripted first sighting — on subsequent nights
   * `firstEligible` would be false and `resolveSnatcherSpawnAction` would
   * return `random_spawn`, so the narrative beat would never play for
   * that save. Shelter-rest players are handled earlier via
   * `defer_first_sighting`.
   */
  private playFirstSnatcherSighting(): void {
    this.spawnSnatcher(0, true);

    const snatcher = this.snatchers[0];
    if (!snatcher) return;

    this.time.delayedCall(2000, () => {
      for (const { cat } of this.npcs) {
        if (cat.state === "sleeping") continue;
        const dist = Phaser.Math.Distance.Between(snatcher.x, snatcher.y, cat.x, cat.y);
        if (dist < GP.SNATCHER_WITNESS_DIST) {
          this.emotes.show(this, cat, "alert");
          cat.triggerFlee(snatcher.x, snatcher.y);
        }
      }

      this.time.delayedCall(1000, () => {
        // Gate the full player-facing beat — edge pulse, narration, and the
        // persistent "seen" flag — behind the same proximity + LOS check used
        // elsewhere for snatcher sightings (see spawnSnatcher). Without it,
        // distant players get a "you see the cats run" line AND a mysterious
        // red screen pulse for an event they cannot perceive. Matches the
        // Phase 4.5 convention followed by `playCamilleEncounterNarrative`
        // (gated upstream by `checkCamilleProximity`) and `playDumpingSequence`
        // (gated upstream by `isNearMakatiAve`).
        if (!snatcher.active) return;
        const near =
          Phaser.Math.Distance.Between(this.player.x, this.player.y, snatcher.x, snatcher.y) <=
          GP.SNATCHER_WITNESS_DIST;
        const los = this.hasLineOfSight(this.player.x, this.player.y, snatcher.x, snatcher.y);
        if (!near || !los) return;
        const hud = this.scene.get("HUDScene") as HUDScene | undefined;
        hud?.pulseEdge(0x220000, 0.35, 3000);
        hud?.showNarration("Something moves in the dark. The other cats run. You should too.");
        // Only persist the "seen" flag once the player has actually perceived
        // the scripted beat. Missed first sightings retry on the next eligible
        // night instead of locking the save into random-spawn mode forever.
        this.registry.set(StoryKeys.FIRST_SNATCHER_SEEN, true);
      });
    });
  }

  private spawnSnatcher(index: number, silent = false): void {
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
      type: "snatcher",
      speed: 20,
      activePhases: ["night"],
      path,
    };
    const snatcher = new HumanNPC(this, config);
    snatcher.setTint(0x000000);
    if (this.groundLayer) this.physics.add.collider(snatcher, this.groundLayer);
    if (this.objectsLayer) this.physics.add.collider(snatcher, this.objectsLayer);
    this.snatchers.push(snatcher);
    this.humans.push(snatcher);

    if (!silent) {
      const hud = this.scene.get("HUDScene") as HUDScene | undefined;
      const near =
        Phaser.Math.Distance.Between(this.player.x, this.player.y, snatcher.x, snatcher.y) <= GP.SNATCHER_WITNESS_DIST;
      const los = this.hasLineOfSight(this.player.x, this.player.y, snatcher.x, snatcher.y);
      if (near && los) {
        hud?.showNarration("Something moves in the dark...");
      }
    }
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
   * Check if a snatcher has detected and caught Mamma Cat, and sweep for
   * colony cats (named or unnamed) that wandered into grab range. Called
   * from updateHumans during night phase.
   *
   * Eligibility rules (mirror Mamma Cat's shelter-immunity rule):
   *   - Cat must be `active`.
   *   - Cats sleeping *near a shelter POI* are immune (didn't get ambushed;
   *     the narrative "safe sleeping spot" protection that Mamma Cat also
   *     enjoys). Cats sleeping anywhere else are vulnerable — this is the
   *     "didn't wake from rest in time" case.
   *   - Named cats (Blacky, Tiger, Jayco, etc.) are NOT automatically immune.
   *     They are less often caught because they mostly stay inside their home
   *     zones near shelter, but a named cat caught napping in the wrong spot
   *     can be taken. The `COLONY_COUNT` floor (`NAMED_AND_MAMMA_COUNT`)
   *     prevents total narrative annihilation; geography keeps named-cat
   *     snatches rare in practice.
   *
   * KNOWN LIMITATION: named-cat snatches remove the live entity within the
   * current session (destroy + splice from `this.npcs`) and decrement
   * `COLONY_COUNT`, but the next scene boot (player capture reload or fresh
   * `create()`) unconditionally re-runs the named spawn list and brings the
   * cat back visually while the counter stays decremented. Tracking
   * persistently-removed named cats needs a dedicated registry list + spawn
   * guards + chapter-progression review (e.g. `JAYCO_TALKS` gating); see
   * WORKING_MEMORY.md "Follow-ups" for the proposed shape.
   */
  private checkSnatcherDetection(): void {
    if (this.snatchers.length === 0) return;

    // Collect colony-cat victims during the sweep, then apply removals after
    // the nested loop so we don't splice `this.npcs` mid-iteration.
    const colonyVictims: NPCCat[] = [];
    const PLAYER_CAPTURE_RANGE = 16;
    const COLONY_CAT_CAPTURE_RANGE = 16;

    for (const snatcher of this.snatchers) {
      if (!snatcher.visible) continue;

      for (const { cat } of this.npcs) {
        if (!cat.active) continue;
        // Sleeping near shelter = sheltered (mirrors the player rule below).
        // Sleeping elsewhere remains eligible — "didn't wake in time".
        if (cat.state === "sleeping" && this.isNearShelter(cat.x, cat.y)) continue;
        if (colonyVictims.includes(cat)) continue;
        const catDist = Phaser.Math.Distance.Between(snatcher.x, snatcher.y, cat.x, cat.y);
        if (catDist < COLONY_CAT_CAPTURE_RANGE) {
          colonyVictims.push(cat);
        }
      }

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

        if (dist < PLAYER_CAPTURE_RANGE) {
          // Apply any pending colony captures before the scene restart so
          // the counter bump reaches the save file alongside the player's.
          for (const victim of colonyVictims) this.handleColonyCatSnatch(victim);
          this.handleSnatcherCapture();
          return;
        }
      }
    }

    for (const victim of colonyVictims) this.handleColonyCatSnatch(victim);
  }

  /**
   * Remove a colony cat that a snatcher caught (named or unnamed), increment
   * the lifetime `CATS_SNATCHED` counter, decrement the dynamic
   * `COLONY_COUNT` total (clamped at `NAMED_AND_MAMMA_COUNT`), and narrate
   * only if the player could actually perceive the event (proximity +
   * line-of-sight, matching the Phase 4.5 witness-gate convention used
   * elsewhere for snatcher beats). Unperceived captures happen silently —
   * the cat is simply gone next time the player looks.
   *
   * Named cats: within-session removal is effective (entity destroyed,
   * spliced from `this.npcs`). Cross-session persistence is NOT yet
   * implemented — see the comment on `checkSnatcherDetection` and the
   * "Follow-ups" block in WORKING_MEMORY.md.
   */
  private handleColonyCatSnatch(cat: NPCCat): void {
    const near =
      Phaser.Math.Distance.Between(this.player.x, this.player.y, cat.x, cat.y) <= GP.SNATCHER_WITNESS_DIST;
    const los = near && this.hasLineOfSight(this.player.x, this.player.y, cat.x, cat.y);

    const idx = this.npcs.findIndex((entry) => entry.cat === cat);
    if (idx !== -1) {
      const entry = this.npcs[idx]!;
      this.npcs.splice(idx, 1);
      entry.indicator.destroy();
      entry.cat.destroy();
    } else {
      cat.destroy();
    }

    // Defensive clear of the dialogue-chaining guard (see WORKING_MEMORY
    // "Input Guards — Dialogue State"). Colony cats don't normally engage
    // dialogue, but named cats do — and a rare named-cat snatch while the
    // player is mid-dialogue with that cat would otherwise leave a stale
    // partner pointer.
    if (this.lastDialoguePartner === cat) {
      this.lastDialoguePartner = null;
      this.lastDialoguePartnerAt = 0;
    }

    const prev = this.registry.get(StoryKeys.CATS_SNATCHED);
    const prevCount = typeof prev === "number" && Number.isFinite(prev) && prev >= 0 ? Math.floor(prev) : 0;
    this.registry.set(StoryKeys.CATS_SNATCHED, prevCount + 1);

    // Decrement the dynamic colony total, clamped at the named+Mamma floor
    // so the colony can't be narratively counted out. Keep the field and
    // registry in lockstep (the field is the cache used by the dumping
    // path and `spawnColonyCats`).
    this.colonyCount = decrementColonyTotal(this.colonyCount, NAMED_AND_MAMMA_COUNT);
    this.registry.set(StoryKeys.COLONY_COUNT, this.colonyCount);

    if (near && los) {
      const hud = this.scene.get("HUDScene") as HUDScene | undefined;
      hud?.showNarration("A cat was here. Now it's gone.");
    }
  }

  private handleSnatcherCapture(): void {
    // Increment the lifetime capture counter and persist it *before* the
    // scene restart. `snatcherCapture` reloads via `SaveSystem.load()` which
    // overwrites in-memory registry state from localStorage, so a mere
    // `registry.set` here would be discarded on reload. Saving first ensures
    // the new value is in the save payload when it's read back.
    const prev = this.registry.get(StoryKeys.PLAYER_SNATCHED_COUNT);
    const prevCount = typeof prev === "number" && Number.isFinite(prev) && prev >= 0 ? Math.floor(prev) : 0;
    this.registry.set(StoryKeys.PLAYER_SNATCHED_COUNT, prevCount + 1);
    this.autoSave();

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
   * Arm dumping events based on chapter thresholds.
   * The event only triggers when Mamma Cat is near the Makati Ave road.
   */
  private checkColonyDynamics(): void {
    if (this.dialogue.isActive || this.dumpingInProgress) return;
    const dumpingSeen = (this.registry.get(StoryKeys.DUMPING_EVENTS_SEEN) as number) ?? 0;
    const chapter = this.chapters.chapter;

    if (this.dumpingArmed === 0) {
      if (dumpingSeen === 0 && chapter >= 2) this.dumpingArmed = 1;
      else if (dumpingSeen === 1 && chapter >= 3) this.dumpingArmed = 2;
      else if (dumpingSeen === 2 && chapter >= 4) this.dumpingArmed = 3;
    }

    if (this.dumpingArmed > 0 && this.dumpingArmed === dumpingSeen + 1) {
      if (this.isNearMakatiAve(this.player.x, this.player.y)) {
        this.playDumpingSequence(this.dumpingArmed);
        this.dumpingArmed = 0;
      }
    }
  }

  /**
   * Play a visible dumping event: car drives up, door opens, cat placed,
   * car leaves, then narration fires because Mamma Cat witnessed it.
   *
   * `DUMPING_EVENTS_SEEN` and the colony count are persisted only inside
   * `showDumpingNarration`'s witness gate below. The sequence runs for
   * ~5s, and `MAKATI_AVE_WITNESS_DIST` is only 300px — a player who
   * wanders off mid-animation would otherwise burn a scripted progression
   * slot (and receive a modal "you witnessed a dumping" dialogue out of
   * thin air). Persisting at reveal means a missed dumping simply re-arms
   * on the next approach via `checkColonyDynamics`. Trade-off: the
   * dumped colony cat added mid-sequence stays in the world even on a
   * miss, so a subsequent successful retry adds a second cat for the
   * same event slot. Bounded (3 dumping events total) and requires
   * deliberate walk-away-then-return play; accepted as a minor artefact.
   */
  private playDumpingSequence(eventNum: number): void {
    this.dumpingInProgress = true;
    this.generateCarTextures();

    const hud = this.scene.get("HUDScene") as HUDScene | undefined;
    hud?.pulseEdge(0x221100, 0.3, 2500);

    const MAKATI_AVE_X = 2800;
    const roadX = MAKATI_AVE_X;
    const roadY = Math.min(Math.max(this.player.y, 400), 1900);
    const carStartX = roadX + 400;

    const car = this.add.image(carStartX, roadY, "car_closed").setDepth(4);

    this.tweens.add({
      targets: car,
      x: roadX,
      duration: 2000,
      ease: "Cubic.easeOut",
      onComplete: () => {
        car.setTexture("car_open");
        this.time.delayedCall(500, () => {
          const dumpedCat = this.addBackgroundCat(roadX - 20, roadY - 4);
          if (dumpedCat) dumpedCat.setAlpha(0.9);

          this.time.delayedCall(500, () => {
            car.setTexture("car_closed");
            this.time.delayedCall(300, () => {
              this.tweens.add({
                targets: car,
                x: carStartX + 200,
                duration: 2500,
                ease: "Cubic.easeIn",
                onComplete: () => car.destroy(),
              });

              this.time.delayedCall(1500, () => {
                this.showDumpingNarration(eventNum, dumpedCat);
              });
            });
          });
        });
      },
    });
  }

  /**
   * Reveal/completion handler. Re-checks proximity + LOS against the
   * dumped cat because the trigger-time `isNearMakatiAve` check is ~5s
   * stale by now. Only persists `DUMPING_EVENTS_SEEN` / `COLONY_COUNT`
   * and fires narration when the player is actually positioned to
   * witness the event; otherwise the slot re-arms on the next approach.
   */
  private showDumpingNarration(eventNum: number, source: NPCCat | null): void {
    this.dumpingInProgress = false;

    const witnessed =
      !!source &&
      source.active &&
      this.isNearMakatiAve(this.player.x, this.player.y) &&
      this.hasLineOfSight(this.player.x, this.player.y, source.x, source.y);
    if (!witnessed) return;

    this.registry.set(StoryKeys.DUMPING_EVENTS_SEEN, eventNum);
    const hud = this.scene.get("HUDScene") as HUDScene | undefined;
    this.colonyCount++;
    this.registry.set(StoryKeys.COLONY_COUNT, this.colonyCount);

    switch (eventNum) {
      case 1:
        this.dialogue.show(["A car. A door. A cat.", "You remember."], () => {
          hud?.showNarration("A new cat has appeared in the gardens.");
        });
        break;
      case 2:
        this.dialogue.show([
          "This one wasn't thrown away. This one was... left.",
          "With love, and grief, and no choice.",
          "You sit beside her. You don't speak. There's nothing to say.",
        ]);
        break;
      case 3:
        this.dialogue.show(["Another one. How many of us started this way?"]);
        break;
    }
  }

  /**
   * Spawn an additional background colony cat.
   * Optional position for dumping event placement near the road.
   */
  private addBackgroundCat(atX?: number, atY?: number): NPCCat {
    const sprites = ["mammacat", "blacky", "tiger", "jayco", "fluffy"];
    const sprite = sprites[Math.floor(Math.random() * sprites.length)]!;
    const x = atX ?? 600 + Math.random() * 200;
    const y = atY ?? 1100 + Math.random() * 200;

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
    return cat;
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
