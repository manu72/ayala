import Phaser from "phaser";
import type { GameScene } from "../scenes/GameScene";
import type { HUDScene } from "../scenes/HUDScene";
import { HumanNPC, type HumanConfig } from "../sprites/HumanNPC";
import { StoryKeys } from "../registry/storyKeys";
import { GP, CAMILLE_BEAT5_DECISION_MS } from "../config/gameplayConstants";
import { AI_PERSONAS } from "../ai/personas";
import { FallbackDialogueService } from "../services/FallbackDialogueService";
import type { ConversationEntry, DialogueRequest } from "../services/DialogueService";
import { calculateRelationshipStage } from "../services/DialogueRelationship";
import { getConversationCount, getRecentConversations, storeConversation } from "../services/ConversationStore";
import { buildCamilleEraCareRoutes } from "../utils/camilleCareRoute";
import {
  CAMILLE_ENCOUNTER_BEATS,
  CAMILLE_ENCOUNTER_5_PREDECISION_STEPS,
  CAMILLE_ENCOUNTER_5_JOURNEY_STEPS,
  CAMILLE_BEAT5_ACCEPT_LINE,
  CAMILLE_BEAT5_TIMEOUT_LINE,
  mergeCamilleBeatSteps,
  type EncounterStep,
} from "../data/camille-encounter-beats";

