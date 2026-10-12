import Phaser from "phaser";
import type { GameScene } from "../scenes/GameScene";
import type { HUDScene } from "../scenes/HUDScene";
import { HumanNPC, type HumanConfig } from "../sprites/HumanNPC";
import { kishProfileForDay } from "../sprites/SpriteProfiles";
import { StoryKeys } from "../registry/storyKeys";
import { GP, CAMILLE_ARRIVAL_SHOT_HOLD_MS, CAMILLE_BEAT5_DECISION_MS } from "../config/gameplayConstants";
import { AI_PERSONAS } from "../ai/personas";
import { FallbackDialogueService } from "../services/FallbackDialogueService";
import type { DialogueRequest, DialogueResponse } from "../services/DialogueService";
import { loadNpcContext } from "../services/NpcContext";
import { buildCamilleEraCareRoutes, canAdoptAmbientCareGroup } from "../utils/camilleCareRoute";
import {
  CAMILLE_ENCOUNTER_BEATS,
  CAMILLE_ENCOUNTER_MEMORY,
  CAMILLE_ENCOUNTER_5_PREDECISION_STEPS,
  CAMILLE_ENCOUNTER_5_JOURNEY_STEPS,
  CAMILLE_BEAT5_ACCEPT_LINE,
  CAMILLE_BEAT5_TIMEOUT_LINE,
  beatSpokenSlots,
  mergeCamilleBeatSteps,
  type EncounterStep,
} from "../data/camille-encounter-beats";

/** The 32 px pet carrier drawn about 45 cm long beside Camille. */
const CARRIER_SCALE = 0.3;

/** What the AI added to a beat: Camille's spoken lines and, optionally, her impression of Mamma Cat. */
type EncounterReply = Pick<DialogueResponse, "lines" | "memoryNote">;

/**
 * Owns the entire Chapter-5 Camille encounter flow: ambient care-route
 * visits, the five scripted encounter beats (with AI-assisted middle
 * beats 2–4), the Beat-5 three-phase consent gate (pre-decision → 10s
 * player window → journey tween), Camille-era human lifecycle
 * (Camille / Manu / Kish), the Kish-slow-down ambient bubble, and the
 * last visit's pet carrier and arrival shot. Between the yes and the
 * journey, the Complete Colony Gathering may play
 * ({@link EasterEggSystem.gatherForFarewell}).
 *
 * Call sites on {@link GameScene}:
 *   - `checkEncounter()` + `checkProximity()` are polled from the 5s
 *     chapter-check block.
 *   - `trySpawnAmbientDawnVisit()` is polled from `update()` each frame
 *     (gated internally by phase + registry per-day limits).
 *   - `update()` runs each frame: the encounter-5 pet carrier follows
 *     Camille, and her arrival shot ({@link GameScene.storyShot}) plays
 *     once the moment is calm.
 *   - `flushTeardown()` runs once per `updateHumans` tick after the
 *     human iteration completes (avoids splicing mid-iter).
 *   - `tryRunKishSlowDownBeat()` is folded into `updateHumans` where the
 *     old ambient block lived.
 *   - `tryAcceptBeat5Decision()` is the single interact-time entry
 *     point that `GameScene.tryInteract` calls BEFORE its Mamma-Cat
 *     greeting fallback (Phase 5.1b routing order).
 *   - `startEncounter(n)` is called from `create()` for the save-mid-
 *     encounter-5 recovery path.
 *   - `shutdownCamilleState()` releases `playerInputFrozen` + tears
 *     down NPCs on scene SHUTDOWN.
 *
 * Invariants preserved from WORKING_MEMORY:
 *   - Paired-beat pause/resume is caller-owned across `onComplete`
 *     (Phase 5.1b): natural completion does NOT auto-resume so the
 *     beat-5 state machine can chain into the decision window without
 *     a one-frame flicker.
 *   - Phase 4.5 witness gate (proximity + LOS) re-checked at the
 *     reveal site, not just the arming site.
 *   - Beat-5 cleanup on shutdown: input frozen flag released, body
 *     enabled, alpha + visibility restored on the player so the next
 *     scene start is playable.
 *   - Conversation history persists the spoken lines whose bubble
 *     actually rendered, not the raw AI payload (WORKING_MEMORY 5.1a lesson).
 */

/**
 * Normalise a persisted registry value that must be a non-negative integer
 * count or day index. All encounter/ambient-day registry keys
 * ({@link StoryKeys.CAMILLE_ENCOUNTER}, `_DAY`, `AMBIENT_*_DAY`) are saved
 * through {@link SaveSystem} and restored on load, so a corrupt save, a
 * hand-edited LocalStorage entry, or a future save-schema change can inject
 * NaN, a fractional number, a negative, a string, or `undefined`. The whole
 * encounter ladder (comparisons, branching, `Math.min(currentEncounter + 1, 5)`
 * arithmetic) assumes a finite non-negative integer, so we fall back to 0 on
 * anything else. Matches the normalisation pattern used in `SnatcherSystem`,
 * `CollapseSystem`, and `ColonyDynamicsSystem`.
 */
function readCount(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
}

export class CamilleEncounterSystem {
  private readonly scene: GameScene;

  private camilleNPC: HumanNPC | null = null;
  private manuNPC: HumanNPC | null = null;
  private kishNPC: HumanNPC | null = null;
  private encounterActive = false;
  private rollDay = 0;
  private eraParkExitCount = 0;
  private eraParkExitTarget = 1;
  private eraTeardownPending = false;
  private pendingEncounter = 0;
  private beat5DecisionActive = false;
  private beat5DecisionTimer: Phaser.Time.TimerEvent | null = null;
  /** From Mamma Cat's yes until the scene ends: the farewell and the journey home. */
  private leaving = false;
  /** The pet carrier Camille brings to the last encounter: in her hand, or set down while she crouches. */
  private carrier: Phaser.GameObjects.Image | null = null;
  private carrierSide = 1;
  /** Encounter 5: the camera still owes Mamma Cat a look at Camille walking in with the carrier. */
  private arrivalShotDue = false;
  private arrivalShotActive = false;
  private kishSlowDownShown = false;
  /** The 8–12 s wait between reaching Camille and her beat (see {@link scheduleEncounterDialogue}). */
  private beatDelay: Phaser.Time.TimerEvent | null = null;
  /**
   * Cancellation token for the in-flight `requestEncounterLines` LLM call.
   * Mirrors `CatDialogueController.requestAbort` /
   * `HumanPresenceSystem.humanAiBubbleAbort`. Aborted by
   * {@link cancelStagedBeat} on shutdown and teardown; the
   * `runEncounterBeat` orchestrator checks `signal.aborted` before calling
   * `playPairedBeat` so an orphaned `.then` cannot render dialogue on a
   * torn-down scene.
   */
  private encounterRequestAbort: AbortController | null = null;

