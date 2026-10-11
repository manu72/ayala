import Phaser from "phaser";
import type { NPCCat } from "../sprites/NPCCat";
import type { GameScene } from "../scenes/GameScene";
import type { HUDScene } from "../scenes/HUDScene";
import type {
  DialogueResponse,
  SpeakerPose,
} from "../services/DialogueService";
import type { EmoteType } from "./EmoteSystem";
import { calculateRelationshipStage } from "../services/DialogueRelationship";
import { buildDialogueRecencyContext, readDialogueSeparation, type DialogueSeparation } from "../utils/dialogueRecency";
import { colonyIntroLine, getRandomColonyLine, newcomerLine } from "../data/cat-dialogue";
import { NEWCOMER_NAME_COMFORT } from "../utils/newcomerCat";
import { FallbackDialogueService } from "../services/FallbackDialogueService";
import { storeConversation, addNpcMemory, recordKind } from "../services/ConversationStore";
import {
  buildConversationRecord,
  loadNpcContext,
  milestoneMemory,
  talkMammaCatTurn,
  toConversationEntry,
  type NpcSceneSnapshot,
} from "../services/NpcContext";
import { GP } from "../config/gameplayConstants";
import { StoryKeys } from "../registry/storyKeys";
import { buildNpcStoryFacts } from "../utils/npcStoryFacts";

const DIALOGUE_BREAK_DISTANCE = GP.DIALOGUE_BREAK_DIST;
const INTERACTION_DISTANCE = GP.INTERACTION_DIST;

/**
 * Grace window (ms) after closing a cat dialogue during which
 * {@link CatDialogueController.isSkippedPartner} will keep suppressing
 * re-engagement even if the player is still standing within interaction
 * range. Cleared earlier when the player steps beyond
 * `INTERACTION_DISTANCE`. Matches the pre-refactor
 * `GameScene.LAST_PARTNER_HOLD_MS` exactly.
 */
const LAST_PARTNER_HOLD_MS = 1500;

/**
 * Canonical emote for each dialogue pose. Used both for the opening emote
 * shown when dialogue starts and to validate/normalise `response.emote` so
 * the closing emote can never contradict the pose (e.g. "heart" after a
 * hostile hiss). Previously a module-level const in `GameScene.ts`.
 */
const POSE_TO_EMOTE: Record<SpeakerPose, EmoteType> = {
  friendly: "heart",
  hostile: "hostile",
  wary: "alert",
  curious: "curious",
  submissive: "curious",
  sleeping: "sleep",
};

/**
 * Emotes that are inconsistent with a hostile pose. A cat mid-hiss must
 * never flash a heart or friendly cue: when the dialogue response pairs
 * one of these emotes with a hostile pose, we override the emote to stay
 * on-model.
 */
const POSITIVE_EMOTES: ReadonlySet<EmoteType> = new Set(["heart"]);

/** What Mamma Cat did while a cat told her a rumour or an egg story. */
const LISTENED_TURN = "Mamma Cat came over and listened.";

/**
 * Owns the full cat-dialogue lifecycle: engagement gating, AI request
 * orchestration, response rendering (emote + narration + lines), and the
 * post-close side effects (trust awards, registry flags, indicator
 * reveals, conversation + memory persistence, autosave on first meet).
 *
 * Engagement ends with the cat's own modal (its `onHide` hook); the scene
 * also calls {@link tickEngagement} each frame to break it off when the
 * player walks out of range or the NPC flees/disappears.
 *
 * Invariants preserved from pre-refactor:
 *  - `lastDialoguePartner` skip in {@link GameScene.tryInteract} prevents
 *    a single Space press from simultaneously closing the current dialogue
 *    and re-opening the next scripted response for the same NPC. The skip
 *    clears on range exit or after its short input grace window, allowing
 *    deliberate repeated engagement beside the same cat.
 *  - `dialogueRequestInFlight` deduplicates concurrent Space presses while
 *    the AI request is pending.
 *  - Hostile-pose + positive-emote response is normalised in-place so the
 *    closing emote emitted from {@link processResponse} can never land on
 *    "heart" after a hiss.
 *  - Witness-aware narration piggy-backs on the scene's
 *    {@link GameScene.narrateIfPerceivable}: source coords default to the
 *    cat's position so narration is filtered by distance + LOS the same
 *    way the ambient world narrates.
 */
