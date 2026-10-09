import type Phaser from "phaser";
import type { GameScene } from "../scenes/GameScene";
import type { HUDScene } from "../scenes/HUDScene";
import { NPCCat, type NPCCatConfig } from "../sprites/NPCCat";
import { ThreatIndicator } from "./ThreatIndicator";
import { NewcomerCats } from "./NewcomerCats";
import { StoryKeys } from "../registry/storyKeys";
import {
  INITIAL_COLONY_TOTAL,
  NAMED_AND_MAMMA_COUNT,
  VISIBLE_BACKGROUND_CAP,
} from "../config/gameplayConstants";
import {
  backgroundCatLook,
  backgroundIndices,
  colonyCatName,
  computeBackgroundSpawnCount,
  decrementColonyTotal,
  isStreetColonyIndex,
  readIndexList,
  STREET_COLONY,
  STREET_COLONY_BASE,
} from "../utils/colonySpawn";
import { placeNamed, placesOfType } from "../utils/mapPlaces";
import { SETTLED } from "../utils/newcomerCat";
import { inCarPath } from "../utils/kerbsideDropoff";

const DUMPED_COMFORT_WINDOW_MS = 5_000;
/** A dumping car holds while Mamma Cat is on the road this close past its nose (or under / beside it). */
const DUMPING_CAR_YIELD_PX = 64;
/** ...and honks once if she is still in the way after this long. */
const DUMPING_CAR_HONK_AFTER_MS = 900;

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
  /** Per-frame checks of the story cars yielding to Mamma Cat, removed on shutdown. */
  private readonly yieldChecks = new Set<() => void>();
  /** Each background cat's index: it fixes the cat's look and name across sessions. */
  private readonly backgroundIndex = new WeakMap<NPCCat, number>();
  private namedIndices = new Set<number>();
  private lostIndices = new Set<number>();
  private nextIndex = 0;
  /** Simba and his rock: after a stroll he climbs back up. */
  private perch: { cat: NPCCat; at: { x: number; y: number } } | null = null;
  private streetColonyNarrated = false;
  /** Dumped pets still finding their feet. */
  readonly newcomers: NewcomerCats;

  constructor(scene: GameScene) {
    this.scene = scene;
    this.newcomers = new NewcomerCats(scene);
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
  onCatRemoved(cat?: NPCCat): void {
    this.colonyCountValue = decrementColonyTotal(this.colonyCountValue, NAMED_AND_MAMMA_COUNT);
    this.scene.registry.set(StoryKeys.COLONY_COUNT, this.colonyCountValue);
    if (cat) this.newcomers.forget(cat);
    const index = cat ? this.backgroundIndex.get(cat) : undefined;
    if (index !== undefined) {
      this.lostIndices.add(index);
      this.scene.registry.set(StoryKeys.COLONY_LOST, [...this.lostIndices]);
    }
  }

  /**
   * Mamma Cat greets a background cat: she learns its name (kept in the save,
   * shown over it from then on). Returns the name and whether it is new to
   * her, or null for a cat that isn't one of the background roster.
   */
  learnName(cat: NPCCat): { name: string; isNew: boolean } | null {
    const index = this.backgroundIndex.get(cat);
    if (index === undefined) return null;
    const isNew = !this.namedIndices.has(index);
    if (isNew) {
      this.namedIndices.add(index);
      this.scene.registry.set(StoryKeys.COLONY_NAMED, [...this.namedIndices]);
      this.scene.npcs.find((e) => e.cat === cat)?.indicator.reveal();
    }
    return { name: colonyCatName(index), isNew };
  }

  /**
   * Visible background roster is derived from the dynamic total minus
   * the named roster + Mamma Cat, capped for performance. Called once
   * from `create()` after named cats are spawned.
   */
  spawnInitialBackgroundCats(): void {
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
    // Spawn discs on the park's lawns (map `colony_zone` places).
    const zones = placesOfType(this.scene.places, "colony_zone").map((z) => ({
      name: z.name,
      cx: z.x,
      cy: z.y,
      radius: Number(z.props.radius) || 300,
    }));
    this.namedIndices = new Set(readIndexList(this.scene.registry.get(StoryKeys.COLONY_NAMED)));
    this.lostIndices = new Set(readIndexList(this.scene.registry.get(StoryKeys.COLONY_LOST)));
    if (zones.length === 0) return;
    // Cat cat and Mittens (indices 0 and 1) are friends with Ella: they share a
    // home in the west colony, which her walk passes through, and like Mamma Cat from the start.
    const petsZone = zones.find((z) => z.name === "colony_west") ?? zones[0]!;
    let petsHome: { x: number; y: number } | null = null;

    const count = computeBackgroundSpawnCount(this.colonyCountValue, NAMED_AND_MAMMA_COUNT, VISIBLE_BACKGROUND_CAP);
    // dumped pets Mamma Cat saw arrive come back where they live, over the roster
    const newcomers = this.newcomers.load();
    const indices = backgroundIndices(count, new Set([...this.lostIndices, ...newcomers.keys()]));
    // newcomers number on from the park roster, never into the street colony's block
    this.nextIndex = Math.max(-1, ...indices, ...newcomers.keys(), ...[...this.lostIndices].filter((i) => i < STREET_COLONY_BASE)) + 1;
    indices.forEach((index, i) => {
      if (index <= 1) {
        const near = petsHome ? { cx: petsHome.x, cy: petsHome.y, radius: 60 } : { cx: petsZone.cx, cy: petsZone.cy, radius: 120 };
        const { x, y } = this.pickReachablePointInZone(near);
        petsHome ??= { x, y };
        this.addColonyCat(index, x, y, { cx: x, cy: y, radius: 100 }, "friendly");
        return;
      }
      const zone = zones[i % zones.length]!;
      const { x, y } = this.pickReachablePointInZone(zone);
      const disp = dispositions[Math.floor(Math.random() * dispositions.length)]!;
      const homeRadius = 80 + Math.random() * 80;
      this.addColonyCat(index, x, y, { cx: x, cy: y, radius: homeRadius }, disp);
    });
    for (const [index, rec] of newcomers) {
      if (this.lostIndices.has(index)) continue;
      const { x, y } = this.pickReachablePointInZone({ cx: rec.x, cy: rec.y, radius: 48 });
      const cat = this.addColonyCat(index, x, y, { cx: x, cy: y, radius: 100 }, "wary");
      if (rec.comfort < SETTLED) this.newcomers.track(cat, index, rec, true);
    }
  }

  /**
   * The street colony across Ayala Ave by the underpass (map `street_colony`,
   * `cat_house`, `cat_rock`, `colony_bowl` places): three friendly cats the
   * office guards look after, their houses and bowls, and Simba's rock. The
   * bowls are food sources (GameScene). Call after {@link spawnInitialBackgroundCats}.
   */
  spawnStreetColony(): void {
    const places = this.scene.places;
    const colony = placeNamed(places, "street_colony");
    const rock = placeNamed(places, "cat_rock");
    const houses = placesOfType(places, "cat_house");
    if (!colony || !rock || houses.length === 0) return;
    const add = this.scene.add;
    // the rock's top face (texture 20,10) under Simba's feet, about 12 px below his centre
    add.image(rock.x, rock.y + 12, "cat_rock").setOrigin(0.5, 10 / 26).setDepth(2.95);
    for (const h of houses) add.image(h.x, h.y + 14, "cat_house").setOrigin(0.5, 1).setDepth(2.96);
    for (const b of placesOfType(places, "colony_bowl"))
      add.image(b.x, b.y + 8, b.props.source === "water_bowl" ? "cat_bowl_water" : "cat_bowl_food").setDepth(1.9);

    const home = { cx: colony.x, cy: colony.y, radius: Number(colony.props.radius) || 64 };
    STREET_COLONY.forEach((look, k) => {
      const index = STREET_COLONY_BASE + k;
      if (this.lostIndices.has(index)) return;
      if (k === 0) {
        const simba = this.addColonyCat(index, rock.x, rock.y, { cx: rock.x, cy: rock.y, radius: 40 }, "friendly", {
          // a sun lover: sits and dozes up there all day, strolls a little at dawn and dusk
          behaviour: {
            dawn: { idle: 0.5, walking: 0.1, sleeping: 0.4 },
            day: { idle: 0.4, walking: 0, sleeping: 0.6 },
            evening: { idle: 0.5, walking: 0.2, sleeping: 0.3 },
            night: { idle: 0.2, walking: 0.1, sleeping: 0.7 },
          },
        });
        simba.setTint(look.tint);
        this.perch = { cat: simba, at: { x: rock.x, y: rock.y } };
        return;
      }
      const house = houses[(k - 1) % houses.length]!;
      this.addColonyCat(index, house.x, house.y + 8, home, "friendly").setTint(look.tint);
    });
  }

  /** One of the street colony across Ayala Ave (they have their own bowls: no trips to the park's water). */
  isStreetCat(cat: NPCCat): boolean {
    const index = this.backgroundIndex.get(cat);
    return index !== undefined && isStreetColonyIndex(index);
  }

  /** Back up on his rock after a stroll; and the first time each session she finds the street colony, she takes it in. */
  private tickStreetColony(): void {
    const p = this.perch;
    if (p && p.cat.active && p.cat.state === "idle" && !p.cat.onErrand && !p.cat.inDialogue && Math.hypot(p.cat.x - p.at.x, p.cat.y - p.at.y) > 8)
      p.cat.followRoute([p.at], () => undefined);
    const colony = placeNamed(this.scene.places, "street_colony");
    if (this.streetColonyNarrated || !colony || !p) return;
    // by the houses, or by Simba's rock as she comes up from the underpass
    const player = this.scene.player;
    const near = [colony, p.at].find((q) => Math.hypot(player.x - q.x, player.y - q.y) <= 160);
    if (!near) return;
    this.streetColonyNarrated = true;
    this.scene.narrateIfPerceivable(
      "Little houses tucked against the wall, bowls set out by the building guards. Three cats live here, and the golden one up on the rock watches you come.",
      near,
      200,
    );
  }

  /** Background cat `index` (fixed look and name), with its colliders and name tag. */
  private addColonyCat(
    index: number,
    x: number,
    y: number,
    homeZone: { cx: number; cy: number; radius: number },
    disposition: "neutral" | "wary" | "friendly" | "territorial",
    opts: Pick<NPCCatConfig, "behaviour"> = {},
  ): NPCCat {
    const cat = new NPCCat(this.scene, {
      name: `Colony Cat ${index + 1}`,
      ...backgroundCatLook(index),
      x,
      y,
      homeZone,
      disposition,
      ...opts,
    });
    this.backgroundIndex.set(cat, index);
    const ground = this.scene.groundLayer;
    const objects = this.scene.objectsLayer;
    if (ground) this.scene.physics.add.collider(cat, ground);
    if (objects) this.scene.physics.add.collider(cat, objects);
    const indicator = new ThreatIndicator(this.scene, cat, colonyCatName(index), disposition, this.namedIndices.has(index));
    this.scene.npcs.push({ cat, indicator });
    return cat;
  }

  /**
   * Arm dumping events based on chapter thresholds; only fires when
   * Mamma Cat is near the Makati Ave road and on park ground (the car
   * pulls over at the park kerb by her, so it waits, still armed, while
   * she is on the road or across it). Called from the 5s polled check
   * block in {@link GameScene.update}.
   */
  tick(): void {
    if (this.scene.dialogue.isActive || this.dumpingInProgressFlag) return;
    this.tickStreetColony();
    // Registry values are persisted through save/load and typed as `unknown`.
    // Normalise defensively so a corrupt/edited save (NaN, negative, non-
    // finite, string) can't silently wedge the dumping state machine —
    // matches the pattern used for `CATS_SNATCHED`, `PLAYER_SNATCHED_COUNT`,
    // and `COLLAPSE_COUNT` elsewhere.
    const rawDumpingSeen = this.scene.registry.get(StoryKeys.DUMPING_EVENTS_SEEN);
    const dumpingSeen =
      typeof rawDumpingSeen === "number" && Number.isFinite(rawDumpingSeen) && rawDumpingSeen >= 0
        ? Math.floor(rawDumpingSeen)
        : 0;
    const chapter = this.scene.chapters.chapter;

    if (this.dumpingArmed === 0) {
      if (dumpingSeen === 0 && chapter >= 2) this.dumpingArmed = 1;
      else if (dumpingSeen === 1 && chapter >= 3) this.dumpingArmed = 2;
      else if (dumpingSeen === 2 && chapter >= 4) this.dumpingArmed = 3;
    }

    if (this.dumpingArmed > 0 && this.dumpingArmed === dumpingSeen + 1) {
      const { x, y } = this.scene.player;
      if (this.scene.isNearMakatiAve(x, y) && this.scene.isInPark(x, y)) {
        this.playDumpingSequence(this.dumpingArmed);
        this.dumpingArmed = 0;
      }
    }
  }

  /**
   * Best-effort comfort credit: if the player engages dialogue with a cat
   * that was dumped this session while the comfort window is still open (or,
   * once she has seen it arrive, while it is still a frightened newcomer: it
   * runs and hides, so she may have to find it first), award the scoring bonus
   * once and close the window.
   */
  tryCreditDumpedPetComfort(cat: NPCCat): void {
    const eventId = this.dumpedCatEventIds.get(cat);
    if (!eventId) return;
    const deadline = this.dumpedComfortWindowUntil[eventId];
    if (deadline === undefined) return;
    if (this.scene.time.now > deadline && !this.newcomers.has(cat)) return;
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
    for (const check of this.yieldChecks) this.scene.events.off("update", check);
    this.yieldChecks.clear();
  }

  // ──────────── Internal — dumping sequence ────────────

  private playDumpingSequence(eventNum: number): void {
    this.dumpingInProgressFlag = true;

    const hud = this.scene.scene.get("HUDScene") as HUDScene | undefined;
    hud?.pulseEdge(0x221100, 0.3, 2500);

    // The car comes down the nearest triangle-side carriageway and pulls over
    // at the kerb by Mamma Cat; the cat is dropped on the park-side pavement.
    const player = { x: this.scene.player.x, y: this.scene.player.y };
    const plan = this.scene.planDropoff(player);
    const carStartX = plan?.start.x ?? player.x + 400;
    const roadY = plan?.start.y ?? player.y;
    const stop = plan?.stop ?? { x: player.x, y: player.y };
    const exit = plan?.exit ?? { x: carStartX + 200, y: roadY };
    const dropAt = plan ? this.scene.kerbDropPoint(plan, player) : { x: stop.x - 20, y: stop.y - 4 };

    const car = this.scene.addDropoffVehicle(carStartX, roadY, this.scene.vehicleOptionsForDumpingEvent(eventNum));
    if (plan) car.setRotation(plan.rotation).setFlipX(plan.flipX);
    const reservation = plan ? this.scene.traffic.reserve(plan.stop, 700, 300) : undefined;

    const arrive = this.scene.tweens.add({
      targets: car,
      x: stop.x,
      y: stop.y,
      duration: 2000,
      ease: "Cubic.easeOut",
      onComplete: () => {
        this.scene.time.delayedCall(500, () => {
          const dumpedCat = this.addBackgroundCat(dropAt.x, dropAt.y);
          if (dumpedCat) {
            dumpedCat.setAlpha(0.9);
            this.dumpedCatEventIds.set(dumpedCat, eventNum);
            const index = this.backgroundIndex.get(dumpedCat);
            const rec = { comfort: 0, since: this.scene.dayNight.dayCount, x: dropAt.x, y: dropAt.y };
            if (index !== undefined) this.newcomers.track(dumpedCat, index, rec, false);
          }

          this.scene.time.delayedCall(500, () => {
            this.scene.time.delayedCall(300, () => {
              const leave = this.scene.tweens.add({
                targets: car,
                x: exit.x,
                y: exit.y,
                duration: 2500,
                ease: "Cubic.easeIn",
                onComplete: () => {
                  car.destroy();
                  if (reservation !== undefined) this.scene.traffic.release(reservation);
                },
              });
              this.yieldToMamma(car, leave, exit);

              this.scene.time.delayedCall(1500, () => {
                this.showDumpingNarration(eventNum, dumpedCat);
              });
            });
          });
        });
      },
    });
    this.yieldToMamma(car, arrive, stop);
  }

  /**
   * Tweened story cars don't see Mamma Cat the way ambient traffic does: hold
   * the tween while she is on the road in the car's way, resume once she's clear.
   */
  private yieldToMamma(car: Phaser.GameObjects.Image, tween: Phaser.Tweens.Tween, to: { x: number; y: number }): void {
    let heldSince: number | null = null;
    let honked = false;
    const check = (): void => {
      if (!car.active || tween.isFinished() || tween.isDestroyed()) {
        this.scene.events.off("update", check);
        this.yieldChecks.delete(check);
        return;
      }
      const { x, y } = this.scene.player;
      const inWay =
        this.scene.isOnRoad(x, y) &&
        inCarPath(car, to, { x, y }, car.displayWidth / 2, car.displayHeight / 2 + 8, DUMPING_CAR_YIELD_PX);
      if (inWay) {
        tween.pause();
        heldSince ??= this.scene.time.now;
        if (!honked && this.scene.time.now - heldSince > DUMPING_CAR_HONK_AFTER_MS) {
          honked = true;
          this.scene.audio?.playCarHorn(this.scene.earVolume(car.x, car.y));
        }
      } else {
        heldSince = null;
        tween.resume();
      }
    };
    this.scene.events.on("update", check);
    this.yieldChecks.add(check);
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

    this.newcomers.keep(source);
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

  /** Random point in the disc that Mamma Cat can reach (a few tries, then the centre). */
  private pickReachablePointInZone(zone: { cx: number; cy: number; radius: number }): { x: number; y: number } {
    const tile = this.scene.map.tileWidth;
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * zone.radius * 0.6;
      const x = zone.cx + Math.cos(angle) * r;
      const y = zone.cy + Math.sin(angle) * r;
      if (this.scene.territory.visitCell(Math.floor(x / tile), Math.floor(y / tile), this.scene.map.width) !== null) {
        return { x, y };
      }
    }
    return { x: zone.cx, y: zone.cy };
  }

  private addBackgroundCat(atX?: number, atY?: number): NPCCat {
    const fallbackZone = placesOfType(this.scene.places, "colony_zone")[0];
    const x = atX ?? fallbackZone?.x ?? this.scene.player.x;
    const y = atY ?? fallbackZone?.y ?? this.scene.player.y;

    // a newcomer joins the roster: the next index, so it keeps its look and name next session
    return this.addColonyCat(this.nextIndex++, x, y, { cx: x, cy: y, radius: 100 }, "wary");
  }

}

