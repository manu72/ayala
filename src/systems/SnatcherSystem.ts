import Phaser from "phaser";
import type { GameScene } from "../scenes/GameScene";
import type { HUDScene } from "../scenes/HUDScene";
import { HumanNPC, type HumanConfig } from "../sprites/HumanNPC";
import { NPCCat } from "../sprites/NPCCat";
import { StoryKeys } from "../registry/storyKeys";
import { GP } from "../config/gameplayConstants";
import { SaveSystem } from "./SaveSystem";
import { markSnatchedThisNight } from "../utils/snatcherNightState";
import { markGameOver } from "../utils/gameOverState";
import {
  resolveSnatcherSpawnAction,
  type SnatcherSpawnAction,
  type SnatcherSpawnInput,
} from "../utils/snatcherSpawnLogic";
import type { NavigationGrid } from "../utils/humanRoutePath";

/**
 * Re-export of the pure spawn-action resolver so tests and call sites
 * that historically imported `resolveSnatcherSpawnAction` from this
 * module keep working.
 */
export { resolveSnatcherSpawnAction, type SnatcherSpawnAction, type SnatcherSpawnInput };

const PLAYER_CAPTURE_RANGE = 16;
const COLONY_CAT_CAPTURE_RANGE = 16;

/**
 * Owns nightly snatcher spawn/detect/capture and the colony-cat grab
 * sweep. State that was previously scattered on `GameScene` (`snatchers`,
 * `snatcherSpawnChecked`, `snatchedThisNight`) lives here; the scene
 * polls {@link updateSpawnCheck} from the 5s chapter block and
 * {@link checkDetection} from its night branch in `updateHumans`.
 *
 * Phase 4.5 witness gates (proximity + `hasLineOfSight`) re-checked at
 * reveal sites — see WORKING_MEMORY "Scripted reveal sequences need a
 * second witness gate" lesson.
 */
export class SnatcherSystem {
  private readonly scene: GameScene;
  private readonly snatchersList: HumanNPC[] = [];
  private spawnChecked = false;
  private snatchedThisNightFlag = false;

  constructor(scene: GameScene) {
    this.scene = scene;
  }

  get activeSnatchers(): ReadonlyArray<HumanNPC> {
    return this.snatchersList;
  }

  get hasAnyActive(): boolean {
    return this.snatchersList.length > 0;
  }

  get snatchedThisNight(): boolean {
    return this.snatchedThisNightFlag;
  }

  set snatchedThisNight(value: boolean) {
    this.snatchedThisNightFlag = value;
  }

  /**
   * Polled from the 5s chapter-check block in {@link GameScene.update}.
   * Uses {@link resolveSnatcherSpawnAction} to decide whether this
   * evaluation should (a) skip because it's not night, (b) skip
   * because already evaluated this night, (c) defer because the player
   * is resting at shelter and the first-sighting must be perceivable,
   * (d) fire the scripted first-sighting beat, or (e) roll a random
   * nightly spawn.
   */
  updateSpawnCheck(): void {
    const action = resolveSnatcherSpawnAction({
      isNight: this.scene.dayNight.currentPhase === "night",
      snatcherSpawnChecked: this.spawnChecked,
      firstSnatcherSeen: this.scene.registry.get(StoryKeys.FIRST_SNATCHER_SEEN) as boolean | undefined,
      chapter: this.scene.chapters.chapter,
      isResting: this.scene.player.isResting,
      isNearShelter: this.scene.isNearShelter(this.scene.player.x, this.scene.player.y),
    });

    if (action.type === "not_night") {
      this.spawnChecked = false;
      this.despawnAll();
      return;
    }
    if (action.type === "already_checked") return;
    if (action.type === "defer_first_sighting") return;

    if (action.type === "first_sighting") {
      this.spawnChecked = true;
      this.playFirstSnatcherSighting();
      return;
    }

    this.spawnChecked = true;
    if (Math.random() > 0.4) return;
    const snatcherCount = 1 + (Math.random() > 0.5 ? 1 : 0);
    const navigationGrid = this.scene.createHumanNavigationGrid();
    for (let i = 0; i < snatcherCount; i++) {
      this.spawnSnatcher(i, false, navigationGrid);
    }
  }