  /**
   * Paired narrator + spoken beats for Camille's 2–4th encounters.
   * See {@link ../data/camille-encounter-beats} for the authored data
   * and pairing contract; {@link runEncounterBeat} drives it.
   */
  private readonly beats = CAMILLE_ENCOUNTER_BEATS;
  private readonly beat5PredecisionSteps = CAMILLE_ENCOUNTER_5_PREDECISION_STEPS;
  private readonly beat5JourneySteps = CAMILLE_ENCOUNTER_5_JOURNEY_STEPS;

  /** Camille lines when she recognises a named colony cat (Phase 4.5). */
  private readonly personalLines: Record<string, string[]> = {
    Blacky: ["Blacky, you handsome boy.", "Hey, Blacky.", "There's my boy."],
    Tiger: ["Tiger, not hissing today?", "Hi, Tiger.", "Easy, Tiger."],
    Jayco: ["Jayco. Good to see you.", "Hey, Jayco."],
    "Jayco Jr": ["Hey, little one.", "Jayco Jr — you're getting big."],
    Fluffy: ["Fluffy. Waiting for Manu?", "Hi, Fluffy."],
    Pedigree: ["Well, look at you.", "Hello, beautiful."],
    Ginger: ["Ginger. Hey, sweetie.", "Hi, Ginger."],
    "Ginger B": ["There you are, Ginger B.", "Hey, you."],
  };

  constructor(scene: GameScene) {
    this.scene = scene;
  }

  get isEncounterActive(): boolean {
    return this.encounterActive;
  }

  /** Mamma Cat said yes: nothing may take her (or the screen) until she's gone home. */
  get isLeavingWithCamille(): boolean {
    return this.leaving;
  }

  get activeCamilleNPC(): HumanNPC | null {
    return this.camilleNPC;
  }

  get activeKishNPC(): HumanNPC | null {
    return this.kishNPC;
  }

  /**
   * Camille's group keeps its ambient greetings back while a beat is staged
   * (its delay or its AI request), so nothing talks over the beat's opening.
   * Greetings to Mamma Cat wait from the moment the beat is armed: one on her
   * approach would land seconds before the beat and pre-empt its first line.
   */
  holdsGreetingFrom(human: HumanNPC, toMammaCat: boolean): boolean {
    const held =
      this.beatDelay !== null || this.encounterRequestAbort !== null || (toMammaCat && this.pendingEncounter !== 0);
    return held && (human === this.camilleNPC || human === this.manuNPC || human === this.kishNPC);
  }

  /** Accessed by {@link GameScene.pickScriptedGreeting}; stays owned here. */
  getPersonalLineForNamedCat(catName: string): string | null {
    const lines = this.personalLines[catName];
    if (!lines?.length) return null;
    return lines[Math.floor(Math.random() * lines.length)]!;
  }

  /**
   * Reset all transient state to a clean slate. Called from
   * {@link GameScene.create} after `new CamilleEncounterSystem(...)` so a
   * scene restart (e.g. post-snatcher capture) never inherits stale refs,
   * a pending encounter, an armed Beat-5 timer, or the Kish slow-down
   * latch. Idempotent and cheap; safe to call repeatedly.
   */
  resetTransient(): void {
    this.camilleNPC = null;
    this.manuNPC = null;
    this.kishNPC = null;
    this.encounterActive = false;
    this.rollDay = 0;
    this.eraParkExitCount = 0;
    this.eraParkExitTarget = 1;
    this.eraTeardownPending = false;
    this.pendingEncounter = 0;
    this.beat5DecisionActive = false;
    if (this.beat5DecisionTimer) {
      this.beat5DecisionTimer.remove(false);
      this.beat5DecisionTimer = null;
    }
    this.cancelStagedBeat();
    this.kishSlowDownShown = false;
    this.leaving = false;
    this.carrier = null; // the old scene destroyed it
    this.arrivalShotDue = false;
    this.arrivalShotActive = false;
  }

  /**
   * Drive the 5s periodic check: roll for a scripted encounter if
   * eligible, otherwise poll the pending encounter's proximity gate.
   * Called from the chapter-check block in {@link GameScene.update}.
   */
  tick(): void {
    this.checkEncounter();
    this.checkProximity();
  }

  /** Each frame: the carrier keeps to Camille, and her arrival is shown once the moment allows. */
  update(): void {
    this.followCarrier();
    if (this.arrivalShotDue) this.tryArrivalShot();
  }

  /**
   * Alias of {@link tryRunKishSlowDownBeat} so the scene's one-liner reads
   * `this.camille.tryPlayKishSlowDownBeat()` symmetrically with other
   * `tryPlay...` entry points (e.g. `tryPlayFirstSnatcherSighting`).
   * Implementation stays in `tryRunKishSlowDownBeat` to keep the existing
   * internal references (including unit-test scraping patterns) stable.
   */
  tryPlayKishSlowDownBeat(): void {
    this.tryRunKishSlowDownBeat();
  }

  /**
   * Chain-fired from `GameScene.shutdown()` (Phaser does not auto-invoke
   * system `shutdown()`; see WORKING_MEMORY "Scene Lifecycle — shutdown
   * is NOT auto-wired"). Mirrors {@link shutdownCamilleState} — we
   * explicitly stop any Beat-5 timer, resume paused Camille-era humans
   * so a restart doesn't strand them in `isEncounterPaused`, and clear
   * all transient state.
   */
  shutdown(): void {
    this.shutdownCamilleState();
  }

  /**
   * Check if conditions are met to spawn a Camille encounter this evening.
   * Called from the 5s chapter-check block in {@link GameScene.update}.
   */
  checkEncounter(): void {
    const scene = this.scene;
    if (!scene.map || !scene.dayNight || !scene.chapters || scene.chapters.chapter < 5) return;
    if (scene.dayNight.currentPhase !== "evening") {
      this.encounterActive = false;
      return;
    }
    if (this.encounterActive) return;

    const currentEncounter = readCount(scene.registry.get(StoryKeys.CAMILLE_ENCOUNTER));
    const encounter5Complete = scene.registry.get(StoryKeys.ENCOUNTER_5_COMPLETE) === true;
    const awaitingEncounter5Completion = currentEncounter >= 5 && !encounter5Complete;
    if (currentEncounter >= 5) {
      if (encounter5Complete) {
        this.trySpawnAmbientEveningVisit();
        return;
      }
    }

    const lastDay = readCount(scene.registry.get(StoryKeys.CAMILLE_ENCOUNTER_DAY));
    if (lastDay >= scene.dayNight.dayCount) return;

    if (this.rollDay >= scene.dayNight.dayCount) {
      if (!awaitingEncounter5Completion) this.trySpawnAmbientEveningVisit();
      return;
    }
    // The last visit is a fresh spawn at the underpass: wait (without using up
    // the roll) rather than delete a care visit in front of Mamma Cat.
    if (currentEncounter >= 4 && this.eraGroupInView()) return;
    this.rollDay = scene.dayNight.dayCount;

    if (currentEncounter > 0 && Math.random() > 0.6) {
      if (!awaitingEncounter5Completion) this.trySpawnAmbientEveningVisit();
      return;
    }

    this.startEncounter(Math.min(currentEncounter + 1, 5));
  }

