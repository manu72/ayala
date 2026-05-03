import Phaser from "phaser";
import { HumanNPC } from "../sprites/HumanNPC";
import type { HumanConfig } from "../sprites/HumanNPC";
import { DogNPC } from "../sprites/DogNPC";
import type { NPCCat } from "../sprites/NPCCat";
import { AI_PERSONAS } from "../ai/personas";
import {
  findUnplayedDialogueScript,
  type ConversationEntry,
  type DialogueRequest,
} from "../services/DialogueService";
import { calculateRelationshipStage } from "../services/DialogueRelationship";
import { FallbackDialogueService } from "../services/FallbackDialogueService";
import { NPC_DIALOGUE_SCRIPTS } from "../data/npc-dialogue";
import { StoryKeys } from "../registry/storyKeys";
import {
  GP,
  STATIONARY_GREET_CAP,
  STATIONARY_MOVE_THRESHOLD_PX,
} from "../config/gameplayConstants";
import { shouldUseHumanAiBubble, shouldUseNamedHumanScriptedBubble } from "../utils/humanAiBubbleEligibility";
import { getEffectiveHumanPhase } from "../utils/humanSpawnPolicy";
import {
  storeConversation,
  getRecentConversations,
  getConversationCount,
} from "../services/ConversationStore";
import type { GameScene } from "../scenes/GameScene";

/** Per-human wait between AI ambient bubbles, ms. */
const HUMAN_AI_BUBBLE_COOLDOWN_MS = 30_000;
/**
 * Budget for ambient bubble LLM calls, ms. Observed proxy round-trips run
 * 2000–4500 ms, so anything tighter forces almost every bubble through the
 * scripted fallback (and spams the console). 3500 ms catches the common
 * case while still well below the 8s engaged dialogue budget so a slow
 * model can't stall the scene.
 */
const HUMAN_AI_BUBBLE_TIMEOUT_MS = 3500;

/**
 * Debounce window for {@link HumanPresenceSystem.recordHumanEngagement}.
 * Two calls inside this window count as one engagement for scoring
 * purposes, so a paired beat (narration + spoken + emote) doesn't stack
 * three score increments for a single human interaction.
 */
const HUMAN_ENGAGEMENT_COOLDOWN_MS = 5_000;

/**
 * Owns the park's human NPC roster.
 *
 * Responsibilities:
 *   - Spawn + path the scripted ambient humans (joggers, dog walkers,
 *     feeders) on `create()`; collide them with the ground/objects layers.
 *   - Tick per-human AI and ambient proximity-greeting flow each frame,
 *     including the stationary-greet cap and the "Kish, slow down" aside.
 *   - Mediate all human-spoken bubbles through a single render surface
 *     (WORKING_MEMORY 5.1a: one visual style for all human speech). The
 *     Camille encounter system and the snatcher system reuse
 *     {@link renderHumanBubble} / {@link renderGreetingBubble} rather than
 *     adding their own bubble code paths.
 *   - Own the AI ambient-bubble throttle (per-human cooldown WeakMap +
 *     global single-flight guard + abort controller) so a scene restart
 *     mid-fetch doesn't strand `humanAiBubbleInFlight=true` on the reused
 *     scene instance.
 *   - Provide the single-owner {@link register} / {@link unregister} entry
 *     points for externally-spawned humans (Snatcher, Camille care-route).
 *     After Commit C lands, NO other code touches `humans[]` directly.
 *
 * Polling model (WORKING_MEMORY): the scene drives the per-frame tick via
 * {@link tick}. This class does not emit events.
 */
export class HumanPresenceSystem {
  private readonly scene: GameScene;
  private readonly humansList: HumanNPC[] = [];

  /**
   * Per-human cooldown (wall ms) before another AI-driven ambient bubble
   * is requested. Scripted bubbles continue firing during the cooldown so
   * the world does not fall silent. Keyed by HumanNPC instance so named
   * entities (Camille) and anonymous-but-identified entities (feeders)
   * each get their own timer.
   */
  private humanAiBubbleCooldownUntil: WeakMap<HumanNPC, number> = new WeakMap();
  /**
   * Global single-flight guard: at most one AI ambient bubble may be in
   * flight at a time. Prevents a crowded scene (Camille + Manu + Kish all
   * approaching cats at once) from burning a burst of LLM calls. Engaged
   * (Space-triggered) cat dialogue uses its own guard on the scene and is
   * independent.
   */
  private humanAiBubbleInFlight = false;
  /** Abort controller for the currently in-flight human bubble (if any). */
  private humanAiBubbleAbort: AbortController | null = null;