/**
 * Owns the entire Chapter-5 Camille encounter flow: ambient care-route
 * visits, the five scripted encounter beats (with AI-assisted middle
 * beats 2–4), the Beat-5 three-phase consent gate (pre-decision → 10s
 * player window → journey tween), Camille-era human lifecycle
 * (Camille / Manu / Kish), and the Kish-slow-down ambient bubble.
 *
 * Call sites on {@link GameScene}:
 *   - `checkEncounter()` + `checkProximity()` are polled from the 5s
 *     chapter-check block.
 *   - `trySpawnAmbientDawnVisit()` is polled from `update()` each frame
 *     (gated internally by phase + registry per-day limits).
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
 *   - Conversation history persists the *rendered* merged lines, not
 *     the raw AI payload (WORKING_MEMORY 5.1a lesson).
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
  private kishSlowDownShown = false;
  /**
   * Cancellation token for the in-flight `requestEncounterLines` LLM call.
   * Mirrors `CatDialogueController.requestAbort` /
   * `HumanPresenceSystem.humanAiBubbleAbort`. Aborted from
   * {@link shutdownCamilleState}; the `runEncounterBeat` orchestrator
   * checks `signal.aborted` before calling `playPairedBeat` so an
   * orphaned `.then` cannot render dialogue on a torn-down scene.
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
    Fluffy: ["Fluffy. How's the fountain?", "Hi, Fluffy."],
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

  get activeCamilleNPC(): HumanNPC | null {
    return this.camilleNPC;
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
    this.kishSlowDownShown = false;
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
    this.scene.humans.renderGreetingBubble(this.camilleNPC, "Kish, slow down.");
    this.scene.emotes.show(this.scene, this.camilleNPC, "curious");
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
    this.cleanupNPCs();
    this.encounterActive = true;
    this.spawnCareRouteNPCs({
      includeManu: encounterNum >= 2,
      includeKish: encounterNum >= 3,
      sustainAcrossInactivePhases: false,
    });
    this.scene.registry.set(StoryKeys.CAMILLE_AMBIENT_EVENING_DAY, this.scene.dayNight.dayCount);
    this.pendingEncounter = encounterNum;
  }

  /**
   * Called from {@link GameScene.shutdown}. Self-contained teardown of
   * every Camille-owned runtime state so the next scene start is always
   * playable, even if the player was mid-Beat-5-pickup. In particular:
   *
   *  - The two tweens launched by {@link runBeat5Pickup} (Mamma fading
   *    toward Camille's feet; Camille walking off-screen) are stopped
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
    this.scene.playerInputFrozen = false;

    // Abort any in-flight `requestEncounterLines` LLM call so (a) the
    // fetch is cancelled (no wasted bandwidth), and (b) the orchestrator
    // in `runEncounterBeat` skips `runBeatWith` via its `abort.signal.
    // aborted` guards, so `playPairedBeat` / `scene.dialogue.show` never
    // runs against a torn-down scene. Matches the sibling shutdowns in
    // `HumanPresenceSystem` and `CatDialogueController`.
    if (this.encounterRequestAbort) {
      this.encounterRequestAbort.abort();
      this.encounterRequestAbort = null;
    }

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

  /** Release paused Camille-era humans. Safe to call when nothing is paused. */
  resumeEraHumans(): void {
    this.camilleNPC?.resumeFromEncounter();
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
    this.cancelBeat5Decision();
    this.beat5DecisionActive = false;
    this.scene.playerInputFrozen = false;
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
   * Delayed Camille beat: re-check proximity + LOS before dialogue (Phase 4.5).
   * If conditions fail, re-arm {@link pendingEncounter} for the next 5s poll.
   */
  private scheduleEncounterDialogue(delayMs: number, encounterNum: number, run: () => void): void {
    this.scene.time.delayedCall(delayMs, () => {
      if (!this.camilleNPC?.active) {
        this.pendingEncounter = encounterNum;
        return;
      }
      const dist = Phaser.Math.Distance.Between(
        this.scene.player.x,
        this.scene.player.y,
        this.camilleNPC.x,
        this.camilleNPC.y,
      );
      if (dist > GP.CAMILLE_ENCOUNTER_DIST) {
        this.pendingEncounter = encounterNum;
        return;
      }
      if (!this.scene.hasLineOfSight(this.scene.player.x, this.scene.player.y, this.camilleNPC.x, this.camilleNPC.y)) {
        this.pendingEncounter = encounterNum;
        return;
      }
      if (this.scene.dialogue.isActive) {
        this.pendingEncounter = encounterNum;
        return;
      }
      run();
    });
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
          this.playBeat5Predecision(hud);
        });
        break;
    }
  }

  /**
   * Drive a paired narrator+spoken sequence. See the extensive docstring
   * on the pre-refactor `GameScene.playPairedBeat` for the pause-lifecycle
   * contract; unchanged here.
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
   * and retry within the same evening). Mutually exclusive with
   * `completeOnDismiss` in the current codebase.
   */
  private playPairedBeat(
    steps: ReadonlyArray<EncounterStep>,
    speaker: HumanNPC | null,
    onComplete: () => void,
    opts?: {
      onStepShown?: (index: number) => void;
      completeOnDismiss?: boolean;
      onDismiss?: () => void;
    },
  ): void {
    if (steps.length === 0) {
      onComplete();
      return;
    }

    if (speaker) {
      speaker.pauseForEncounter(this.scene.player.x);
    }
    const isCamilleBeat = speaker !== null && speaker === this.camilleNPC;
    if (isCamilleBeat) {
      this.pauseEraHumans(this.scene.player.x);
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

    this.scene.dialogue.show(
      narratorLines,
      () => {
        // Idempotency guard: when `completeOnDismiss` is set, onHide runs
        // onComplete synchronously and then this doneHook still fires from
        // DialogueSystem.advance() (captured before hide()). Short-circuit
        // the second invocation so story-critical callbacks never double-
        // fire Chapter 6 / autoSave / registry writes.
        if (completed) return;
        completed = true;
        clearBubble();
        onComplete();
      },
      {
        onLineShown: (index: number): void => {
          clearBubble();
          const step = steps[index];
          if (step?.spoken && speaker && speaker.active && speaker.visible) {
            currentBubble = this.scene.humans.renderHumanBubble(speaker, step.spoken, { persistent: true });
          }
          opts?.onStepShown?.(index);
        },
        onHide: (): void => {
          clearBubble();
          if (completed) return;
          if (isCamilleBeat) {
            this.resumeEraHumans();
          } else if (speaker) {
            speaker.resumeFromEncounter();
          }
          // Beat-5 journey opts into completion-on-dismiss so the player
          // can't soft-lock the scene by closing the modal mid-pickup.
          // The idempotency guard above ensures the doneHook captured in
          // DialogueSystem.advance() becomes a no-op afterwards.
          if (opts?.completeOnDismiss) {
            completed = true;
            onComplete();
          } else {
            // Caller-owned dismiss hook (e.g. runEncounterBeat re-arms
            // `pendingEncounter`). Mutually exclusive with
            // `completeOnDismiss` above.
            opts?.onDismiss?.();
          }
        },
      },
    );
  }

  /**
   * Execute one of Camille's middle encounter beats (2/3/4).
   *
   * Saved-progress advance policy: `CAMILLE_ENCOUNTER`,
   * `CAMILLE_ENCOUNTER_DAY`, AND the conversation-store record of the
   * rendered spoken lines are all written only when the beat reaches
   * natural completion (player reads through all lines and `onComplete`
   * fires). An early dismiss, a caller-initiated abort (scene shutdown),
   * or an AI request failure that fails before rendering leaves both the
   * registry AND the conversation history unchanged, so the encounter is
   * retriable on the next eligible evening and the AI's memory of
   * previous Camille turns stays truthful (persisting lines Mamma Cat
   * never actually heard would poison subsequent dialogue). Within the
   * SAME evening, re-entry is still blocked by the existing
   * `encounterActive` (set in `startEncounter`) + `rollDay` (set in
   * `checkEncounter`) gates, so the design intent of "pause/resume
   * cannot re-trigger the beat" is preserved without needing to advance
   * the registry up-front. On dismiss the orchestrator re-arms
   * `pendingEncounter = n` via the `onDismiss` hook on `playPairedBeat`,
   * so the player can re-approach Camille and retry within the same
   * evening after the scheduled 8–10 s delay.
   */
  private runEncounterBeat(n: 2 | 3 | 4, hud: HUDScene | undefined): void {
    const scene = this.scene;
    this.camilleNPC?.playCrouchToward(scene.player.x);

    const beat = this.beats[n];

    const runBeatWith = (spokenOverrides: string[] | null): void => {
      const { steps, spokenRendered } = mergeCamilleBeatSteps(beat.steps, spokenOverrides);
      // `onComplete` is declared inside `runBeatWith` so it can close over
      // the per-run `spokenRendered` — we persist the conversation history
      // (and all other saved-progress side effects) only on natural
      // completion of the rendered beat, never on early dismiss / abort.
      // The conversation store is the AI's memory for future Camille
      // turns; writing lines Mamma Cat didn't actually hear would poison
      // subsequent dialogue ("as I was saying yesterday…" about a beat
      // the player never finished).
      const onComplete = (): void => {
        // Advance saved progress only on successful completion of the
        // rendered beat. See the docstring on this method for the
        // rationale and the retry-on-dismiss/abort contract.
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
        // Persist the rendered spoken lines so the conversation store's
        // record matches what Mamma Cat actually witnessed. Fire-and-
        // forget: best-effort IndexedDB write, failures are swallowed
        // inside `persistBeatHistory`.
        if (spokenRendered.length > 0) {
          void this.persistBeatHistory(n, spokenRendered);
        }
      };

      this.playPairedBeat(steps, this.camilleNPC, onComplete, {
        // Early dismiss → re-arm so the player can re-approach Camille
        // and retry within the same evening. `checkProximity` consumed
        // `pendingEncounter` when this beat fired; putting it back
        // un-consumes that edge. Next evening's retry is separately
        // covered by leaving `CAMILLE_ENCOUNTER_DAY` unchanged above.
        onDismiss: () => {
          this.pendingEncounter = n;
        },
      });
    };

    // Abort + signal-check pattern required for every LLM caller — see the
    // WORKING_MEMORY "In-flight LLM requests carry an AbortController"
    // lesson. If the scene tears down (e.g. snatcher capture during a
    // Camille beat) while the LLM call is in flight, aborting here both
    // cancels the fetch AND prevents the orphaned `.then`/`.catch`
    // continuation from calling `runBeatWith` → `playPairedBeat` →
    // `scene.dialogue.show` against a destroyed scene. On abort we also
    // re-arm `pendingEncounter` so a non-shutdown caller (hypothetical
    // future mid-session reset) can retry via `checkProximity`; during
    // a real shutdown this gets cleared again by `cleanupNPCs`, which
    // makes the re-arm a safe no-op.
    const abort = new AbortController();
    this.encounterRequestAbort = abort;
    void this.requestEncounterLines(n, beat.objective, abort.signal)
      .then((lines) => {
        if (abort.signal.aborted) {
          this.pendingEncounter = n;
          return;
        }
        runBeatWith(lines);
      })
      .catch(() => {
        if (abort.signal.aborted) {
          this.pendingEncounter = n;
          return;
        }
        runBeatWith(null);
      })
      .finally(() => {
        if (this.encounterRequestAbort === abort) {
          this.encounterRequestAbort = null;
        }
      });
  }

  /**
   * Persist the spoken lines Camille was actually seen saying during a
   * middle beat (2/3/4). Stored record matches what the player saw — not
   * the raw AI payload, which may be reshaped by the merge.
   */
  private async persistBeatHistory(n: 2 | 3 | 4, spokenRendered: string[]): Promise<void> {
    try {
      const snapshotTrust = this.scene.trust.global;
      await storeConversation({
        speaker: "Camille",
        timestamp: this.scene.dayNight.totalGameTimeMs,
        realTimestamp: Date.now(),
        gameDay: this.scene.dayNight.dayCount,
        lines: spokenRendered,
        trustBefore: snapshotTrust,
        trustAfter: snapshotTrust,
        chapter: this.scene.chapters.chapter,
        playerAction: `camille_encounter_${n}`,
        gameStateSnapshot: {
          trustWithSpeaker: snapshotTrust,
          trustGlobal: this.scene.trust.global,
          timeOfDay: this.scene.dayNight.currentPhase,
          hunger: this.scene.stats.hunger,
          thirst: this.scene.stats.thirst,
          energy: this.scene.stats.energy,
        },
      });
    } catch {
      // Best-effort persistence; deliberately silent.
    }
  }

  // ──────────── Beat 5 (three-phase decision gate) ────────────

  /** Phase A: Camille asks. Holds the encounter pause through onComplete. */
  private playBeat5Predecision(hud: HUDScene | undefined): void {
    void hud;
    this.camilleNPC?.playCrouchToward(this.scene.player.x);
    this.playPairedBeat(this.beat5PredecisionSteps, this.camilleNPC, () => this.beginBeat5Decision());
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
    const bubble = this.scene.humans.renderHumanBubble(speaker, CAMILLE_BEAT5_ACCEPT_LINE, {
      persistent: true,
    });
    this.scene.time.delayedCall(3200, () => {
      bubble?.destroy();
      this.playBeat5Journey();
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
      this.scene.time.delayedCall(2600, () => bubble?.destroy());
    }
    this.resumeEraHumans();
    // Re-arm so the next proximity poll retries.
    this.pendingEncounter = 5;
  }

  /**
   * Phase C: narration over the pickup tween. The journey paired beat
   * runs two narrator-only steps in the modal; on the FIRST step shown
   * we kick off the pickup tween so "The garden shrinks behind you" is
   * perfectly synchronised with Mamma Cat being lifted into the carrier
   * and Camille walking toward the underpass exit.
   */
  private playBeat5Journey(): void {
    this.scene.playerInputFrozen = true;
    this.scene.player.setVelocity(0);
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
   *   1. Tween Mamma Cat to Camille's feet while fading out (carrier).
   *   2. Disable Mamma's physics body + hide her.
   *   3. Tween Camille off-screen toward the underpass exit with her
   *      walk animation.
   * All under the existing `playerInputFrozen` guard so nothing else
   * can steer the player while this plays out.
   */
  private runBeat5Pickup(): void {
    const scene = this.scene;
    const speaker = this.camilleNPC;
    if (!speaker) return;

    const mammaBody = scene.player.body as Phaser.Physics.Arcade.Body | undefined;
    scene.tweens.add({
      targets: scene.player,
      x: speaker.x,
      y: speaker.y + 4,
      alpha: 0,
      duration: 900,
      ease: "Sine.easeInOut",
      onComplete: () => {
        mammaBody?.setEnable(false);
        scene.player.setVisible(false);
      },
    });

    // Camille walks off-screen toward her underpass spawn waypoint.
    // Release just Camille (not the whole Camille-era group — Manu/Kish
    // continue their own circuits normally once the beat resolves).
    const exitTarget = speaker.config.path[0] ?? { x: speaker.x - 200, y: speaker.y };
    this.manuNPC?.resumeFromEncounter();
    this.kishNPC?.resumeFromEncounter();
    speaker.resumeFromEncounter();
    scene.tweens.add({
      targets: speaker,
      x: exitTarget.x,
      y: exitTarget.y,
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
      },
    });
  }

  /**
   * Ask Camille's AI persona for beat-appropriate spoken lines. Returns
   * the trimmed lines on success, or `null` on any failure (the caller
   * then substitutes authored fallback text without error propagation).
   *
   * Intentionally SIDE-EFFECT-FREE — conversation persistence happens
   * in {@link persistBeatHistory} after the caller has merged the AI
   * lines with the authored beat so the stored record reflects what
   * Camille actually said on screen.
   *
   * `signal` — caller's abort signal, forwarded to the LLM service so a
   * scene shutdown / system reset cancels the in-flight fetch. Internal
   * awaits don't need explicit `.aborted` checks because this function
   * is side-effect-free; the orchestrator in `runEncounterBeat` guards
   * the `.then`/`.catch` boundary where state mutation actually happens.
   */
  private async requestEncounterLines(
    n: 2 | 3 | 4,
    objective: string,
    signal?: AbortSignal,
  ): Promise<string[] | null> {
    const scene = this.scene;
    if (!(scene.dialogueService instanceof FallbackDialogueService)) {
      return null;
    }
    if (!("Camille" in AI_PERSONAS)) return null;

    try {
      const history = await getRecentConversations("Camille", 10);
      const conversationHistory: ConversationEntry[] = history.map((r) => ({
        timestamp: r.timestamp,
        speaker: r.speaker,
        mammaCatTurn: r.mammaCatTurn,
        text: r.lines.join(" "),
      }));
      const conversationCount = await getConversationCount("Camille");
      const isFirstConversation = conversationCount === 0;

      const request: DialogueRequest = {
        speaker: "Camille",
        speakerType: "human",
        target: "Mamma Cat",
        gameState: {
          chapter: scene.chapters.chapter,
          timeOfDay: scene.dayNight.currentPhase,
          trustGlobal: scene.trust.global,
          trustWithSpeaker: scene.trust.global,
          hunger: scene.stats.hunger,
          thirst: scene.stats.thirst,
          energy: scene.stats.energy,
          daysSurvived: scene.dayNight.dayCount,
          knownCats: Array.from(scene.knownCats),
          recentEvents: [],
        },
        conversationHistory,
        isFirstConversation,
        relationshipStage: calculateRelationshipStage({
          isFirstConversation,
          conversationCount,
          trustWithSpeaker: scene.trust.global,
        }),
        encounterBeat: { kind: "camille_encounter", n, objective },
      };

      const response = await scene.dialogueService.getDialogue(request, {
        // Engaged-style budget: encounters are modal beats, the player is
        // committed and can tolerate a longer wait than an ambient bubble.
        timeoutMs: 5000,
        signal,
      });

      const lines = response.lines.map((l) => l.trim()).filter((l) => l.length > 0);
      return lines.length === 0 ? null : lines;
    } catch {
      return null;
    }
  }
}