  /**
   * Sweep for colony cats (named or unnamed) inside a snatcher's grab
   * range, and the player's. Called from the night branch in
   * {@link GameScene.updateHumans}.
   *
   * Eligibility rules (mirror Mamma Cat's shelter-immunity rule):
   *   - Cat must be `active`.
   *   - Cats sleeping *near a shelter POI* are immune (didn't get
   *     ambushed — the narrative "safe sleeping spot" protection that
   *     Mamma Cat also enjoys). Cats sleeping elsewhere are vulnerable
   *     — the "didn't wake from rest in time" case.
   *   - Named cats are NOT automatically immune; geography keeps
   *     named-cat snatches rare in practice.
   */
  checkDetection(): void {
    if (this.snatchersList.length === 0) return;

    const colonyVictims: NPCCat[] = [];

    for (const snatcher of this.snatchersList) {
      if (!snatcher.visible) continue;

      for (const { cat } of this.scene.npcs) {
        if (!cat.active) continue;
        if (cat.state === "sleeping" && this.scene.isNearShelter(cat.x, cat.y)) continue;
        if (colonyVictims.includes(cat)) continue;
        const catDist = Phaser.Math.Distance.Between(snatcher.x, snatcher.y, cat.x, cat.y);
        if (catDist < COLONY_CAT_CAPTURE_RANGE) {
          colonyVictims.push(cat);
        }
      }

      const dist = Phaser.Math.Distance.Between(this.scene.player.x, this.scene.player.y, snatcher.x, snatcher.y);

      // Detection radius: 128px normal, 32px if crouching near cover
      let detectionRadius = 128;
      if (this.scene.player.isCrouching && this.scene.isUnderCanopy(this.scene.player.x, this.scene.player.y)) {
        detectionRadius = 32;
      } else if (this.scene.player.isCrouching) {
        detectionRadius = 64;
      } else if (this.scene.player.isRunning) {
        detectionRadius = 192;
      }

      // Safe sleeping spots are invisible to snatchers
      if (this.scene.player.isResting && this.scene.isNearShelter(this.scene.player.x, this.scene.player.y)) {
        continue;
      }

      if (dist < detectionRadius) {
        const angle = Phaser.Math.Angle.Between(snatcher.x, snatcher.y, this.scene.player.x, this.scene.player.y);
        const chaseSpeed = 35;
        snatcher.setVelocity(Math.cos(angle) * chaseSpeed, Math.sin(angle) * chaseSpeed);

        if (dist < PLAYER_CAPTURE_RANGE) {
          // Apply pending colony captures BEFORE the player-capture
          // scene-restart flow so their counter bump reaches the save
          // file alongside the player's.
          for (const victim of colonyVictims) this.handleColonyCatSnatch(victim);
          this.handleSnatcherCapture();
          return;
        }
      }
    }

    for (const victim of colonyVictims) this.handleColonyCatSnatch(victim);
  }

  /** Called from the day/night `newDay` handler in the scene. */
  onNewDay(): void {
    this.snatchedThisNightFlag = false;
  }

  /** Called once from scene.create after foundational services are up. */
  shutdown(): void {
    this.despawnAll();
    this.spawnChecked = false;
    this.snatchedThisNightFlag = false;
  }

  // ──────────── Internal ────────────

  /**
   * The first snatcher sighting is scripted: a snatcher walks into view,
   * nearby NPC cats flee visibly, then narration fires — but only if the
   * player can actually perceive the event (Phase 4.5 witness gate). A
   * missed sighting re-arms on the next eligible night rather than
   * locking the save into random-spawn mode forever.
   */
  private playFirstSnatcherSighting(): void {
    this.spawnSnatcher(0, true);

    const snatcher = this.snatchersList[0];
    if (!snatcher) return;

    this.scene.time.delayedCall(2000, () => {
      for (const { cat } of this.scene.npcs) {
        if (cat.state === "sleeping") continue;
        const dist = Phaser.Math.Distance.Between(snatcher.x, snatcher.y, cat.x, cat.y);
        if (dist < GP.SNATCHER_WITNESS_DIST) {
          this.scene.emotes.show(this.scene, cat, "alert");
          cat.triggerFlee(snatcher.x, snatcher.y);
        }
      }

      this.scene.time.delayedCall(1000, () => {
        if (!snatcher.active) return;
        const near =
          Phaser.Math.Distance.Between(this.scene.player.x, this.scene.player.y, snatcher.x, snatcher.y) <=
          GP.SNATCHER_WITNESS_DIST;
        const los = this.scene.hasLineOfSight(this.scene.player.x, this.scene.player.y, snatcher.x, snatcher.y);
        if (!near || !los) return;
        const hud = this.scene.scene.get("HUDScene") as HUDScene | undefined;
        hud?.pulseEdge(0x220000, 0.35, 3000);
        hud?.showNarration("Something moves in the dark. The other cats run. You should too.");
        this.scene.registry.set(StoryKeys.FIRST_SNATCHER_SEEN, true);
      });
    });
  }