  /**
   * Reference position used to decide whether Mamma Cat is "stationary"
   * for the purposes of the per-human greeting cap. Reset to the player's
   * current position whenever she moves more than
   * {@link STATIONARY_MOVE_THRESHOLD_PX} from this anchor; every human's
   * stationary greet counter is cleared at the same time.
   */
  private playerStationaryAnchorX = 0;
  private playerStationaryAnchorY = 0;

  /**
   * Wall-clock of the most recent {@link recordHumanEngagement} credit,
   * used to debounce repeated credits inside a single social interaction.
   */
  private lastHumanEngagementAt = -Infinity;

  /** Cat-person scripted greeting pool keyed by human type. */
  private readonly catPersonGreetings: Record<string, string[]> = {
    camille: ["Hi sweetie.", "Kamusta, pusa.", "There you are.", "Good girl.", "Hello, beautiful."],
    manu: ["Hey, little one.", "You're okay.", "Hi there."],
    kish: ["OMG KITTY!", "Hi hi hi!", "Look at you!", "SO CUTE!"],
    feeder: ["Hi sweetie.", "Kamusta, pusa.", "There you are.", "Good kitty."],
  };

  constructor(scene: GameScene) {
    this.scene = scene;
  }

  /** Live roster, exposed read-only so iteration code (flee logic, greet-range queries) can read without touching internal state. */
  get humans(): ReadonlyArray<HumanNPC> {
    return this.humansList;
  }

  /** Count (used by diagnostics only; avoid hot-path use). */
  get count(): number {
    return this.humansList.length;
  }

  /**
   * Reset the AI ambient-bubble guards and stationary anchor. Called from
   * {@link GameScene.create} so a scene restart (post snatcher capture /
   * manual reload) starts with a clean throttle state.
   */
  resetTransient(spawnX: number, spawnY: number): void {
    this.humanAiBubbleCooldownUntil = new WeakMap();
    this.humanAiBubbleInFlight = false;
    this.humanAiBubbleAbort = null;
    this.playerStationaryAnchorX = spawnX;
    this.playerStationaryAnchorY = spawnY;
    this.lastHumanEngagementAt = -Infinity;
  }

  /**
   * Register an externally-spawned human (e.g. by
   * {@link CamilleEncounterSystem} or {@link SnatcherSystem}). Adds the
   * sprite to the ambient-tick roster; ground/objects collisions remain
   * the caller's responsibility because they already have the physics
   * context at spawn time.
   *
   * No-op if the same instance is already registered (idempotent).
   */
  register(npc: HumanNPC): void {
    if (this.humansList.includes(npc)) return;
    this.humansList.push(npc);
  }

  /**
   * Unregister an externally-spawned human. Does NOT destroy the sprite
   * (the caller owns its lifetime), just removes it from the ambient
   * roster so it stops getting `update()` / greeting / glance ticks.
   */
  unregister(npc: HumanNPC): void {
    const idx = this.humansList.indexOf(npc);
    if (idx !== -1) this.humansList.splice(idx, 1);
  }

