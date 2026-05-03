import type { GameScene } from "../scenes/GameScene";
import type { HUDScene } from "../scenes/HUDScene";
import { NPCCat } from "../sprites/NPCCat";
import { ThreatIndicator } from "./ThreatIndicator";
import { StoryKeys } from "../registry/storyKeys";
import {
  INITIAL_COLONY_TOTAL,
  NAMED_AND_MAMMA_COUNT,
  VISIBLE_BACKGROUND_CAP,
} from "../config/gameplayConstants";
import { computeBackgroundSpawnCount, decrementColonyTotal } from "../utils/colonySpawn";

const DUMPED_COMFORT_WINDOW_MS = 5_000;

/**
 * Owns the dynamic colony population model and scripted dumping events.
 *
 * `colonyCount` mirrors {@link StoryKeys.COLONY_COUNT} in the registry. The
 * field is the cache used by {@link spawnInitialBackgroundCats}; every
 * mutation updates both field and registry in the same statement (see
 * WORKING_MEMORY "Colony population model" lesson).
 *
 * Dumping event reveal uses the Phase 4.5 witness gate pattern: registry
 * side-effects ({@link StoryKeys.DUMPING_EVENTS_SEEN}, `COLONY_COUNT` bump,
 * the modal dialogue) fire inside {@link showDumpingNarration} re-checked
 * against proximity + line-of-sight to the dumped cat, because the
 * trigger-side `isNearMakatiAve` gate goes stale over the ~5s sequence.
 */
export class ColonyDynamicsSystem {
  private readonly scene: GameScene;
  private colonyCountValue = INITIAL_COLONY_TOTAL;
  private dumpingArmed = 0;
  private dumpingInProgressFlag = false;
  private dumpedCatEventIds = new WeakMap<NPCCat, number>();
  private dumpedComfortWindowUntil: Record<number, number> = {};

  constructor(scene: GameScene) {
    this.scene = scene;
  }

  get colonyCount(): number {
    return this.colonyCountValue;
  }

  get dumpingInProgress(): boolean {
    return this.dumpingInProgressFlag;
  }

  /** Reset transient state on a fresh scene create (pre-save-load). */
  resetTransient(): void {
    this.dumpingArmed = 0;
    this.dumpingInProgressFlag = false;
    this.dumpedComfortWindowUntil = {};
    this.dumpedCatEventIds = new WeakMap();
  }

  /** Seed a fresh-game colony total: field + registry in lockstep. */
  seedFreshGame(): void {
    this.colonyCountValue = INITIAL_COLONY_TOTAL;
    this.scene.registry.set(StoryKeys.COLONY_COUNT, this.colonyCountValue);
  }

  /**
   * Reconcile the colony total from `save.variables` after the generic
   * registry restore loop. Handles corrupt/missing values defensively:
   * finite numerics clamp to the floor (existing behaviour); invalid
   * values fall back to the fresh-game seed rather than the floor, because
   * the floor would collapse the visible background roster to zero on
   * what may otherwise be a mostly-healthy save with one corrupt field.
   */
  reconcileFromSave(variables: Record<string, unknown>): void {
    const savedColony = variables[StoryKeys.COLONY_COUNT];
    if (typeof savedColony === "number" && Number.isFinite(savedColony)) {
      this.colonyCountValue = Math.max(NAMED_AND_MAMMA_COUNT, Math.floor(savedColony));
    } else {
      this.colonyCountValue = INITIAL_COLONY_TOTAL;
    }
    this.scene.registry.set(StoryKeys.COLONY_COUNT, this.colonyCountValue);
  }

  /**
   * Record that a colony cat was removed (via snatcher). Decrements the
   * total, clamped at the named+Mamma floor, and keeps field + registry
   * in lockstep.
   */
  onCatRemoved(): void {
    this.colonyCountValue = decrementColonyTotal(this.colonyCountValue, NAMED_AND_MAMMA_COUNT);
    this.scene.registry.set(StoryKeys.COLONY_COUNT, this.colonyCountValue);
  }