  /**
   * Ambient dawn care visit: Chapter 5+ only, once per game day, no story
   * encounter pending (evening encounters stay evening-only). Polled from
   * {@link GameScene.update} each frame.
   */
  trySpawnAmbientDawnVisit(): void {
    const scene = this.scene;
    if (!scene.map || !scene.dayNight || !scene.chapters || scene.chapters.chapter < 5) return;
    if (scene.dayNight.currentPhase !== "dawn") return;
    if (this.camilleNPC) return;
    const last = readCount(scene.registry.get(StoryKeys.CAMILLE_AMBIENT_DAWN_DAY));
    if (last >= scene.dayNight.dayCount) return;
    const completedEnc = readCount(scene.registry.get(StoryKeys.CAMILLE_ENCOUNTER));
    const encounter5Complete = scene.registry.get(StoryKeys.ENCOUNTER_5_COMPLETE) === true;
    if (completedEnc >= 5 && !encounter5Complete) return;
    this.spawnCareRouteNPCs({
      includeManu: completedEnc >= 1,
      includeKish: completedEnc >= 2,
    });
    scene.registry.set(StoryKeys.CAMILLE_AMBIENT_DAWN_DAY, scene.dayNight.dayCount);
  }

  /**
   * Ambient evening care visit when no story encounter rolled/spawned this
   * evening — still at most one evening visit per day via registry.
   */
  trySpawnAmbientEveningVisit(): void {
    const scene = this.scene;
    if (!scene.map || !scene.dayNight || !scene.chapters || scene.chapters.chapter < 5) return;
    if (scene.dayNight.currentPhase !== "evening") return;
    if (this.camilleNPC) return;
    const last = readCount(scene.registry.get(StoryKeys.CAMILLE_AMBIENT_EVENING_DAY));
    if (last >= scene.dayNight.dayCount) return;
    const completedEnc = readCount(scene.registry.get(StoryKeys.CAMILLE_ENCOUNTER));
    this.spawnCareRouteNPCs({
      includeManu: completedEnc >= 1,
      includeKish: completedEnc >= 2,
    });
    scene.registry.set(StoryKeys.CAMILLE_AMBIENT_EVENING_DAY, scene.dayNight.dayCount);
  }

  /**
   * Check if Mamma Cat is close enough to Camille (and has line-of-sight)
   * to trigger the pending encounter narrative.
   */
  checkProximity(): void {
    const scene = this.scene;
    if (this.pendingEncounter === 0) return;
    if (scene.dayNight.currentPhase !== "evening") return;
    if (this.arrivalShotDue || this.arrivalShotActive) return; // she's seen arriving first
    if (!this.camilleNPC?.visible) return;
    if (scene.dialogue.isActive) return;

    const dist = Phaser.Math.Distance.Between(scene.player.x, scene.player.y, this.camilleNPC.x, this.camilleNPC.y);
    if (dist > GP.CAMILLE_ENCOUNTER_DIST) return;
    if (!scene.hasLineOfSight(scene.player.x, scene.player.y, this.camilleNPC.x, this.camilleNPC.y)) return;

    const encounterNum = this.pendingEncounter;
    this.pendingEncounter = 0;
    this.playEncounterNarrative(encounterNum);
  }

  /**
   * Called once per `updateHumans` tick AFTER the human iteration so
   * we never splice the array mid-iteration (see WORKING_MEMORY
   * "Camille-era teardown runs after updateHumans finishes iterating").
   */
  flushTeardown(): void {
    if (!this.eraTeardownPending) return;
    this.eraTeardownPending = false;
    this.cancelStagedBeat();
    this.dropCarrier();
    this.eraParkExitCount = 0;
    this.eraParkExitTarget = 1;
    for (const npc of [this.camilleNPC, this.manuNPC, this.kishNPC]) {
      if (!npc) continue;
      this.scene.humans.unregister(npc);
      npc.destroy();
    }
    this.camilleNPC = null;
    this.manuNPC = null;
    this.kishNPC = null;
  }

  /**
   * "Kish, slow down" ambient bubble: fires once per Camille evening
   * spawn when Kish wanders into Camille's personal space. Folded into
   * the human-update loop where the original `updateHumans` block lived.
   */
  tryRunKishSlowDownBeat(): void {
    if (this.kishSlowDownShown) return;
    if (!this.camilleNPC || !this.kishNPC) return;
    if (this.kishNPC.isGreeting) return;
    if (this.camilleNPC.isEncounterPaused || this.kishNPC.isEncounterPaused) return;
    if (Phaser.Math.Distance.Between(this.kishNPC.x, this.kishNPC.y, this.camilleNPC.x, this.camilleNPC.y) >= 80) {
      return;
    }
    this.kishSlowDownShown = true;
    // Consolidated into the ambient-bubble channel so all human-spoken
    // dialogue uses the same visual surface as greetings and encounter beats.
    const camille = this.camilleNPC;
    this.scene.humans.renderGreetingBubble(camille, "Kish, slow down.");
    this.scene.emotes.show(this.scene, camille, "curious");
    // Camille only remembers it if Mamma Cat was there to see it.
    const { player } = this.scene;
    if (
      Phaser.Math.Distance.Between(player.x, player.y, camille.x, camille.y) <= GP.NARRATION_WITNESS_DIST &&
      this.scene.hasLineOfSight(player.x, player.y, camille.x, camille.y)
    ) {
      this.scene.humans.recordHumanLines(
        "Camille",
        "story",
        ["Kish, slow down."],
        "Kish ran ahead near Mamma Cat and Camille called her back.",
      );
    }
  }

  /**
   * Check whether the player has accepted beat 5 this frame. Called from
   * {@link GameScene.tryInteract} when a no-target Space greet would
   * otherwise fire. Returns `true` if the greet was consumed as the
   * beat-5 acceptance (the caller should then SKIP the usual
   * `player.startGreeting()`), `false` otherwise.
   */
  tryAcceptBeat5Decision(): boolean {
    if (!this.beat5DecisionActive) return false;
    if (!this.camilleNPC || !this.camilleNPC.active || !this.camilleNPC.visible) return false;
    const dist = Phaser.Math.Distance.Between(
      this.scene.player.x,
      this.scene.player.y,
      this.camilleNPC.x,
      this.camilleNPC.y,
    );
    if (dist > GP.CAMILLE_BEAT5_TOUCH_DIST) return false;
    this.acceptBeat5();
    return true;
  }