export class CatDialogueController {
  private readonly scene: GameScene;
  private engagedDialogueNPC: NPCCat | null = null;
  private aiThinkingTimer: Phaser.Time.TimerEvent | null = null;
  private dialogueRequestInFlight = false;
  private lastDialoguePartner: NPCCat | null = null;
  private lastDialoguePartnerAt = 0;
  /**
   * Cancellation token for the currently in-flight LLM dialogue request.
   * Mirrors `HumanPresenceSystem.humanAiBubbleAbort` so scene shutdown /
   * transient reset aborts the fetch instead of letting it resolve and
   * race against post-reset state.
   */
  private requestAbort: AbortController | null = null;
  /** Completion of the engaged cat's open modal; a no-op until its last line has been shown. */
  private engagedDialogueDone: (() => void) | null = null;

  constructor(scene: GameScene) {
    this.scene = scene;
  }

  /**
   * Clear every transient flag. Called from {@link GameScene.create} and
   * {@link GameScene.shutdown}. Mid-pickup dialogue state (engaged NPC +
   * thinking timer) would otherwise carry into the next scene restart,
   * re-locking input the moment the save loads.
   */
  resetTransient(): void {
    if (this.engagedDialogueNPC) {
      this.engagedDialogueNPC.disengageDialogue();
      this.engagedDialogueNPC = null;
    }
    this.engagedDialogueDone = null;
    this.lastDialoguePartner = null;
    this.lastDialoguePartnerAt = 0;
    this.aiThinkingTimer?.remove(false);
    this.aiThinkingTimer = null;
    this.dialogueRequestInFlight = false;
    // Abort any in-flight LLM request so (a) shutdown doesn't waste
    // bandwidth waiting for a response we'd discard via the post-await
    // `!cat.active` gate, and (b) a future mid-session reset cannot let
    // a stale continuation mutate scene/UI state after this call
    // returns. Matches `HumanPresenceSystem.shutdown()` (sibling AI flow).
    // `FallbackDialogueService` distinguishes caller-aborts from internal
    // timeouts and rethrows the AbortError; `requestDialogue`'s catch
    // detects the aborted signal and bails without emitting the usual
    // "Words fail" fallback narration.
    if (this.requestAbort) {
      this.requestAbort.abort();
      this.requestAbort = null;
    }
  }

  /**
   * Poll the engagement state once per frame. Breaks engagement when the
   * player walks out of range / the NPC flees / the NPC sprite is destroyed;
   * the cat's modal closing releases it through its own `onHide`. Walking
   * off after the last line still completes the exchange.
   *
   * The input chaining guard and per-cat separation tracking are maintained
   * separately by {@link refreshLastPartner}.
   */
  tickEngagement(): void {
    const scene = this.scene;
    const cat = this.engagedDialogueNPC;
    if (!cat) return;
    const dist = Phaser.Math.Distance.Between(scene.player.x, scene.player.y, cat.x, cat.y);
    if (dist <= DIALOGUE_BREAK_DISTANCE && cat.state !== "fleeing" && cat.active) return;
    const done = this.engagedDialogueDone;
    scene.dialogue.dismiss();
    if (cat.active) done?.();
  }

  /**
   * Track each named cat's departure/reunion and decide if the "just spoke"
   * input guard should clear. Called by the scene's NPC update loop for
   * every tracked cat. The input guard keeps its existing behaviour —
   * clear when the player is more than `INTERACTION_DISTANCE` px away
   * OR `LAST_PARTNER_HOLD_MS` has elapsed since the dialogue closed,
   * whichever happens first.
   */
  refreshLastPartner(cat: NPCCat, dist: number, now: number): void {
    // Use the wider break radius so moving around beside a cat does not
    // manufacture a new visit. This also observes cats other than the last partner.
    if (!cat.npcName.startsWith("Colony Cat")) {
      const separation = this.getSeparation(cat);
      if (dist > DIALOGUE_BREAK_DISTANCE && (!separation || separation.returnedAt)) {
        this.setSeparation(cat, {
          departedAt: { timestamp: this.scene.dayNight.totalGameTimeMs, gameDay: this.scene.dayNight.dayCount },
        });
      } else if (dist <= INTERACTION_DISTANCE && separation && !separation.returnedAt) {
        this.setSeparation(cat, {
          ...separation,
          returnedAt: { timestamp: this.scene.dayNight.totalGameTimeMs, gameDay: this.scene.dayNight.dayCount },
        });
      }
    }
    if (this.lastDialoguePartner !== cat) return;
    const elapsed = now - this.lastDialoguePartnerAt;
    if (dist > INTERACTION_DISTANCE || elapsed >= LAST_PARTNER_HOLD_MS) {
      this.lastDialoguePartner = null;
      this.lastDialoguePartnerAt = 0;
    }
  }