  /**
   * Visible background roster is derived from the dynamic total minus
   * the named roster + Mamma Cat, capped for performance. Called once
   * from `create()` after named cats are spawned.
   */
  spawnInitialBackgroundCats(): void {
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
    const zones = [
      { cx: 1400, cy: 800, radius: 250 },
      { cx: 1600, cy: 1100, radius: 300 },
      { cx: 900, cy: 1000, radius: 200 },
      { cx: 2200, cy: 600, radius: 200 },
      { cx: 2400, cy: 1500, radius: 200 },
    ];

    const count = computeBackgroundSpawnCount(this.colonyCountValue, NAMED_AND_MAMMA_COUNT, VISIBLE_BACKGROUND_CAP);
    for (let i = 0; i < count; i++) {
      const zone = zones[i % zones.length]!;
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * zone.radius * 0.6;
      const x = zone.cx + Math.cos(angle) * r;
      const y = zone.cy + Math.sin(angle) * r;
      const sprite = sprites[Math.floor(Math.random() * sprites.length)]!;
      const disp = dispositions[Math.floor(Math.random() * dispositions.length)]!;
      const homeRadius = 80 + Math.random() * 80;

      const cat = new NPCCat(this.scene, {
        name: `Colony Cat ${this.scene.npcs.length + 1}`,
        spriteKey: sprite,
        x,
        y,
        homeZone: { cx: x, cy: y, radius: homeRadius },
        disposition: disp,
      });
      const ground = this.scene.groundLayer;
      const objects = this.scene.objectsLayer;
      if (ground) this.scene.physics.add.collider(cat, ground);
      if (objects) this.scene.physics.add.collider(cat, objects);
      const indicator = new ThreatIndicator(this.scene, cat, "???", disp, false);
      this.scene.npcs.push({ cat, indicator });
    }
  }

  /**
   * Arm dumping events based on chapter thresholds; only fires when
   * Mamma Cat is near the Makati Ave road. Called from the 5s polled
   * check block in {@link GameScene.update}.
   */
  tick(): void {
    if (this.scene.dialogue.isActive || this.dumpingInProgressFlag) return;
    const dumpingSeen = (this.scene.registry.get(StoryKeys.DUMPING_EVENTS_SEEN) as number) ?? 0;
    const chapter = this.scene.chapters.chapter;

    if (this.dumpingArmed === 0) {
      if (dumpingSeen === 0 && chapter >= 2) this.dumpingArmed = 1;
      else if (dumpingSeen === 1 && chapter >= 3) this.dumpingArmed = 2;
      else if (dumpingSeen === 2 && chapter >= 4) this.dumpingArmed = 3;
    }

    if (this.dumpingArmed > 0 && this.dumpingArmed === dumpingSeen + 1) {
      if (this.scene.isNearMakatiAve(this.scene.player.x, this.scene.player.y)) {
        this.playDumpingSequence(this.dumpingArmed);
        this.dumpingArmed = 0;
      }
    }
  }

  /**
   * Best-effort comfort credit: if the player engages dialogue with a cat
   * that was dumped this session while the comfort window is still open,
   * award the scoring bonus once and close the window.
   */
  tryCreditDumpedPetComfort(cat: NPCCat): void {
    const eventId = this.dumpedCatEventIds.get(cat);
    if (!eventId) return;
    const deadline = this.dumpedComfortWindowUntil[eventId] ?? 0;
    if (this.scene.time.now > deadline) return;
    this.scene.scoring.recordDumpedPetComforted(eventId);
    delete this.dumpedComfortWindowUntil[eventId];
  }

  shutdown(): void {
    // Nothing to destroy; Phaser-owned objects (cars, tweens, delayedCalls)
    // are cleaned up by the scene on shutdown. Clear transient state so a
    // scene restart doesn't inherit stale dumping-in-progress flags.
    this.dumpingInProgressFlag = false;
    this.dumpedComfortWindowUntil = {};
    this.dumpedCatEventIds = new WeakMap();
  }

  // ──────────── Internal — dumping sequence ────────────