  /**
   * Start an encounter. Exposed so the save-mid-encounter-5 recovery
   * path in {@link GameScene.create} can re-spawn Camille after load.
   */
  startEncounter(encounterNum: number): void {
    // Same group either way (Manu from encounter 2, Kish from 3), so keep a
    // still-walking ambient visit rather than teleporting it to the underpass.
    // Not for the last one: she must be seen walking in with the carrier.
    const adopt =
      encounterNum < 5 &&
      canAdoptAmbientCareGroup({
        camille: this.camilleNPC,
        encounterActive: this.encounterActive,
        teardownPending: this.eraTeardownPending,
      });
    if (!adopt) this.cleanupNPCs();
    this.encounterActive = true;
    if (!adopt) {
      this.spawnCareRouteNPCs({
        includeManu: encounterNum >= 2,
        includeKish: encounterNum >= 3,
        sustainAcrossInactivePhases: false,
      });
    }
    this.scene.registry.set(StoryKeys.CAMILLE_AMBIENT_EVENING_DAY, this.scene.dayNight.dayCount);
    this.pendingEncounter = encounterNum;
    if (encounterNum === 5) this.bringCarrier();
  }

  /**
   * Called from {@link GameScene.shutdown}. Self-contained teardown of
   * every Camille-owned runtime state so the next scene start is always
   * playable, even if the player was mid-Beat-5-pickup. In particular:
   *
   *  - The two tweens launched by {@link runBeat5Pickup} (Mamma fading
   *    into the carrier; Camille walking off-screen) are stopped
   *    explicitly. Without this, a shutdown that races the tween can
   *    leave the player at partial alpha when the tween gets killed by
   *    Phaser's own lifecycle, and — critically — the `onComplete` that
   *    would otherwise re-enable the physics body + restore visibility
   *    never fires on a killed tween.
   *  - `scene.player.{body.enable, alpha, visible}` are reset directly so
   *    this method is safe to call outside a full scene teardown (e.g. a
   *    future mid-session reset path) without depending on
   *    `GameScene.shutdown()`'s scene-level restore at lines 255-261.
   *    GameScene also restores the same flags (the scene-level restore
   *    exists because `playerInputFrozen` is a scene-owned flag); both
   *    together are belt-and-suspenders.
   */
  shutdownCamilleState(): void {
    this.cancelBeat5Decision();
    this.beat5DecisionActive = false;
    this.leaving = false;
    this.scene.playerInputFrozen = false;
    this.dropCarrier();

    // Abort any in-flight `requestEncounterLines` LLM call so (a) the
    // fetch is cancelled (no wasted bandwidth), and (b) the orchestrator
    // in `runEncounterBeat` skips `runBeatWith` via its `abort.signal.
    // aborted` guards, so `playPairedBeat` / `scene.dialogue.show` never
    // runs against a torn-down scene. Matches the sibling shutdowns in
    // `HumanPresenceSystem` and `CatDialogueController`.
    this.cancelStagedBeat();

    const scene = this.scene;
    if (scene.player) {
      scene.tweens.killTweensOf(scene.player);
      const body = scene.player.body as Phaser.Physics.Arcade.Body | undefined;
      body?.setEnable(true);
      scene.player.setAlpha(1);
      scene.player.setVisible(true);
    }
    if (this.camilleNPC) {
      scene.tweens.killTweensOf(this.camilleNPC);
    }

    this.resumeEraHumans();
  }

  /**
   * Release paused Camille-era humans. Safe to call when nothing is paused.
   * After the yes Camille stays held: the walk-off tween alone moves her.
   */
  resumeEraHumans(): void {
    if (!this.leaving) this.camilleNPC?.resumeFromEncounter();
    this.manuNPC?.resumeFromEncounter();
    this.kishNPC?.resumeFromEncounter();
  }

  /**
   * Pause Camille (and any nearby story humans Manu/Kish) for the
   * duration of a paired beat so they stop walking their circuits
   * during narration.
   */
  pauseEraHumans(faceTargetX: number): void {
    this.camilleNPC?.pauseForEncounter(faceTargetX);
    this.manuNPC?.pauseForEncounter(faceTargetX);
    this.kishNPC?.pauseForEncounter(faceTargetX);
  }

  // ──────────── Internal ────────────

  /**
   * Spawn Camille-era humans on the Chapter 5+ care route. Manu appears
   * from encounter 2 onward; Kish from encounter 3 onward.
   */
  private spawnCareRouteNPCs(opts: {
    includeManu: boolean;
    includeKish: boolean;
    sustainAcrossInactivePhases?: boolean;
  }): void {
    const scene = this.scene;
    if (!scene.map) return;
    const { includeManu, includeKish, sustainAcrossInactivePhases = true } = opts;
    this.eraParkExitCount = 0;
    this.eraParkExitTarget = 1 + (includeManu ? 1 : 0) + (includeKish ? 1 : 0);
    this.kishSlowDownShown = false;
    const routes = buildCamilleEraCareRoutes((name) => scene.map.findObject("spawns", (o) => o.name === name));
    const navigationGrid = scene.createHumanNavigationGrid();
    const routeBase: Pick<
      HumanConfig,
      "activePhases" | "sustainAcrossInactivePhases" | "exitAfterRoute" | "onExitParkComplete" | "lingerWaypointIndex"
    > = {
      activePhases: ["dawn", "evening"],
      sustainAcrossInactivePhases,
      exitAfterRoute: true,
      /** Start pathing at waypoint 0 so the underpass entry pause runs (see HumanNPC.activate). */
      lingerWaypointIndex: 0,
      onExitParkComplete: () => this.onEraParkExit(),
    };

    const camilleConfig: HumanConfig = {
      type: "camille",
      speed: 35,
      path: routes.camille.map((w) => ({ x: w.x, y: w.y })),
      waypointPauseMs: routes.camille.map((w) => w.pauseMs),
      ...routeBase,
    };
    const camille = new HumanNPC(scene, scene.routeHumanConfig(camilleConfig, navigationGrid));
    this.camilleNPC = camille;
    this.manuNPC = null;
    this.kishNPC = null;
    const toRegister: HumanNPC[] = [camille];

    if (includeManu) {
      const manuConfig: HumanConfig = {
        type: "manu",
        speed: 35,
        path: routes.manu.map((w) => ({ x: w.x, y: w.y })),
        waypointPauseMs: routes.manu.map((w) => w.pauseMs),
        ...routeBase,
      };
      const manu = new HumanNPC(scene, scene.routeHumanConfig(manuConfig, navigationGrid));
      this.manuNPC = manu;
      toRegister.push(manu);
    }
    if (includeKish) {
      const kishConfig: HumanConfig = {
        type: "kish",
        profile: kishProfileForDay(scene.dayNight?.dayCount ?? 1), // a different outfit on alternate days
        speed: 50,
        path: routes.kish.map((w) => ({ x: w.x, y: w.y })),
        waypointPauseMs: routes.kish.map((w) => w.pauseMs),
        ...routeBase,
      };
      const kish = new HumanNPC(scene, scene.routeHumanConfig(kishConfig, navigationGrid));
      this.kishNPC = kish;
      toRegister.push(kish);
    }

    for (const npc of toRegister) {
      if (scene.groundLayer) scene.physics.add.collider(npc, scene.groundLayer);
      if (scene.objectsLayer) scene.physics.add.collider(npc, scene.objectsLayer);
      scene.humans.register(npc);
    }
  }