  /** Spawn the scripted ambient humans (joggers, feeders, dog walkers). */
  spawnAmbientHumans(): void {
    const scene = this.scene;
    const configs: HumanConfig[] = [
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
    const navigationGrid = scene.createHumanNavigationGrid();

    for (const config of configs) {
      const routedConfig = scene.routeHumanConfig(config, navigationGrid);
      const human = new HumanNPC(scene, routedConfig);
      if (scene.groundLayer) {
        scene.physics.add.collider(human, scene.groundLayer);
      }
      if (scene.objectsLayer) {
        scene.physics.add.collider(human, scene.objectsLayer);
      }
      this.humansList.push(human);

      if (routedConfig.type === "dogwalker") {
        const dogKey = walkerDogKeys[walkerDogIdx % walkerDogKeys.length]!;
        scene.dogs.push(new DogNPC(scene, human, dogKey));
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
    const poi = (name: string): Phaser.Types.Tilemaps.TiledObject | null =>
      this.scene.map.findObject("spawns", (o) => o.name === name);
    const blacky = poi("spawn_blacky");
    const ginger = poi("spawn_ginger");
    const station1 = poi("poi_feeding_station_1");
    const station2 = poi("poi_feeding_station_2");
    const tiger = poi("spawn_tiger");
    const jayco = poi("spawn_jayco");
    const fluffy = poi("spawn_fluffy");

    const px = (obj: Phaser.Types.Tilemaps.TiledObject | null, fallback: number): number => obj?.x ?? fallback;
    const py = (obj: Phaser.Types.Tilemaps.TiledObject | null, fallback: number): number => obj?.y ?? fallback;

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
        type: "ben",
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
   * accumulates until it hits {@link STATIONARY_GREET_CAP}, at which
   * point `tick()` skips the ambient greeting branch until she moves.
   *
   * Uses squared-distance to avoid a per-frame sqrt. O(humans) on
   * threshold crossings, otherwise O(1).
   */
  updatePlayerStationaryAnchor(): void {
    const dx = this.scene.player.x - this.playerStationaryAnchorX;
    const dy = this.scene.player.y - this.playerStationaryAnchorY;
    const thresholdSq = STATIONARY_MOVE_THRESHOLD_PX * STATIONARY_MOVE_THRESHOLD_PX;
    if (dx * dx + dy * dy < thresholdSq) return;
    this.playerStationaryAnchorX = this.scene.player.x;
    this.playerStationaryAnchorY = this.scene.player.y;
    for (const human of this.humansList) {
      human.resetStationaryGreet();
    }
  }

  /**
   * Drive per-frame human behaviour: phase updates, ambient proximity
   * greetings, jogger/dog-walker glances, steering avoidance. The outer
   * scene still owns the snatcher detection + dog update ordering because
   * those touch systems this class shouldn't know about.
   */
  tick(delta: number): void {
    const scene = this.scene;
    for (const human of this.humansList) {
      human.setPhase(getEffectiveHumanPhase(human.humanType, scene.dayNight.currentPhase, scene.dayNight.dayCount));
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
        // session (see STATIONARY_GREET_CAP). The cap resets automatically
        // via `resetStationaryGreet` when Mamma moves more than
        // STATIONARY_MOVE_THRESHOLD_PX from her anchor (see
        // `updatePlayerStationaryAnchor`). The isGreeting cooldown (4-6s)
        // still prevents frame-spam during the N allowed attempts.
        const playerDist = Phaser.Math.Distance.Between(human.x, human.y, scene.player.x, scene.player.y);
        if (playerDist < GP.CAT_PERSON_PLAYER_GREET_DIST && human.stationaryGreetCount < STATIONARY_GREET_CAP) {
          let playerLine: string | undefined;
          if (human.humanType === "camille") {
            const enc = (scene.registry.get(StoryKeys.CAMILLE_ENCOUNTER) as number) ?? 0;
            if (enc < 2) {
              playerLine = "And who are you, sweetheart?";
            }
          }
          human.startGreeting(scene.player.x, scene.player.y);
          human.incrementStationaryGreet();
          this.showGreetingBubble(human, { line: playerLine });
          scene.emotes.show(scene, human, "heart");
          scene.emotes.show(scene, scene.player, "heart");
          greeted = true;
        }

        if (!greeted) {
          for (const { cat } of scene.npcs) {
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
              scene.emotes.show(scene, human, "heart");
              if (cat.state !== "sleeping") scene.emotes.show(scene, cat, "heart");
              break;
            }
          }
        }
      }

      // Delegated to the Camille encounter system: at most one "Kish, slow
      // down." aside per Camille evening spawn, gated on both NPCs being
      // active, ungreeted, un-paused, and within 80px. The system renders
      // the Camille bubble and the curious emote when it fires.
      scene.camille.tryPlayKishSlowDownBeat();

      // Category A: passers-through glance at nearby cats (including Mamma Cat).
      // Both female ("jogger") and male ("jogger_male") joggers behave the
      // same here: they glance, and their presence mildly alerts cats.
      const isJogger = human.humanType === "jogger" || human.humanType === "jogger_male";
      if (isJogger || human.humanType === "dogwalker") {
        let glanced = false;
        const playerDist = Phaser.Math.Distance.Between(human.x, human.y, scene.player.x, scene.player.y);
        if (playerDist < GP.GLANCE_DIST) {
          human.glanceAt(scene.player.x, scene.player.y);
          glanced = true;
        }

        if (!glanced) {
          for (const { cat } of scene.npcs) {
            const dist = Phaser.Math.Distance.Between(human.x, human.y, cat.x, cat.y);
            if (dist < GP.GLANCE_DIST) {
              if (isJogger) {
                if (cat.state !== "sleeping" && cat.state !== "alert") {
                  cat.triggerAlert();
                  scene.emotes.show(scene, cat, "alert");
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
        for (const other of this.humansList) {
          if (other === human || !other.visible) continue;
          neighbours.push({ x: other.x, y: other.y });
        }
        for (const { cat } of scene.npcs) {
          if (!cat.visible) continue;
          neighbours.push({ x: cat.x, y: cat.y });
        }
        neighbours.push({ x: scene.player.x, y: scene.player.y });
        human.applySteeringAvoidance(neighbours, avoidR);
      }
    }

    scene.camille.flushTeardown();
  }

  /**
   * True when at least one visible human NPC is within the player-initiated
   * greet radius. Used to gate the meow SFX for "free greet (no cat in
   * range)" — without a target cat AND without a nearby human, the press
   * is a silent idle greet rather than a social interaction.
   */
  isHumanInGreetRange(): boolean {
    const range = GP.CAT_PERSON_PLAYER_GREET_DIST;
    for (const human of this.humansList) {
      if (!human.active || !human.visible) continue;
      const dist = Phaser.Math.Distance.Between(this.scene.player.x, this.scene.player.y, human.x, human.y);
      if (dist <= range) return true;
    }
    return false;
  }

  /**
   * Show a single greeting bubble above `human` using the best available
   * source in priority order: caller-forced line > unplayed named-human
   * script > AI persona > scripted pool.
   */
  showGreetingBubble(human: HumanNPC, opts?: { line?: string; nearNpcCat?: NPCCat }): void {
    if (opts?.line) {
      this.renderGreetingBubble(human, opts.line);
      return;
    }

    const scene = this.scene;
    const identity = human.identityName;
    const hasPersona = identity !== null && identity in AI_PERSONAS;
    const now = scene.time.now;
    const cooldownUntil = this.humanAiBubbleCooldownUntil.get(human) ?? 0;
    const distanceToMammaCat = Phaser.Math.Distance.Between(human.x, human.y, scene.player.x, scene.player.y);
    const aiEligible = shouldUseHumanAiBubble({
      hasPersona,
      aiServiceAvailable: scene.dialogueService instanceof FallbackDialogueService,
      aiInFlight: this.humanAiBubbleInFlight,
      now,
      cooldownUntil,
      isMammaCatGreeting: opts?.nearNpcCat === undefined,
      distanceToMammaCat,
      maxMammaCatDistance: GP.CAT_PERSON_PLAYER_GREET_DIST,
    });
    const namedHumanDialogueEligible = shouldUseNamedHumanScriptedBubble({
      hasPersona,
      isMammaCatGreeting: opts?.nearNpcCat === undefined,
      distanceToMammaCat,
      maxMammaCatDistance: GP.CAT_PERSON_PLAYER_GREET_DIST,
    });

    if (namedHumanDialogueEligible && identity !== null) {
      void this.requestHumanBubbleLine(human, identity, opts?.nearNpcCat, { aiAllowed: aiEligible }).catch(() => {
        /* fallbackLine branch inside already renders scripted on failure */
      });
      return;
    }

    this.renderGreetingBubble(human, this.pickScriptedGreeting(human, opts?.nearNpcCat));
  }

  /**
   * Render a named-human ambient line: first consume any unplayed authored
   * script, then ask the AI service if eligible. Falls back to the local
   * scripted pool on timeout, network failure, parse failure, or if the
   * human becomes ineligible mid-flight.
   */
  private async requestHumanBubbleLine(
    human: HumanNPC,
    speaker: string,
    nearNpcCat: NPCCat | undefined,
    opts: { aiAllowed: boolean },
  ): Promise<void> {
    const scene = this.scene;
    let abort: AbortController | null = null;

    const renderFallback = (): void => {
      if (!human.active || !human.visible || !this.isHumanCloseToMammaCat(human)) return;
      this.renderGreetingBubble(human, this.pickScriptedGreeting(human, nearNpcCat));
    };

    try {
      const history = await getRecentConversations(speaker, 10);
      const conversationHistory: ConversationEntry[] = history.map((r) => ({
        timestamp: r.timestamp,
        speaker: r.speaker,
        mammaCatTurn: r.mammaCatTurn,
        text: r.lines.join(" "),
      }));
      const conversationCount = await getConversationCount(speaker);
      const isFirstConversation = conversationCount === 0;

      const request: DialogueRequest = {
        speaker,
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
        nearbyCat: nearNpcCat?.npcName,
      };

      const scripted = findUnplayedDialogueScript(NPC_DIALOGUE_SCRIPTS, request);
      let line = scripted?.response.lines[0]?.trim();

      if (!line) {
        if (!opts.aiAllowed) {
          renderFallback();
          return;
        }
        if (this.humanAiBubbleInFlight || !(scene.dialogueService instanceof FallbackDialogueService)) {
          renderFallback();
          return;
        }
        // Per-human cooldown is set immediately before the AI call so bursts
        // cannot spam the model, while pending scripted lines can still play
        // during the cooldown.
        this.humanAiBubbleInFlight = true;
        abort = new AbortController();
        this.humanAiBubbleAbort = abort;
        this.humanAiBubbleCooldownUntil.set(human, scene.time.now + HUMAN_AI_BUBBLE_COOLDOWN_MS);
        const response = await (scene.dialogueService as FallbackDialogueService).getDialogue(request, {
          timeoutMs: HUMAN_AI_BUBBLE_TIMEOUT_MS,
          signal: abort.signal,
        });
        line = response.lines[0]?.trim();
      }

      if (abort?.signal.aborted || !human.active || !human.visible || !this.isHumanCloseToMammaCat(human)) {
        return;
      }
      if (!line || line === "...") {
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
      const snapshotTrust = scene.trust.global;
      await storeConversation({
        speaker,
        timestamp: scene.dayNight.totalGameTimeMs,
        realTimestamp: Date.now(),
        gameDay: scene.dayNight.dayCount,
        lines: [line],
        trustBefore: snapshotTrust,
        trustAfter: snapshotTrust,
        chapter: scene.chapters.chapter,
        playerAction: "ambient_greeting",
        gameStateSnapshot: {
          trustWithSpeaker: snapshotTrust,
          trustGlobal: scene.trust.global,
          timeOfDay: scene.dayNight.currentPhase,
          hunger: scene.stats.hunger,
          thirst: scene.stats.thirst,
          energy: scene.stats.energy,
        },
      });
    } catch {
      renderFallback();
    } finally {
      if (abort) {
        this.humanAiBubbleInFlight = false;
        if (this.humanAiBubbleAbort === abort) this.humanAiBubbleAbort = null;
      }
    }
  }

  /** Pick a scripted line for a human greeting, honouring Camille's per-cat overrides. */
  private pickScriptedGreeting(human: HumanNPC, nearNpcCat: NPCCat | undefined): string {
    if (nearNpcCat && human.humanType === "camille") {
      const named = this.scene.camille.getPersonalLineForNamedCat(nearNpcCat.npcName);
      if (named) return named;
    }
    const lines = this.catPersonGreetings[human.humanType] ?? this.catPersonGreetings.feeder!;
    return lines[Math.floor(Math.random() * lines.length)]!;
  }

  private isHumanCloseToMammaCat(human: HumanNPC): boolean {
    return (
      Phaser.Math.Distance.Between(human.x, human.y, this.scene.player.x, this.scene.player.y) <=
      GP.CAT_PERSON_PLAYER_GREET_DIST
    );
  }

  /**
   * Debounced "Mamma Cat had a social moment with a human" scoring hook.
   * Fires at most once per {@link HUMAN_ENGAGEMENT_COOLDOWN_MS} window so
   * a multi-line paired beat counts as one engagement for the run-score
   * summary, matching the pre-refactor behaviour.
   */
  recordHumanEngagement(): void {
    const now = this.scene.time.now;
    if (now - this.lastHumanEngagementAt < HUMAN_ENGAGEMENT_COOLDOWN_MS) return;
    this.lastHumanEngagementAt = now;
    this.scene.scoring.recordHumanEngagement();
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
  renderHumanBubble(human: HumanNPC, line: string, opts?: { persistent?: boolean }): Phaser.GameObjects.Text {
    const scene = this.scene;
    const bubble = scene.add
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
      scene.tweens.add({
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
   * Back-compat wrapper for the ambient (auto-fading) bubble path. Kept
   * as a named helper so call sites read naturally at the greeting sites,
   * and so {@link CamilleEncounterSystem} can render Kish's "slow down"
   * aside through the same channel.
   */
  renderGreetingBubble(human: HumanNPC, line: string): void {
    this.renderHumanBubble(human, line);
  }

  /**
   * Chain-fired from `GameScene.shutdown()`. Aborts any in-flight AI
   * ambient-bubble fetch and clears the single-flight guard (see
   * {@link humanAiBubbleInFlight}). Without this, a scene restart
   * mid-fetch strands `humanAiBubbleInFlight=true` on the Phaser-reused
   * scene instance, blocking every ambient AI bubble after restart until
   * the orphaned fetch's `finally` runs.
   *
   * Does NOT destroy the roster sprites — Phaser handles scene-child
   * teardown; the roster array is simply truncated so a reused
   * `HumanPresenceSystem` instance would start empty after next create.
   */
  shutdown(): void {
    if (this.humanAiBubbleAbort) {
      this.humanAiBubbleAbort.abort();
      this.humanAiBubbleAbort = null;
    }
    this.humanAiBubbleInFlight = false;
    this.humansList.length = 0;
  }
}