  private getSeparation(cat: NPCCat): DialogueSeparation | undefined {
    const saved: unknown = this.scene.registry.get(StoryKeys.CAT_DIALOGUE_SEPARATIONS);
    if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return undefined;
    return readDialogueSeparation(
      (saved as Record<string, unknown>)[cat.npcName],
      this.scene.dayNight.totalGameTimeMs,
      this.scene.dayNight.dayCount,
    );
  }

  /** Keep the encounter state with the saved game clock, including consumed acknowledgements. */
  private setSeparation(cat: NPCCat, separation?: DialogueSeparation): void {
    if (cat.npcName.startsWith("Colony Cat")) return;
    const raw: unknown = this.scene.registry.get(StoryKeys.CAT_DIALOGUE_SEPARATIONS);
    const saved: Record<string, unknown> = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? { ...raw } : {};
    if (separation) saved[cat.npcName] = separation;
    else delete saved[cat.npcName];
    this.scene.registry.set(StoryKeys.CAT_DIALOGUE_SEPARATIONS, saved);
  }

  /** Skip target for {@link GameScene.tryInteract}'s nearest-cat search. */
  isSkippedPartner(cat: NPCCat): boolean {
    return cat === this.lastDialoguePartner;
  }

  /** Diagnostic accessor used by `logInteractDiag`. */
  get lastPartnerName(): string | null {
    return this.lastDialoguePartner?.npcName ?? null;
  }

  /**
   * Clear the chaining guard if it points at the given cat. Called from
   * {@link GameScene.removeColonyCat} when a snatcher captures the cat we
   * just talked to, so the guard can't outlive the destroyed sprite.
   */
  clearPartnerIfMatches(cat: NPCCat): void {
    this.setSeparation(cat);
    if (this.lastDialoguePartner === cat) {
      this.lastDialoguePartner = null;
      this.lastDialoguePartnerAt = 0;
    }
  }

  /** Entry point from {@link GameScene.tryInteract}. */
  show(cat: NPCCat): void {
    const name = cat.npcName;
    const scene = this.scene;

    // Colony cats use a scripted dialogue pool (no AI). The
    // dumped-pet-comfort credit is a narrative hook that lives in
    // ColonyDynamicsSystem; we pass through so the first Space-interact
    // with a dumped cat still awards its comfort trust bump.
    if (name.startsWith("Colony Cat")) {
      scene.colony.tryCreditDumpedPetComfort(cat);
      // A dumped pet that hasn't found its feet bears it (and a little better each time); it gives its name once it's half settled.
      const comfort = scene.colony.newcomers.greet(cat);
      // Greeting a colony cat teaches Mamma Cat its name, for good.
      const learned = comfort === null || comfort >= NEWCOMER_NAME_COMFORT ? scene.colony.learnName(cat) : null;
      const line = learned?.isNew ? colonyIntroLine(learned.name) : comfort !== null ? newcomerLine(comfort) : getRandomColonyLine(learned?.name);
      scene.dialogue.show([line]);
      // Arm the anti-chain guard. Phaser delivers key events before
      // `update()`, so without this the same Space press that closes this
      // scripted line can re-enter `tryInteract` on the next frame and
      // fire another colony line for the same cat (see the note in
      // `GameScene.tryInteract` where `isSkippedPartner` is consulted).
      // The named-cat path sets these fields from the `dialogue.show`
      // close callback, but `dialogue.show([line])` is called with no
      // `onComplete` here, so we arm the guard synchronously at show
      // time — tryInteract is gated on `!dialogue.isActive` upstream,
      // so the guard only matters after this dialogue closes.
      this.lastDialoguePartner = cat;
      this.lastDialoguePartnerAt = scene.time.now;
      return;
    }

    // A story or rumour she hasn't heard takes this press (scripted, no trust); her usual conversation is the next one.
    const story = scene.eggs?.catStory(name) ?? scene.curiosity?.rumour(name);
    if (story) {
      this.setSeparation(cat);
      // engaged like the AI path: the cat stays put, and tickEngagement breaks it off if she walks away
      cat.engageDialogue(scene.player.x, scene.player.y, "curious");
      scene.player.faceToward(cat.x, cat.y);
      this.engagedDialogueNPC = cat;
      scene.emotes.show(scene, cat, "curious");
      const snapshot = this.sceneSnapshot();
      // Heard out, it is told for good and remembered together; closed early, it plays again next press.
      this.showEngaged(cat, story.lines, () => {
        story.heard();
        this.storeStoryLines(name, story.lines, LISTENED_TURN, snapshot);
      });
      return;
    }

    void this.requestDialogue(cat).catch(() => {
      // Errors are logged and cleaned up inside requestDialogue.
    });
  }