  /** Any of Camille's group on screen (with a margin), so removing them would be seen. */
  private eraGroupInView(): boolean {
    const view = this.scene.cameras?.main.worldView;
    if (!view) return false;
    const m = 64;
    return [this.camilleNPC, this.manuNPC, this.kishNPC].some(
      (h) => !!h?.active && h.visible && h.x > view.x - m && h.x < view.right + m && h.y > view.y - m && h.y < view.bottom + m,
    );
  }

  /** Count park-exit completions; teardown when every spawned human has exited. */
  private onEraParkExit(): void {
    this.eraParkExitCount += 1;
    if (this.eraParkExitCount < this.eraParkExitTarget) return;
    this.eraTeardownPending = true;
    this.pendingEncounter = 0;
    this.encounterActive = false;
  }

  private cleanupNPCs(): void {
    this.eraTeardownPending = false;
    this.eraParkExitCount = 0;
    this.eraParkExitTarget = 1;
    this.kishSlowDownShown = false;
    this.cancelStagedBeat();
    this.cancelBeat5Decision();
    this.beat5DecisionActive = false;
    this.leaving = false;
    this.scene.playerInputFrozen = false;
    this.dropCarrier();
    for (const npc of [this.camilleNPC, this.manuNPC, this.kishNPC]) {
      if (!npc) continue;
      npc.resumeFromEncounter();
      this.scene.humans.unregister(npc);
      npc.destroy();
    }
    this.camilleNPC = null;
    this.manuNPC = null;
    this.kishNPC = null;
  }

  /**
   * Delayed Camille beat: re-check the witness gate before dialogue (Phase 4.5).
   * If it fails, re-arm {@link pendingEncounter} for the next 5s poll.
   */
  private scheduleEncounterDialogue(delayMs: number, encounterNum: number, run: () => void): void {
    this.beatDelay = this.scene.time.delayedCall(delayMs, () => {
      this.beatDelay = null;
      if (!this.canRunBeatNow()) {
        this.pendingEncounter = encounterNum;
        return;
      }
      run();
    });
  }

  /**
   * Phase 4.5 witness gate, checked where a beat is about to show (after its
   * delay, and again after its AI request): Camille is still here and in
   * sight, it is still evening, and nothing else holds the screen.
   */
  private canRunBeatNow(): boolean {
    const scene = this.scene;
    const camille = this.camilleNPC;
    if (!camille?.active || !camille.visible || camille.isExitingPark) return false;
    if (scene.dayNight.currentPhase !== "evening") return false;
    if (scene.dialogue.isActive || scene.playerInputFrozen || scene.isPaused) return false;
    const { x, y } = scene.player;
    return (
      Phaser.Math.Distance.Between(x, y, camille.x, camille.y) <= GP.CAMILLE_ENCOUNTER_DIST &&
      scene.hasLineOfSight(x, y, camille.x, camille.y)
    );
  }

  /** Drop a beat still waiting on its delay or its AI request. */
  private cancelStagedBeat(): void {
    this.beatDelay?.remove(false);
    this.beatDelay = null;
    this.encounterRequestAbort?.abort();
    this.encounterRequestAbort = null;
  }

  private playEncounterNarrative(encounterNum: number): void {
    const hud = this.scene.scene.get("HUDScene") as HUDScene | undefined;
    hud?.pulseEdge(0x332200, 0.2, 2000);

    switch (encounterNum) {
      case 1:
        this.scene.registry.set(StoryKeys.CAMILLE_ENCOUNTER, encounterNum);
        this.scene.registry.set(StoryKeys.CAMILLE_ENCOUNTER_DAY, this.scene.dayNight.dayCount);
        hud?.showNarration(
          "A new human. She moves differently from the others. Slowly. Gently. She smells like... kindness?",
        );
        break;
      case 2:
        this.scheduleEncounterDialogue(8000, 2, () => {
          this.runEncounterBeat(2, hud);
        });
        break;
      case 3:
        this.scheduleEncounterDialogue(10000, 3, () => {
          this.runEncounterBeat(3, hud);
        });
        break;
      case 4:
        this.scheduleEncounterDialogue(10000, 4, () => {
          this.runEncounterBeat(4, hud);
        });
        break;
      case 5:
        this.scheduleEncounterDialogue(12000, 5, () => {
          this.scene.registry.set(StoryKeys.CAMILLE_ENCOUNTER, encounterNum);
          this.scene.registry.set(StoryKeys.CAMILLE_ENCOUNTER_DAY, this.scene.dayNight.dayCount);
          this.playBeat5Predecision();
        });
        break;
    }
  }