  private spawnSnatcher(index: number, silent = false, navigationGrid?: NavigationGrid): void {
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
    const snatcherType = index % 2 === 0 ? "snatcher" : "snatcher2";
    const grid = navigationGrid ?? this.scene.createHumanNavigationGrid();

    const config: HumanConfig = {
      type: snatcherType,
      speed: 20,
      activePhases: ["night"],
      path,
    };
    const snatcher = new HumanNPC(this.scene, this.scene.routeHumanConfig(config, grid));
    const ground = this.scene.groundLayer;
    const objects = this.scene.objectsLayer;
    if (ground) this.scene.physics.add.collider(snatcher, ground);
    if (objects) this.scene.physics.add.collider(snatcher, objects);
    this.snatchersList.push(snatcher);
    this.scene.humans.register(snatcher);

    if (!silent) {
      const hud = this.scene.scene.get("HUDScene") as HUDScene | undefined;
      const near =
        Phaser.Math.Distance.Between(this.scene.player.x, this.scene.player.y, snatcher.x, snatcher.y) <=
        GP.SNATCHER_WITNESS_DIST;
      const los = this.scene.hasLineOfSight(this.scene.player.x, this.scene.player.y, snatcher.x, snatcher.y);
      if (near && los) {
        hud?.showNarration("Something moves in the dark...");
      }
    }
  }

  private despawnAll(): void {
    for (const snatcher of this.snatchersList) {
      this.scene.humans.unregister(snatcher);
      snatcher.destroy();
    }
    this.snatchersList.length = 0;
  }

  /**
   * Remove a colony cat that a snatcher caught (named or unnamed),
   * increment the lifetime `CATS_SNATCHED` counter, hand the colony
   * total off to {@link ColonyDynamicsSystem.onCatRemoved} so the field
   * and registry stay in lockstep, and narrate only when the player
   * could actually perceive the event (Phase 4.5 witness gate).
   *
   * Witness (near + LOS) is captured from `cat.x/y` BEFORE the entity
   * is destroyed so the check measures the capture point, not the
   * post-destroy null position.
   *
   * Named cats: within-session removal is effective. Cross-session
   * persistence is NOT yet implemented — see WORKING_MEMORY
   * "Follow-ups" for the proposed shape.
   */
  private handleColonyCatSnatch(cat: NPCCat): void {
    const near =
      Phaser.Math.Distance.Between(this.scene.player.x, this.scene.player.y, cat.x, cat.y) <=
      GP.SNATCHER_WITNESS_DIST;
    const los =
      near && this.scene.hasLineOfSight(this.scene.player.x, this.scene.player.y, cat.x, cat.y);

    this.scene.removeColonyCat(cat);

    const prev = this.scene.registry.get(StoryKeys.CATS_SNATCHED);
    const prevCount = typeof prev === "number" && Number.isFinite(prev) && prev >= 0 ? Math.floor(prev) : 0;
    this.scene.registry.set(StoryKeys.CATS_SNATCHED, prevCount + 1);

    this.scene.colony.onCatRemoved();

    if (near && los) {
      const hud = this.scene.scene.get("HUDScene") as HUDScene | undefined;
      hud?.showNarration("A cat was here. Now it's gone.");
    }
  }

  /**
   * Player capture path: record score, bump lifetime counter, autosave
   * (or clear save if this was the final life), then fade to black and
   * restart the scene via the `loadSave` + `snatcherCapture` data flags
   * so the save's `PLAYER_SNATCHED_COUNT` bump survives the reload
   * (WORKING_MEMORY "Persisting counters across save-based scene
   * restarts").
   */
  private handleSnatcherCapture(): void {
    const finalLife = this.scene.loseLife();
    this.scene.scoring.recordSnatch();
    this.snatchedThisNightFlag = true;
    markSnatchedThisNight(this.scene.registry);

    const prev = this.scene.registry.get(StoryKeys.PLAYER_SNATCHED_COUNT);
    const prevCount = typeof prev === "number" && Number.isFinite(prev) && prev >= 0 ? Math.floor(prev) : 0;
    this.scene.registry.set(StoryKeys.PLAYER_SNATCHED_COUNT, prevCount + 1);
    if (!finalLife) {
      this.scene.autoSave();
    } else {
      SaveSystem.clear();
      markGameOver(this.scene.registry);
    }

    this.scene.cameras.main.fade(100, 0, 0, 0, false, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress >= 1) {
        this.scene.dialogue.show(["Hands. Darkness. You can't move. You can't breathe.", "..."], () => {
          if (finalLife) {
            this.scene.cameras.main.resetFX();
            this.scene.triggerGameOver("snatched");
            return;
          }
          const hasSave = SaveSystem.load() !== null;
          if (hasSave) {
            this.scene.cameras.main.resetFX();
            this.scene.scene.restart({ loadSave: true, snatcherCapture: true });
          } else {
            this.scene.cameras.main.resetFX();
          }
        });
      }
    });
  }
}