  private playDumpingSequence(eventNum: number): void {
    this.dumpingInProgressFlag = true;

    const hud = this.scene.scene.get("HUDScene") as HUDScene | undefined;
    hud?.pulseEdge(0x221100, 0.3, 2500);

    const MAKATI_AVE_X = 2800;
    const roadX = MAKATI_AVE_X;
    const roadY = Math.min(Math.max(this.scene.player.y, 400), 1900);
    const carStartX = roadX + 400;

    const car = this.scene.addDropoffVehicle(carStartX, roadY, this.scene.vehicleOptionsForDumpingEvent(eventNum));

    this.scene.tweens.add({
      targets: car,
      x: roadX,
      duration: 2000,
      ease: "Cubic.easeOut",
      onComplete: () => {
        this.scene.time.delayedCall(500, () => {
          const dumpedCat = this.addBackgroundCat(roadX - 20, roadY - 4);
          if (dumpedCat) {
            dumpedCat.setAlpha(0.9);
            this.dumpedCatEventIds.set(dumpedCat, eventNum);
          }

          this.scene.time.delayedCall(500, () => {
            this.scene.time.delayedCall(300, () => {
              this.scene.tweens.add({
                targets: car,
                x: carStartX + 200,
                duration: 2500,
                ease: "Cubic.easeIn",
                onComplete: () => car.destroy(),
              });

              this.scene.time.delayedCall(1500, () => {
                this.showDumpingNarration(eventNum, dumpedCat);
              });
            });
          });
        });
      },
    });
  }

  /**
   * Re-checks proximity + LOS against the dumped cat because the
   * trigger-time `isNearMakatiAve` check is ~5s stale. Only persists
   * registry side-effects and fires narration when the player is
   * actually positioned to witness the event; otherwise the slot
   * re-arms on the next approach (see WORKING_MEMORY "Scripted reveal
   * sequences need a second witness gate").
   */
  private showDumpingNarration(eventNum: number, source: NPCCat | null): void {
    this.dumpingInProgressFlag = false;

    const witnessed =
      !!source &&
      source.active &&
      this.scene.isNearMakatiAve(this.scene.player.x, this.scene.player.y) &&
      this.scene.hasLineOfSight(this.scene.player.x, this.scene.player.y, source.x, source.y);
    if (!witnessed) return;

    this.scene.registry.set(StoryKeys.DUMPING_EVENTS_SEEN, eventNum);
    const hud = this.scene.scene.get("HUDScene") as HUDScene | undefined;
    this.colonyCountValue++;
    this.scene.registry.set(StoryKeys.COLONY_COUNT, this.colonyCountValue);
    const armComfortWindow = (): void => {
      this.dumpedComfortWindowUntil[eventNum] = this.scene.time.now + DUMPED_COMFORT_WINDOW_MS;
    };

    switch (eventNum) {
      case 1:
        this.scene.dialogue.show(
          ["A car. A door. A cat.", "You remember."],
          () => {
            hud?.showNarration("A new cat has appeared in the gardens.");
          },
          { onHide: armComfortWindow },
        );
        break;
      case 2:
        this.scene.dialogue.show(
          [
            "This one wasn't thrown away. This one was... left.",
            "With love, and grief, and no choice.",
            "You sit beside her. You don't speak. There's nothing to say.",
          ],
          undefined,
          { onHide: armComfortWindow },
        );
        break;
      case 3:
        this.scene.dialogue.show(
          ["Another one. How many of us started this way?"],
          undefined,
          { onHide: armComfortWindow },
        );
        break;
    }
  }

  private addBackgroundCat(atX?: number, atY?: number): NPCCat {
    const sprites = ["mammacat", "blacky", "tiger", "jayco", "fluffy"];
    const sprite = sprites[Math.floor(Math.random() * sprites.length)]!;
    const x = atX ?? 600 + Math.random() * 200;
    const y = atY ?? 1100 + Math.random() * 200;

    const cat = new NPCCat(this.scene, {
      name: `Colony Cat ${this.scene.npcs.length + 1}`,
      spriteKey: sprite,
      x,
      y,
      homeZone: { cx: x, cy: y, radius: 100 },
      disposition: "wary",
    });
    const ground = this.scene.groundLayer;
    const objects = this.scene.objectsLayer;
    if (ground) this.scene.physics.add.collider(cat, ground);
    if (objects) this.scene.physics.add.collider(cat, objects);
    const indicator = new ThreatIndicator(this.scene, cat, "???", "wary", false);
    this.scene.npcs.push({ cat, indicator });
    return cat;
  }

}