  /**
   * Drive a paired narrator+spoken sequence. See the extensive docstring
   * on the pre-refactor `GameScene.playPairedBeat` for the pause-lifecycle
   * contract; unchanged here.
   *
   * Returns false, pausing nobody, when another modal is already open
   * (`DialogueSystem.show` would silently drop this one and strand the
   * pause); the caller re-arms.
   *
   * `onComplete(spokenShown)` runs on natural completion with the spoken
   * lines whose bubble actually rendered (what Mamma Cat saw Camille say).
   *
   * `opts.completeOnDismiss` — when true, an early dismiss (player closes
   * the modal before the final line) still fires the caller's onComplete
   * after releasing the pause. Used by Beat-5 journey, which cannot
   * tolerate an early dismiss: the pickup tween has already been kicked
   * off from `onStepShown(0)` (Mamma is fading + getting body-disabled,
   * Camille is walking off-screen) and `playerInputFrozen = true` is set
   * outside this helper. Without the completion running, the scene
   * would be left with a frozen invisible player, ENCOUNTER_5_COMPLETE
   * unset, and no chapter transition — a permanent soft-lock until the
   * user reloads. For all other beats the existing "resume only" dismiss
   * semantics apply.
   *
   * `opts.onDismiss` — fires when the player closes the modal before the
   * final line AND `completeOnDismiss` is not set. Runs after the pause
   * release so callers can re-arm retry state (e.g. `runEncounterBeat`
   * puts `pendingEncounter` back so the player can re-approach Camille
   * and retry within the same evening). Never fires on natural
   * completion. Mutually exclusive with `completeOnDismiss` in the
   * current codebase.
   */
  private playPairedBeat(
    steps: ReadonlyArray<EncounterStep>,
    speaker: HumanNPC | null,
    onComplete: (spokenShown: string[]) => void,
    opts?: {
      onStepShown?: (index: number) => void;
      completeOnDismiss?: boolean;
      onDismiss?: () => void;
    },
  ): boolean {
    if (steps.length === 0) {
      onComplete([]);
      return true;
    }
    if (this.scene.dialogue.isActive) return false;

    if (speaker) {
      speaker.pauseForEncounter(this.scene.player.x);
    }
    const isCamilleBeat = speaker !== null && speaker === this.camilleNPC;
    if (isCamilleBeat) {
      this.pauseEraHumans(this.scene.player.x);
      // A pending ambient line would land on top of the beat's bubble.
      this.scene.humans.abortAmbientAi();
    }

    const narratorLines = steps.map((s) => s.narrator);
    const spokenShown: string[] = [];
    let currentBubble: Phaser.GameObjects.Text | null = null;
    const clearBubble = (): void => {
      if (currentBubble) {
        currentBubble.destroy();
        currentBubble = null;
      }
    };

    this.scene.dialogue.show(
      narratorLines,
      () => onComplete(spokenShown),
      {
        onLineShown: (index: number): void => {
          clearBubble();
          const step = steps[index];
          if (step?.spoken && speaker && speaker.active && speaker.visible) {
            currentBubble = this.scene.humans.renderHumanBubble(speaker, step.spoken, { persistent: true });
            spokenShown.push(step.spoken);
          }
          opts?.onStepShown?.(index);
        },
        onHide: (completed): void => {
          clearBubble();
          // Natural completion: onComplete runs next and owns the resume.
          if (completed) return;
          if (isCamilleBeat) {
            this.resumeEraHumans();
          } else if (speaker) {
            speaker.resumeFromEncounter();
          }
          // Beat-5 journey opts into completion-on-dismiss so the player
          // can't soft-lock the scene by closing the modal mid-pickup.
          if (opts?.completeOnDismiss) {
            onComplete(spokenShown);
          } else {
            // Caller-owned dismiss hook (e.g. runEncounterBeat re-arms
            // `pendingEncounter`). Mutually exclusive with
            // `completeOnDismiss` above.
            opts?.onDismiss?.();
          }
        },
      },
    );
    return true;
  }

  /**
   * Execute one of Camille's middle encounter beats (2/3/4).
   *
   * Saved-progress advance policy: `CAMILLE_ENCOUNTER`,
   * `CAMILLE_ENCOUNTER_DAY`, AND the conversation-store record of the
   * rendered spoken lines are all written only when the beat reaches
   * natural completion (player reads through all lines and `onComplete`
   * fires). An early dismiss, a caller-initiated abort (scene shutdown),
   * or a witness gate that fails once the AI reply arrives leaves both
   * the registry AND the conversation history unchanged, so the
   * encounter is retriable, and the AI's memory of previous Camille
   * turns stays truthful (persisting lines Mamma Cat never actually heard
   * would poison subsequent dialogue). Within the SAME evening, re-entry
   * is still blocked by the existing `encounterActive` (set in
   * `startEncounter`) + `rollDay` (set in `checkEncounter`) gates, so the
   * design intent of "pause/resume cannot re-trigger the beat" is
   * preserved without needing to advance the registry up-front. On
   * dismiss or a failed gate the orchestrator re-arms
   * `pendingEncounter = n`, so the player can re-approach Camille and
   * retry within the same evening after the scheduled 8–10 s delay.
   */
  private runEncounterBeat(n: 2 | 3 | 4, hud: HUDScene | undefined): void {
    const scene = this.scene;
    this.camilleNPC?.playCrouchToward(scene.player.x);

    const beat = this.beats[n];

    const runBeatWith = (reply: EncounterReply | null): void => {
      const { steps } = mergeCamilleBeatSteps(beat.steps, reply?.lines ?? null);
      // Saved-progress side effects run only on natural completion of the
      // rendered beat, never on early dismiss / abort (see docstring).
      const onComplete = (spokenShown: string[]): void => {
        scene.registry.set(StoryKeys.CAMILLE_ENCOUNTER, n);
        scene.registry.set(StoryKeys.CAMILLE_ENCOUNTER_DAY, scene.dayNight.dayCount);
        scene.humans.recordHumanEngagement();
        switch (n) {
          case 2:
            hud?.showNarration("She watches you eat. She doesn't reach for you. She understands.");
            scene.stats.restore("hunger", 30);
            break;
          case 3:
            scene.emotes.show(scene, scene.player, "heart");
            if (this.camilleNPC) scene.emotes.show(scene, this.camilleNPC, "heart");
            hud?.showNarration("Something shifts between you. A thread, invisible but real.");
            break;
          case 4:
            scene.emotes.show(scene, scene.player, "heart");
            if (this.camilleNPC) scene.emotes.show(scene, this.camilleNPC, "heart");
            hud?.showNarration("The small one is loud. But Camille keeps her still. She understands you.");
            break;
        }
        // Release the encounter pause so Camille (and Manu / Kish during
        // the later beats) resume their circuits. playPairedBeat
        // intentionally leaves the pause engaged through onComplete so
        // callers like the beat-5 state machine can chain into a
        // follow-up phase without a one-frame "resume then re-pause"
        // flicker.
        this.resumeEraHumans();
        // Camille remembers what Mamma Cat saw her say, with the authored
        // fact of the encounter as Mamma Cat's side.
        if (spokenShown.length > 0) {
          scene.humans.recordHumanLines("Camille", "story", spokenShown, CAMILLE_ENCOUNTER_MEMORY[n], reply?.memoryNote);
        }
      };

      // Early dismiss (or a modal that got there first) → re-arm so the
      // player can re-approach Camille and retry within the same evening.
      // `checkProximity` consumed `pendingEncounter` when this beat fired;
      // putting it back un-consumes that edge. Next evening's retry is
      // separately covered by leaving `CAMILLE_ENCOUNTER_DAY` unchanged.
      const opened = this.playPairedBeat(steps, this.camilleNPC, onComplete, {
        onDismiss: () => {
          this.pendingEncounter = n;
        },
      });
      if (!opened) this.pendingEncounter = n;
    };

    // Abort + signal-check pattern required for every LLM caller — see the
    // WORKING_MEMORY "In-flight LLM requests carry an AbortController"
    // lesson. If the scene tears down (e.g. snatcher capture during a
    // Camille beat) or Camille's group is torn down while the LLM call is
    // in flight, aborting both cancels the fetch AND prevents the orphaned
    // continuation from calling `runBeatWith` → `playPairedBeat` →
    // `scene.dialogue.show` against a destroyed scene. Teardown resets the
    // encounter itself, so an aborted beat is not re-armed.
    const abort = new AbortController();
    this.encounterRequestAbort = abort;
    const proceed = (reply: EncounterReply | null): void => {
      if (abort.signal.aborted) return;
      // The reply took seconds: Camille may have walked off, the evening
      // ended, or another modal opened meanwhile.
      if (!this.canRunBeatNow()) {
        this.pendingEncounter = n;
        return;
      }
      runBeatWith(reply);
    };
    void this.requestEncounterLines(n, beat.objective, abort.signal)
      .then(proceed, () => proceed(null))
      .finally(() => {
        if (this.encounterRequestAbort === abort) {
          this.encounterRequestAbort = null;
        }
      });
  }

