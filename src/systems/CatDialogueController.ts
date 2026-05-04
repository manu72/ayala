import Phaser from "phaser";
import type { NPCCat } from "../sprites/NPCCat";
import type { GameScene } from "../scenes/GameScene";
import type { HUDScene } from "../scenes/HUDScene";
import type {
  DialogueResponse,
  ConversationEntry,
  SpeakerPose,
} from "../services/DialogueService";
import type { EmoteType } from "./EmoteSystem";
import { calculateRelationshipStage } from "../services/DialogueRelationship";
import { buildDialogueRecencyContext } from "../utils/dialogueRecency";
import { getRandomColonyLine } from "../data/cat-dialogue";
import {
  storeConversation,
  getRecentConversations,
  getConversationCount,
  getNpcMemories,
  addNpcMemory,
} from "../services/ConversationStore";
import { GP } from "../config/gameplayConstants";

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

/**
 * Frozen copy of the world state at the moment a cat dialogue is requested.
 * Forwarded to {@link storeConversation} and {@link addNpcMemory} so the
 * persisted record reflects conditions at dialogue-open, not at
 * dialogue-close (the close fires from a user-driven Space press that may
 * be many seconds later and on a different in-game day).
 */
interface CatDialoguePersistenceSnapshot {
  timestamp: number;
  realTimestamp: number;
  gameDay: number;
  chapter: number;
  timeOfDay: string;
  hunger: number;
  thirst: number;
  energy: number;
  trustBefore: number;
}