  /** Chain-fired from {@link GameScene.shutdown}. */
  shutdown(): void {
    this.resetTransient();
  }

  /**
   * Request dialogue from the DialogueService, show it, and process the
   * response events on completion. Conversation is stored in IndexedDB.
   */
  private async requestDialogue(cat: NPCCat): Promise<void> {
    if (this.dialogueRequestInFlight) return;
    const scene = this.scene;
    this.dialogueRequestInFlight = true;
    const abort = new AbortController();
    this.requestAbort = abort;
    this.aiThinkingTimer = scene.time.delayedCall(400, () => {
      if (abort.signal.aborted || !this.dialogueRequestInFlight) return;
      scene.emotes.show(scene, cat, "curious");
    });

    try {
      const name = cat.npcName;
      const trustBefore = scene.trust.getCatTrust(name);
      // Persisted records reflect dialogue-open, not dialogue-close (the
      // close may come many seconds later, on a different in-game day).
      const snapshot: NpcSceneSnapshot = { ...this.sceneSnapshot(), trustBefore };

      const context = await loadNpcContext(name, snapshot);
      if (abort.signal.aborted) return;
      // Scripted branches see every engaged talk, unfiltered: filtering by the
      // clock could replay a first meeting or warmup after a save rollback.
      const talks = context.records.filter((r) => recordKind(r) === "talk");
      const isFirstConversation = talks.length === 0;

      const request = {
        speaker: name,
        speakerType: "cat" as const,
        target: "Mamma Cat",
        interaction: "talk" as const,
        gameState: {
          chapter: snapshot.chapter,
          timeOfDay: snapshot.timeOfDay,
          trustWithSpeaker: trustBefore,
          hunger: snapshot.hunger,
          thirst: snapshot.thirst,
          energy: snapshot.energy,
          daysSurvived: snapshot.gameDay,
          knownCats: Array.from(scene.knownCats),
          recentEvents: buildNpcStoryFacts(name, "cat", scene.registry, snapshot.gameDay),
        },
        conversationHistory: talks.map(toConversationEntry),
        promptConversationHistory: context.promptRecords.map(toConversationEntry),
        isFirstConversation,
        relationshipStage: calculateRelationshipStage({
          isFirstConversation,
          conversationCount: talks.length,
          trustWithSpeaker: trustBefore,
          memories: context.memories,
        }),
        npcMemories: context.memories,
        conversationRecency: buildDialogueRecencyContext({
          history: context.promptRecords,
          nowGameTimestamp: snapshot.timestamp,
          currentGameDay: snapshot.gameDay,
          separation: this.getSeparation(cat),
        }),
      };

      // Pass the abort signal through when the concrete service supports
      // it (FallbackDialogueService does; the base DialogueService interface
      // does not). Matches the pattern used by HumanPresenceSystem's
      // ambient human-bubble flow, so shutdown cleanly cancels the fetch.
      const response =
        scene.dialogueService instanceof FallbackDialogueService
          ? await scene.dialogueService.getDialogue(request, { signal: abort.signal })
          : await scene.dialogueService.getDialogue(request);

      // Revalidate after async gap: controller may have been reset (scene
      // shutdown or a future mid-session reset), cat may have fled or
      // another dialogue opened, the player may have walked out of range,
      // or line-of-sight may have been lost (e.g. they slipped behind an
      // obstacle). Failing any of these checks means engaging would feel
      // teleport-y, so we bail quietly. A story moment that froze input
      // (the beat-5 walk home, the Chapter-6 fade) also drops the reply.
      if (abort.signal.aborted || scene.playerInputFrozen) return;
      if (scene.dialogue.isActive || cat.state === "fleeing" || !cat.active) return;
      const distToCat = Phaser.Math.Distance.Between(scene.player.x, scene.player.y, cat.x, cat.y);
      if (distToCat > DIALOGUE_BREAK_DISTANCE) return;
      if (!scene.hasLineOfSight(scene.player.x, scene.player.y, cat.x, cat.y)) return;

      // Only the first displayed exchange of a visit may acknowledge a meaningful
      // return. Failed or discarded requests leave that opportunity available.
      this.setSeparation(cat);
      cat.engageDialogue(scene.player.x, scene.player.y, response.speakerPose);
      scene.player.faceToward(cat.x, cat.y);
      this.engagedDialogueNPC = cat;

      // Normalise the response so the closing emote can never contradict
      // the opening pose (e.g. a hostile hiss must not end on a heart).
      // We mutate in place so processResponse at dialogue-close uses the
      // corrected value.
      if (response.speakerPose === "hostile" && response.emote) {
        if (POSITIVE_EMOTES.has(response.emote as EmoteType)) {
          response.emote = POSE_TO_EMOTE.hostile;
        }
      }

      if (response.speakerPose) {
        scene.emotes.show(scene, cat, POSE_TO_EMOTE[response.speakerPose]);

        // A hostile pose is the dialogue-time "hissing" signal. Play the
        // growl cue exactly once alongside the opening emote so the audio
        // and visual land together; AudioSystem rate-limits further plays.
        if (response.speakerPose === "hostile") {
          scene.audio.playCatGrowl();
        }
      }

      if (response.narration) {
        scene.narrateIfPerceivable(response.narration, { x: cat.x, y: cat.y });
      }

      this.showEngaged(cat, response.lines, () => this.processResponse(cat, name, snapshot, response));
    } catch (err) {
      // Caller-initiated aborts (our `resetTransient` fired during scene
      // shutdown or a reset) rethrow as AbortError from
      // FallbackDialogueService. Treat them as a silent bail: do NOT log,
      // touch cat state, dismiss other dialogues, or emit the fallback
      // HUD narration — the scene is tearing down around us and all of
      // those would be misleading or actively harmful.
      const isAbort =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");
      if (isAbort && abort.signal.aborted) {
        return;
      }
      console.error("[CatDialogueController] requestDialogue failed:", err);
      // Only disengage + dismiss the dialogue if WE own the engagement. The
      // error may have fired BEFORE `engageDialogue` (e.g. during the
      // IndexedDB history lookup or the `dialogueService.getDialogue` call),
      // in which case this cat is still in whatever state its own state
      // machine put it in — wandering, sleeping, fleeing, alert — and
      // `NPCCat.disengageDialogue()` unconditionally calls `enterState("idle")`,
      // which would yank the cat out of that state. The scene-level
      // dialogue.dismiss() carries the same "only if we own it" caveat
      // (a concurrent UI path could be showing something unrelated).
      if (this.engagedDialogueNPC === cat) {
        cat.disengageDialogue();
        this.engagedDialogueNPC = null;
        if (this.scene.dialogue.isActive) {
          this.scene.dialogue.dismiss();
        }
      }
      const hud = this.scene.scene.get("HUDScene") as HUDScene | undefined;
      hud?.showNarration("Words fail. The moment passes.");
    } finally {
      this.aiThinkingTimer?.remove(false);
      this.aiThinkingTimer = null;
      this.dialogueRequestInFlight = false;
      // Only clear the slot if we still own it. `resetTransient()` nulls
      // `requestAbort` eagerly, and a subsequent request could have
      // claimed the slot; don't stomp on it.
      if (this.requestAbort === abort) {
        this.requestAbort = null;
      }
    }
  }

