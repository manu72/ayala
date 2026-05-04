import Phaser from "phaser";
import type { NPCCat } from "../sprites/NPCCat";
import { StoryKeys } from "../registry/storyKeys";
import { GP, COLLAPSE_RECOVERY_MS } from "../config/gameplayConstants";
import type { GameScene } from "../scenes/GameScene";
import type { HUDScene } from "../scenes/HUDScene";

/**
 * Outcome of a single {@link CollapseSystem.tick}. The scene uses this
 * signal to decide whether to hand off to the game-over flow or keep
 * polling.
 *
 *   - `"continue"`    — normal scene update.
 *   - `"blackout"`    — Mamma Cat is mid-collapse: caller should pin
 *                       velocity to zero and short-circuit the rest of
 *                       `update()` (NPC + human ticks, input, etc.).
 *   - `"game_over"`   — recovery timer elapsed while `pendingGameOverReason`
 *                       was `"collapse"` (final life); caller should
 *                       invoke {@link GameScene.triggerGameOver}.
 */
export type CollapseTickOutcome = "continue" | "blackout" | "game_over";

/**
 * Owns the collapse → recovery → witness-narration state machine.
 *
 * The polling model (WORKING_MEMORY) keeps rising/falling-edge detection
 * in this one class: the scene calls {@link tick} each frame and reacts
 * to the returned signal. No emitters, no `delayedCall` timers.
 *
 * Invariants preserved from the pre-refactor scene:
 *  - Witness (nearest friendly NPC with LOS) is captured on the frame
 *    the collapse flag rises, stored by object ref. Re-checked at the
 *    moment of recovery for proximity — pre-teleport, because
 *    `setPosition(safeX, safeY)` would make the range check measure
 *    against the safe-sleep POI instead of the collapse location.
 *  - `wasCollapsed`, `collapseRecovering`, and `collapseRecoveryTimer`
 *    are all cleared on scene `shutdown()` so a Phaser-reused scene
 *    instance never carries stale state into the next run (WORKING_MEMORY
 *    "Scene Lifecycle — shutdown is NOT auto-wired").
 *  - COLLAPSE_COUNT registry writes use the same defensive integer
 *    normalisation as its peer counters (CATS_SNATCHED etc.) so a
 *    corrupt value can't propagate through autosave.
 */
export class CollapseSystem {
  private readonly scene: GameScene;
  private wasCollapsed = false;
  private collapseRecovering = false;
  private collapseRecoveryTimer = 0;
  private collapseWitness: NPCCat | null = null;

  constructor(scene: GameScene) {
    this.scene = scene;
  }

  /** Clear every transient flag. Called from {@link GameScene.create} and {@link GameScene.shutdown}. */
  resetTransient(): void {
    this.wasCollapsed = false;
    this.collapseRecovering = false;
    this.collapseRecoveryTimer = 0;
    this.collapseWitness = null;
  }

  /**
   * Drive one frame of the collapse state machine.
   *
   * @returns A {@link CollapseTickOutcome}. The scene short-circuits its
   *   own update when the result is `"blackout"`, and routes
   *   `"game_over"` into its existing {@link GameScene.triggerGameOver}
   *   path.
   */
  tick(delta: number): CollapseTickOutcome {
    const scene = this.scene;

    // Rising / falling edge detection — symmetric so a future end-of-
    // blackout hook has an obvious home.
    if (scene.stats.collapsed && !this.wasCollapsed) {
      this.onCollapsed();
    } else if (!scene.stats.collapsed && this.wasCollapsed) {
      this.onRecovered();
    }
    this.wasCollapsed = scene.stats.collapsed;

    if (!scene.stats.collapsed) return "continue";

    // Pins the player for the 3s blackout. Caller is expected to also
    // short-circuit the rest of `update()` (see returned "blackout").
    scene.player.setVelocity(0);
    if (!this.collapseRecovering) {
      this.collapseRecovering = true;
      this.collapseRecoveryTimer = 0;
    }
    this.collapseRecoveryTimer += delta;
    if (this.collapseRecoveryTimer < COLLAPSE_RECOVERY_MS) return "blackout";

    if (scene.pendingGameOverReason === "collapse") {
      scene.stats.resetCollapse();
      this.collapseRecovering = false;
      this.collapseRecoveryTimer = 0;
      return "game_over";
    }
    this.recoverFromCollapse();
    return "blackout";
  }