/**
 * Owns the full cat-dialogue lifecycle: engagement gating, AI request
 * orchestration, response rendering (emote + narration + lines), and the
 * post-close side effects (trust awards, registry flags, indicator
 * reveals, conversation + memory persistence, autosave on first meet).
 *
 * Polling model (WORKING_MEMORY): the scene calls
 * {@link tickEngagement} each frame to release the engaged NPC when
 * dialogue closes, the player walks out of range, or the NPC flees/
 * disappears. No Phaser event emitters, no listener lifecycle.
 *
 * Invariants preserved from pre-refactor:
 *  - `lastDialoguePartner` skip in {@link GameScene.tryInteract} prevents
 *    a single Space press from simultaneously closing the current dialogue
 *    and re-opening the next scripted response for the same NPC. The skip
 *    is re-armed every frame the player stays in range (see
 *    {@link tickEngagementAndNearestCheck}) so chaining only clears when
 *    the player actually steps away.
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
    this.lastDialoguePartner = null;
    this.lastDialoguePartnerAt = 0;
    this.aiThinkingTimer?.remove(false);
    this.aiThinkingTimer = null;
    this.dialogueRequestInFlight = false;
  }

  /**
   * Poll the engagement state once per frame. Releases the engaged NPC
   * when the dialogue box closes, or breaks engagement when the player
   * walks out of range / the NPC flees / the NPC sprite is destroyed.
   *
   * Also clears {@link lastDialoguePartner} once the player has moved
   * beyond {@link DIALOGUE_BREAK_DISTANCE}, so the chaining guard only
   * prevents the same-frame re-open, not a deliberate re-engagement.
   */
  tickEngagement(): void {
    const scene = this.scene;
    if (this.engagedDialogueNPC && !scene.dialogue.isActive) {
      this.engagedDialogueNPC.disengageDialogue();
      this.engagedDialogueNPC = null;
      return;
    }
    if (this.engagedDialogueNPC && scene.dialogue.isActive) {
      const cat = this.engagedDialogueNPC;
      const dist = Phaser.Math.Distance.Between(scene.player.x, scene.player.y, cat.x, cat.y);
      const broken = dist > DIALOGUE_BREAK_DISTANCE || cat.state === "fleeing" || !cat.active;
      if (broken) {
        scene.dialogue.dismiss();
        cat.disengageDialogue();
        this.engagedDialogueNPC = null;
      }
    }
  }

  /**
   * Decide if the "just spoke to this NPC" skip should clear for the
   * given cat on this frame. Called by the scene's NPC update loop for
   * every tracked cat; mirrors the pre-refactor behaviour exactly —
   * clear when the player is more than `INTERACTION_DISTANCE` px away
   * OR `LAST_PARTNER_HOLD_MS` has elapsed since the dialogue closed,
   * whichever happens first.
   */
  refreshLastPartner(cat: NPCCat, dist: number, now: number): void {
    if (this.lastDialoguePartner !== cat) return;
    const elapsed = now - this.lastDialoguePartnerAt;
    if (dist > INTERACTION_DISTANCE || elapsed >= LAST_PARTNER_HOLD_MS) {
      this.lastDialoguePartner = null;
      this.lastDialoguePartnerAt = 0;
    }
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
      scene.dialogue.show([getRandomColonyLine()]);
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
    this.aiThinkingTimer = scene.time.delayedCall(400, () => {
      if (!this.dialogueRequestInFlight) return;
      scene.emotes.show(scene, cat, "curious");
    });

    try {
      const name = cat.npcName;
      const trustBefore = scene.trust.getCatTrust(name);
      const persistenceSnapshot: CatDialoguePersistenceSnapshot = {
        timestamp: scene.dayNight.totalGameTimeMs,
        realTimestamp: Date.now(),
        gameDay: scene.dayNight.dayCount,
        chapter: scene.chapters.chapter,
        timeOfDay: scene.dayNight.currentPhase,
        hunger: scene.stats.hunger,
        thirst: scene.stats.thirst,
        energy: scene.stats.energy,
        trustBefore,
      };

      const [history, conversationCount, npcMemories] = await Promise.all([
        getRecentConversations(name, 10),
        getConversationCount(name),
        getNpcMemories(name, 20),
      ]);
      const conversationHistory: ConversationEntry[] = history.map((r) => ({
        timestamp: r.timestamp,
        speaker: r.speaker,
        mammaCatTurn: r.mammaCatTurn,
        text: r.lines.join(" "),
      }));
      const lastConversation = history.length > 0 ? history[history.length - 1]! : null;
      const gameDaysSinceLastTalk = lastConversation
        ? Math.max(0, scene.dayNight.dayCount - lastConversation.gameDay)
        : undefined;
      const conversationRecency = buildDialogueRecencyContext({
        history,
        nowRealTimestamp: Date.now(),
        nowGameTimestamp: scene.dayNight.totalGameTimeMs,
        currentGameDay: scene.dayNight.dayCount,
      });
      const isFirstConversation = conversationCount === 0;

      const request = {
        speaker: name,
        speakerType: "cat" as const,
        target: "Mamma Cat",
        gameState: {
          chapter: persistenceSnapshot.chapter,
          timeOfDay: persistenceSnapshot.timeOfDay,
          trustGlobal: scene.trust.global,
          trustWithSpeaker: persistenceSnapshot.trustBefore,
          hunger: persistenceSnapshot.hunger,
          thirst: persistenceSnapshot.thirst,
          energy: persistenceSnapshot.energy,
          daysSurvived: persistenceSnapshot.gameDay,
          knownCats: Array.from(scene.knownCats),
          recentEvents: this.buildRecentDialogueEvents(lastConversation, gameDaysSinceLastTalk),
        },
        conversationHistory,
        isFirstConversation,
        relationshipStage: calculateRelationshipStage({
          isFirstConversation,
          conversationCount,
          trustWithSpeaker: trustBefore,
          memories: npcMemories,
        }),
        npcMemories,
        gameDaysSinceLastTalk,
        conversationRecency,
      };

      const response = await scene.dialogueService.getDialogue(request);

      // Revalidate after async gap: cat may have fled or another dialogue
      // opened, the player may have walked out of range, or line-of-sight
      // may have been lost (e.g. they slipped behind an obstacle). Failing
      // any of these checks means engaging would feel teleport-y, so we
      // bail quietly.
      if (scene.dialogue.isActive || cat.state === "fleeing" || !cat.active) return;
      const distToCat = Phaser.Math.Distance.Between(scene.player.x, scene.player.y, cat.x, cat.y);
      if (distToCat > DIALOGUE_BREAK_DISTANCE) return;
      if (!scene.hasLineOfSight(scene.player.x, scene.player.y, cat.x, cat.y)) return;

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

      scene.dialogue.show(response.lines, () => {
        cat.disengageDialogue();
        this.engagedDialogueNPC = null;
        this.lastDialoguePartner = cat;
        this.lastDialoguePartnerAt = scene.time.now;
        this.processResponse(cat, name, persistenceSnapshot, response);
      });
    } catch (err) {
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
    snapshot: CatDialoguePersistenceSnapshot,
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

    // Persist after trust awards so trustAfter matches gameplay state.
    const mammaCatTurn = this.buildMammaCatTurnForMemory(catName, snapshot, response.mammaCatCue);
    void storeConversation({
      speaker: catName,
      timestamp: snapshot.timestamp,
      realTimestamp: snapshot.realTimestamp,
      gameDay: snapshot.gameDay,
      mammaCatTurn,
      lines: response.lines,
      trustBefore: snapshot.trustBefore,
      trustAfter: scene.trust.getCatTrust(catName),
      chapter: snapshot.chapter,
      gameStateSnapshot: {
        trustWithSpeaker: scene.trust.getCatTrust(catName),
        trustGlobal: scene.trust.global,
        timeOfDay: snapshot.timeOfDay,
        hunger: snapshot.hunger,
        thirst: snapshot.thirst,
        energy: snapshot.energy,
      },
    });
    if (response.memoryNote) {
      void addNpcMemory(catName, {
        kind: response.memoryNote.kind,
        label: response.memoryNote.label,
        value: response.memoryNote.value,
        source: "ai",
        gameDay: snapshot.gameDay,
      });
    }
    if (event) {
      void addNpcMemory(catName, {
        kind: "event",
        label: isFirst ? "first_meeting" : event,
        value: isFirst
          ? `Met Mamma Cat on day ${snapshot.gameDay} at ${snapshot.timeOfDay}.`
          : `Shared a ${event.replace(/_/g, " ")} exchange on day ${snapshot.gameDay}.`,
        source: "scripted",
        gameDay: snapshot.gameDay,
      });
    }

    if (isFirst) {
      scene.autoSave();
    }
  }

  private buildRecentDialogueEvents(
    lastConversation: { gameDay: number } | null,
    gameDaysSinceLastTalk: number | undefined,
  ): string[] {
    if (!lastConversation || gameDaysSinceLastTalk === undefined) return [];
    if (gameDaysSinceLastTalk === 0) return ["Mamma Cat already spoke with this NPC today."];
    if (gameDaysSinceLastTalk === 1) return ["Mamma Cat last spoke with this NPC yesterday."];
    return [`Mamma Cat last spoke with this NPC ${gameDaysSinceLastTalk} game days ago.`];
  }

  private buildMammaCatTurnForMemory(
    catName: string,
    snapshot: CatDialoguePersistenceSnapshot,
    mammaCatCue?: string,
  ): string {
    const base = [
      `Mamma Cat approaches ${catName} during ${snapshot.timeOfDay}.`,
      `Her hunger is ${snapshot.hunger}, thirst is ${snapshot.thirst}, and energy is ${snapshot.energy}.`,
      `Trust with ${catName} before this exchange is ${snapshot.trustBefore}.`,
    ].join(" ");
    return mammaCatCue ? `${base} ${mammaCatCue}` : base;
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