  /**
   * Handle all side effects from a completed dialogue: trust awards,
   * registry updates, indicator reveals, disposition changes,
   * conversation storage, and auto-saves.
   */
  private processResponse(
    cat: NPCCat,
    catName: string,
    snapshot: NpcSceneSnapshot,
    response: DialogueResponse,
  ): void {
    const scene = this.scene;
    if (response.emote) {
      scene.emotes.show(scene, cat, response.emote as EmoteType);
    }

    const event = response.event;
    const isFirst = event ? event.endsWith("_first") : false;

    if (event) {
      if (isFirst) {
        scene.addKnownCat(catName);
        scene.npcs.find((e) => e.cat === cat)?.indicator.reveal();
        this.awardFirstConversation(catName);
      } else if (event.endsWith("_return") || event.endsWith("_warmup")) {
        this.awardReturnConversation(catName);
      }

      switch (event) {
        case "blacky_first":
          scene.registry.set("MET_BLACKY", true);
          break;
        case "tiger_first":
          scene.registry.set("TIGER_TALKS", 1);
          break;
        case "tiger_warmup":
          scene.registry.set("TIGER_TALKS", 2);
          cat.disposition = "friendly";
          scene.npcs.find((e) => e.cat === cat)?.indicator.setDisposition("friendly");
          break;
        case "jayco_first":
          scene.registry.set("JAYCO_TALKS", 1);
          cat.disposition = "friendly";
          {
            const entry = scene.npcs.find((e) => e.cat === cat);
            entry?.indicator.setDisposition("friendly");
          }
          break;
        case "jaycojr_first":
          scene.registry.set("JAYCO_JR_TALKS", 1);
          break;
        case "fluffy_first":
          scene.registry.set("FLUFFY_TALKS", 1);
          break;
        case "pedigree_first":
          scene.registry.set("PEDIGREE_TALKS", 1);
          break;
        case "ginger_first":
          scene.registry.set("MET_GINGER_A", true);
          break;
        case "gingerb_first":
          scene.registry.set("MET_GINGER_B", true);
          break;
      }
    }

    // Persist after trust awards so trustAfter matches gameplay state. A
    // placeholder is a stand-in for words the cat never said: not stored.
    if (!response.placeholder) {
      void storeConversation(
        buildConversationRecord(
          { ...snapshot, trustAfter: scene.trust.getCatTrust(catName) },
          { speaker: catName, kind: "talk", lines: response.lines, mammaCatTurn: talkMammaCatTurn(snapshot) },
        ),
      );
    }
    if (response.memoryNote) {
      void addNpcMemory(catName, {
        kind: response.memoryNote.kind,
        label: response.memoryNote.label,
        value: response.memoryNote.value,
        source: "ai",
        gameDay: snapshot.gameDay,
        timestamp: snapshot.timestamp,
      });
    }
    const milestone = milestoneMemory(event, snapshot);
    if (milestone) void addNpcMemory(catName, milestone);

    if (isFirst) {
      scene.autoSave();
    }
  }