  /**
   * Rising-edge handler. Captures the collapse witness *now* (while the
   * player's position is still the collapse location) so a witness
   * who wanders off during the 3s blackout can still be credited at
   * recovery time.
   */
  private onCollapsed(): void {
    const scene = this.scene;
    this.collapseWitness = this.findCollapseWitness();

    const hud = scene.scene.get("HUDScene") as HUDScene | undefined;
    hud?.showNarration?.("You can't... go any further.");

    const finalLife = scene.loseLife();
    if (!finalLife) {
      scene.trust.collapsedInColony();
    } else {
      scene.pendingGameOverReason = "collapse";
    }

    // Defensive pre-increment normalisation — matches the peer counters
    // (CATS_SNATCHED, PLAYER_SNATCHED_COUNT). Treating negative,
    // fractional, or non-finite registry values as 0 prevents a corrupt
    // value from propagating forward (and then being persisted by the
    // next autosave, which reads `registry.get` directly without its
    // own validation).
    const prior = scene.registry.get(StoryKeys.COLLAPSE_COUNT);
    const priorCount = typeof prior === "number" && Number.isFinite(prior) && prior >= 0 ? Math.floor(prior) : 0;
    scene.registry.set(StoryKeys.COLLAPSE_COUNT, priorCount + 1);
  }

  /**
   * Falling-edge hook — intentionally a no-op. Recovery narration and
   * trust credit live in {@link recoverFromCollapse} because they depend
   * on witness range at the moment of teleport, not at the moment
   * `stats.collapsed` flips back to false.
   */
  private onRecovered(): void {
    // Deliberately empty; see class-level docstring.
  }

  /**
   * Find the nearest friendly NPC cat within narration-witness range
   * that has line-of-sight to the player. Returns `null` when nothing
   * qualifies.
   */
  private findCollapseWitness(): NPCCat | null {
    const scene = this.scene;
    let nearest: NPCCat | null = null;
    let nearestDist: number = GP.NARRATION_WITNESS_DIST;
    for (const { cat } of scene.npcs) {
      if (!cat.active) continue;
      if (cat.disposition !== "friendly") continue;
      const dist = Phaser.Math.Distance.Between(scene.player.x, scene.player.y, cat.x, cat.y);
      if (dist > nearestDist) continue;
      if (!scene.hasLineOfSight(scene.player.x, scene.player.y, cat.x, cat.y)) continue;
      nearest = cat;
      nearestDist = dist;
    }
    return nearest;
  }

  private recoverFromCollapse(): void {
    const scene = this.scene;
    const safeSleep = scene.map.findObject("spawns", (o) => o.name === "poi_safe_sleep");
    const safeX = safeSleep?.x ?? scene.map.widthInPixels / 2;
    const safeY = safeSleep?.y ?? scene.map.heightInPixels / 2;

    // Witness-aware recovery narration MUST be evaluated BEFORE the
    // teleport: if we measure witness distance after `setPosition(safeX,
    // safeY)`, we measure from the safe-sleep POI instead of the
    // collapse location. The player is velocity-pinned for the full
    // blackout, so `player.x/y` here still reflects the collapse spot.
    const witness = this.collapseWitness;
    const witnessStillHere =
      witness !== null &&
      witness.active &&
      Phaser.Math.Distance.Between(scene.player.x, scene.player.y, witness.x, witness.y) <= GP.NARRATION_WITNESS_DIST;

    scene.player.setPosition(safeX, safeY);
    scene.onCollapseTeleport(safeX, safeY);
    scene.stats.resetCollapse();
    this.collapseRecovering = false;
    this.collapseRecoveryTimer = 0;

    scene.cameras.main.flash(500, 0, 0, 0);

    const hud = scene.scene.get("HUDScene") as HUDScene | undefined;
    if (witnessStillHere && witness) {
      hud?.showNarration?.(`You wake. ${witness.npcName} stayed close.`);
      scene.trust.supportedDuringCollapse(witness.npcName);
      scene.syncTrustDisposition(witness.npcName);
    } else {
      hud?.showNarration?.("You wake. Safer ground.");
    }

    this.collapseWitness = null;
    scene.autoSave();
  }

  /** Chain-fired from {@link GameScene.shutdown}. */
  shutdown(): void {
    this.resetTransient();
  }
}