  // ──────────── Beat 5 (three-phase decision gate) ────────────

  /**
   * Phase A: Camille asks. Holds the encounter pause through onComplete.
   * An early close re-arms the beat (the registry is already at 5).
   */
  private playBeat5Predecision(): void {
    this.camilleNPC?.playCrouchToward(this.scene.player.x);
    const opened = this.playPairedBeat(
      this.beat5PredecisionSteps,
      this.camilleNPC,
      (spokenShown) => {
        if (spokenShown.length > 0) {
          this.scene.humans.recordHumanLines(
            "Camille",
            "story",
            spokenShown,
            "Camille crouched and asked Mamma Cat to come home with her.",
          );
        }
        this.beginBeat5Decision();
      },
      {
        onDismiss: () => {
          this.pendingEncounter = 5;
        },
      },
    );
    if (!opened) this.pendingEncounter = 5;
  }

  /**
   * Phase B: open the 10-second decision window. Camille stays crouched
   * (encounter pause remains engaged from Phase A), a gentle HUD narration
   * primes the player, and a heart emote floats above Camille so the ask
   * reads emotionally without embedding a heart glyph in bubble text.
   */
  private beginBeat5Decision(): void {
    this.beat5DecisionActive = true;
    this.cancelBeat5Decision(); // defensive: drop any stale timer
    if (this.camilleNPC) {
      this.scene.emotes.show(this.scene, this.camilleNPC, "heart");
      this.pauseEraHumans(this.scene.player.x);
    }
    const hud = this.scene.scene.get("HUDScene") as HUDScene | undefined;
    hud?.showNarration("Approach Camille and press Space to go with her.");
    this.beat5DecisionTimer = this.scene.time.delayedCall(CAMILLE_BEAT5_DECISION_MS, () => {
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

  /** Player accepted within the window → play the accept line, then Phase C. */
  private acceptBeat5(): void {
    this.beat5DecisionActive = false;
    this.cancelBeat5Decision();
    this.leaving = true;
    // Freeze now, not at the journey: a cat chat or the letter opened during
    // the 3.2 s accept line, or the Colony Gathering that may follow it, would
    // hold the screen the journey needs.
    this.scene.playerInputFrozen = true;
    this.scene.player.startGreeting();
    this.scene.humans.recordHumanEngagement();
    if (this.camilleNPC) {
      this.scene.emotes.show(this.scene, this.camilleNPC, "heart");
      this.scene.emotes.show(this.scene, this.scene.player, "heart");
    }
    const speaker = this.camilleNPC;
    if (!speaker) {
      // Shouldn't happen — defensive fallthrough.
      this.playBeat5Journey();
      return;
    }
    // She turns to Mamma Cat (who came from wherever she was), the carrier on her side.
    speaker.pauseForEncounter(this.scene.player.x);
    const bubble = this.scene.humans.renderHumanBubble(speaker, CAMILLE_BEAT5_ACCEPT_LINE, {
      persistent: true,
    });
    this.scene.humans.recordHumanLines(
      "Camille",
      "story",
      [CAMILLE_BEAT5_ACCEPT_LINE],
      "Mamma Cat came to Camille's feet. She said yes.",
    );
    this.scene.time.delayedCall(3200, () => {
      bubble?.destroy();
      // Camille stays crouched beside her while the colony comes to say goodbye (if it loves her)
      if (!this.scene.eggs?.gatherForFarewell(speaker, () => this.playBeat5Journey())) this.playBeat5Journey();
    });
  }

  /** Window expired → gentle fallback, resume Camille, re-arm the beat. */
  private failBeat5(): void {
    this.beat5DecisionActive = false;
    this.cancelBeat5Decision();
    const speaker = this.camilleNPC;
    if (speaker && speaker.active && speaker.visible) {
      const bubble = this.scene.humans.renderHumanBubble(speaker, CAMILLE_BEAT5_TIMEOUT_LINE, {
        persistent: true,
      });
      this.scene.humans.recordHumanLines(
        "Camille",
        "story",
        [CAMILLE_BEAT5_TIMEOUT_LINE],
        "Camille waited, but Mamma Cat did not come to her.",
      );
      this.scene.time.delayedCall(2600, () => bubble?.destroy());
    }
    this.resumeEraHumans();
    // Re-arm so the next proximity poll retries.
    this.pendingEncounter = 5;
  }

  /**
   * Phase C: narration over the pickup tween. The journey paired beat
   * runs two narrator-only steps in the modal; on the FIRST step shown
   * we kick off the pickup tween so "The garden shrinks behind you" starts
   * as Mamma Cat walks into the carrier; a second later Camille picks it
   * up and walks toward the underpass exit.
   *
   * Input is already frozen from the accept, but a modal that opened just
   * before (a cat reply in flight, a guard's tale) would swallow the
   * journey's; it waits for that one to close instead.
   */
  private playBeat5Journey(): void {
    this.scene.playerInputFrozen = true;
    this.scene.player.setVelocity(0);
    if (this.scene.dialogue.isActive) {
      this.scene.time.delayedCall(250, () => this.playBeat5Journey());
      return;
    }
    this.playPairedBeat(
      this.beat5JourneySteps,
      this.camilleNPC,
      () => {
        this.scene.registry.set(StoryKeys.ENCOUNTER_5_COMPLETE, true);
        this.scene.autoSave();
        this.scene.startChapter6Sequence();
      },
      {
        onStepShown: (index) => {
          if (index === 0) this.runBeat5Pickup();
        },
        // Pickup tween already kicked off from onStepShown(0); an early
        // dismiss here would leave Mamma fading/invisible, player input
        // frozen, Chapter 6 never starting. Treat dismiss as "continue
        // the sequence" — startChapter6Sequence's 2s camera fade covers
        // any remaining tween timeline visually.
        completeOnDismiss: true,
      },
    );
  }

  /**
   * Run the "Camille picks up Mamma Cat" visual:
   *   1. Tween Mamma Cat into the carrier set down beside Camille (or to
   *      her feet if there's no carrier texture) while fading out.
   *   2. Disable Mamma's physics body + hide her.
   *   3. A second later (with a carrier), tween Camille off-screen toward
   *      the underpass exit with her walk animation. She stays held for
   *      the encounter until it ends, so her route can't steer her too.
   * All under the existing `playerInputFrozen` guard so nothing else
   * can steer the player while this plays out.
   */
  private runBeat5Pickup(): void {
    const scene = this.scene;
    const speaker = this.camilleNPC;
    if (!speaker) return;

    // Into the carrier set down beside Camille (or to her feet if there's none),
    // on whichever side the journey's re-crouch just turned her to.
    this.followCarrier();
    const into = this.carrier ?? { x: speaker.x, y: speaker.y + 4 };
    const mammaBody = scene.player.body as Phaser.Physics.Arcade.Body | undefined;
    scene.tweens.add({
      targets: scene.player,
      x: into.x,
      y: into.y,
      alpha: 0,
      duration: 900,
      ease: "Sine.easeInOut",
      onComplete: () => {
        mammaBody?.setEnable(false);
        scene.player.setVisible(false);
      },
    });

    // Once she's in, Camille picks the carrier up and walks off-screen toward
    // her underpass spawn waypoint. Manu/Kish continue their own circuits.
    const exitTarget = speaker.config.path[0] ?? { x: speaker.x - 200, y: speaker.y };
    this.manuNPC?.resumeFromEncounter();
    this.kishNPC?.resumeFromEncounter();
    scene.tweens.add({
      targets: speaker,
      x: exitTarget.x,
      y: exitTarget.y,
      delay: this.carrier ? 1000 : 0,
      duration: 3200,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        const dx = exitTarget.x - speaker.x;
        const dy = exitTarget.y - speaker.y;
        const key = speaker.humanType;
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down";
        if (scene.anims.exists(`${key}-walk-${dir}`)) {
          speaker.anims.play(`${key}-walk-${dir}`, true);
        }
      },
      onComplete: () => {
        speaker.setVisible(false);
        speaker.resumeFromEncounter();
      },
    });
  }

  // ──────────── The pet carrier and her arrival ────────────

  /** Encounter 5: Camille comes with the pet carrier, and Mamma Cat is shown her walking in. */
  private bringCarrier(): void {
    this.dropCarrier();
    this.arrivalShotDue = true;
    if (!this.scene.textures?.exists("pet_carrier")) return;
    this.carrier = this.scene.add.image(0, 0, "pet_carrier").setScale(CARRIER_SCALE).setVisible(false);
  }

  private dropCarrier(): void {
    this.carrier?.destroy();
    this.carrier = null;
    this.arrivalShotDue = false;
    this.arrivalShotActive = false;
  }

  /** In her hand while she walks; set down in front of her, door toward Mamma Cat, while she crouches. */
  private followCarrier(): void {
    const carrier = this.carrier;
    if (!carrier) return;
    const camille = this.camilleNPC;
    carrier.setVisible(!!camille?.active && camille.visible);
    if (!camille?.active) return;
    const anim = camille.anims.currentAnim?.key ?? "";
    if (anim.endsWith("-left")) this.carrierSide = -1;
    else if (anim.endsWith("-right")) this.carrierSide = 1;
    const side = this.carrierSide;
    let dx = side * 3;
    let dy = 7;
    let depth = camille.depth + 0.01;
    if (anim.includes("-crouch-")) {
      dx = side * 13;
      dy = 11;
    } else if (anim.endsWith("-down")) {
      dx = -7;
      dy = 5;
    } else if (anim.endsWith("-up")) {
      dx = 7;
      dy = 4;
      depth = camille.depth - 0.01;
    }
    carrier.setPosition(camille.x + dx, camille.y + dy).setDepth(depth).setFlipX(side > 0);
  }

  /**
   * As soon as she's in through the underpass and nothing else holds the
   * screen, the camera goes to Camille and her carrier (she sets off from the
   * entrance and reaches Blacky while it holds), then back to Mamma Cat; then
   * word spreads through the colony, Blacky first (if it loves her enough to come).
   */
  private tryArrivalShot(): void {
    const scene = this.scene;
    const camille = this.camilleNPC;
    if (camille?.isExitingPark || scene.dayNight.currentPhase !== "evening") {
      this.arrivalShotDue = false; // she's leaving, or the evening is over: the encounter carries on without it
      return;
    }
    // shown once she appears (the frame after her spawn) and isn't hidden under the trees
    if (!camille?.active || !camille.visible || scene.isUnderCanopy(camille.x, camille.y)) return;
    if (scene.dialogue.isActive || scene.playerInputFrozen || scene.isPaused || scene.cinematicActive) return;
    if (scene.player.isResting || scene.stats.collapsed) return;
    this.arrivalShotDue = false;
    this.arrivalShotActive = true;
    scene.storyShot(camille, CAMILLE_ARRIVAL_SHOT_HOLD_MS, {
      onArrive: () => {
        const hud = scene.scene.get("HUDScene") as HUDScene | undefined;
        hud?.showNarration("Camille is back. She's carrying something. A box... with a little door.");
      },
      onDone: () => {
        this.arrivalShotActive = false;
        // not if night fell during the shot and she's on her way out again
        const staying = !camille.isExitingPark && scene.dayNight.currentPhase === "evening";
        if (this.camilleNPC === camille && staying) scene.eggs?.spreadWord(camille);
      },
    });
  }

  /**
   * Ask Camille's AI persona for beat-appropriate spoken lines. Returns
   * the trimmed lines (and any impression of Mamma Cat) on success, or
   * `null` on any failure (the caller then substitutes authored fallback
   * text without error propagation).
   *
   * Intentionally SIDE-EFFECT-FREE — conversation persistence happens in
   * the beat's `onComplete`, after the caller has merged the AI lines
   * with the authored beat, so the stored record reflects what Camille
   * actually said on screen.
   *
   * `signal` — caller's abort signal, forwarded to the LLM service so a
   * scene shutdown / system reset cancels the in-flight fetch. Internal
   * awaits don't need explicit `.aborted` checks because this function
   * is side-effect-free; the orchestrator in `runEncounterBeat` guards
   * the continuation where state mutation actually happens.
   */
  private async requestEncounterLines(
    n: 2 | 3 | 4,
    objective: string,
    signal?: AbortSignal,
  ): Promise<EncounterReply | null> {
    const scene = this.scene;
    if (!(scene.dialogueService instanceof FallbackDialogueService)) {
      return null;
    }
    if (!("Camille" in AI_PERSONAS)) return null;

    try {
      const context = await loadNpcContext("Camille", {
        timestamp: scene.dayNight.totalGameTimeMs,
        gameDay: scene.dayNight.dayCount,
      });
      const request: DialogueRequest = {
        ...scene.humans.humanDialogueRequest("Camille", context, "beat"),
        encounterBeat: { kind: "camille_encounter", n, objective, slots: beatSpokenSlots(this.beats[n].steps) },
      };

      const response = await scene.dialogueService.getDialogue(request, {
        // Engaged-style budget: encounters are modal beats, the player is
        // committed and can tolerate a longer wait than an ambient bubble.
        timeoutMs: 5000,
        signal,
      });

      const lines = response.lines.map((l) => l.trim()).filter((l) => l.length > 0);
      return lines.length === 0 ? null : { lines, memoryNote: response.memoryNote };
    } catch {
      return null;
    }
  }
}