  /**
   * Store a named cat's authored story lines (a rumour, an egg story, Jayco's
   * steps) once Mamma Cat has heard them. Story records feed the cat's prompt
   * history but never count as talks, so they can't move her scripts on.
   */
  storeStoryLines(speaker: string, lines: string[], mammaCatTurn: string, at = this.sceneSnapshot()): void {
    void storeConversation(buildConversationRecord(at, { speaker, kind: "story", lines, mammaCatTurn }));
  }

  /** The scene now, for a persisted record (no trust: callers add the cat's). */
  private sceneSnapshot(): NpcSceneSnapshot {
    const scene = this.scene;
    return {
      timestamp: scene.dayNight.totalGameTimeMs,
      realTimestamp: Date.now(),
      gameDay: scene.dayNight.dayCount,
      chapter: scene.chapters.chapter,
      timeOfDay: scene.dayNight.currentPhase,
      hunger: scene.stats.hunger,
      thirst: scene.stats.thirst,
      energy: scene.stats.energy,
    };
  }

  /**
   * Show an engaged cat's lines. Engagement ends with this modal, never with
   * another system's. Reading the last line finishes the exchange (awards,
   * persistence) even if the player then closes the box or walks off; closing
   * before it leaves nothing behind. Programmatic dismissals (scene teardown,
   * story cut-ins) never finish it.
   */
  private showEngaged(cat: NPCCat, lines: string[], onDone: () => void): void {
    const scene = this.scene;
    let lastShown = -1;
    const done = (): void => {
      if (lastShown < lines.length - 1) return;
      this.lastDialoguePartner = cat;
      this.lastDialoguePartnerAt = scene.time.now;
      onDone();
    };
    this.engagedDialogueDone = done;
    scene.dialogue.show(lines, done, {
      completeOnClose: true,
      onLineShown: (index) => {
        lastShown = index;
      },
      onHide: () => {
        if (this.engagedDialogueNPC === cat) {
          cat.disengageDialogue();
          this.engagedDialogueNPC = null;
        }
        this.engagedDialogueDone = null;
      },
    });
  }

  private awardFirstConversation(catName: string): void {
    this.scene.trust.firstConversation(catName);
    this.scene.syncTrustDisposition(catName);
  }

  private awardReturnConversation(catName: string): void {
    this.scene.trust.returnConversation(catName);
    this.scene.syncTrustDisposition(catName);
  }
}
