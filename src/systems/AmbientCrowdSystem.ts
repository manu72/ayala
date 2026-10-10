import Phaser from "phaser";
import type { MammaCat } from "../sprites/MammaCat";
import { BaseNPC, type CardinalDirection } from "../sprites/BaseNPC";
import { GUARD_HEAD_DROP_PX, GuardNPC } from "../sprites/GuardNPC";
import { createSpriteProfileAnimations, profileForType } from "../sprites/SpriteProfiles";
import { ThreatIndicator } from "./ThreatIndicator";
import type { EmoteSystem } from "./EmoteSystem";
import type { StatsSystem } from "./StatsSystem";
import { DAY_NIGHT_PHASES, type TimeOfDay } from "./DayNightCycle";
import { placeNamed, placesOfType, type MapPlace } from "../utils/mapPlaces";
import { isRoadTile } from "../utils/roadTiles";
import {
  buildWalkwayGraph,
  degree,
  dominantComponent,
  nearestNode,
  PathCache,
  type PathTree,
  type SegmentClear,
  type WalkwayGraph,
} from "../utils/walkwayGraph";
import {
  clockHour,
  crowdSlot,
  fillTargets,
  mostOverTarget,
  nightShift,
  pickWeightedDeficit,
  planGuards,
  type CrowdSlot,
  type Keepout,
} from "../utils/crowdSchedule";
import {
  ANCHOR_SEATS,
  CROWD_ANIMS,
  CROWD_LOOKS,
  CROWD_ROLES,
  CROWD_TUNING as T,
  NOTICE_CHANCE,
  TREAT_ROLES,
  type AnchorType,
  type CrowdLook,
  type CrowdRole,
  type Facing,
} from "../data/ambient-roles";

/**
 * AMBIENT PARK CROWD — anonymous walkers, joggers, tourists, office workers,
 * diners, picnickers, bench pairs, lunch eaters, smokers, plus extra security
 * guards. Fully separate from HumanPresenceSystem: crowd people are plain
 * sprites with NO physics body, never greetable, never scored, no AI, no
 * bubbles, no narration, no trust/registry. They do notice Mamma Cat (a heart
 * or curious look over their own heads, a tourist's camera flash), and people
 * eating may toss her a small morsel she can eat with the interact key
 * ({@link tryEatTreat}; capped per day, see CROWD_TUNING).
 *
 * Movement follows the map's real footways (walkway graph, cached shortest-path
 * trees) and is advanced only from update(), so pause/journal/cinematics freeze
 * it. Head-counts per time slot come from src/data/ambient-roles.ts; people
 * spawn and vanish only outside the camera view (or fade out at an on-screen
 * exit), within a bubble around the camera, so the density follows the player
 * around the (large) park. Depth is y-sorted against Mamma Cat's feet: people
 * south of her draw over her, people north of her under her.
 *
 * Usage (GameScene): construct once in create() after the tile layers and the
 * player exist; call update(delta, phase, phaseProgress) from every update arm
 * that ticks the restaurant guard (normal, resting, peek); destroy() on shutdown.
 */

export interface AmbientCrowdDeps {
  /** readPlaces(map 'places' layer objects). */
  places: ReadonlyArray<MapPlace>;
  /** readPlaces(map 'spawns' layer objects): keeps the extra hostile guard off spawn/shelter/food/water. */
  spawns: ReadonlyArray<MapPlace>;
  player: MammaCat;
  groundLayer: Phaser.Tilemaps.TilemapLayer | null;
  objectsLayer: Phaser.Tilemaps.TilemapLayer | null;
  emotes: EmoteSystem;
}

type Mode = "graph" | "hop" | "still" | "wait";
type Intent = "anchor" | "roam" | "leave";
type HopThen = "graph" | "seat" | "despawn";

interface Anchor {
  type: AnchorType;
  x: number;
  y: number;
  node: number;
  seats: Array<Person | null>;
  used: number;
  blanket: number;
}

interface Exit {
  x: number;
  y: number;
  node: number;
  tree: PathTree;
}

interface Person {
  sprite: Phaser.GameObjects.Sprite;
  index: number;
  role: number;
  look: CrowdLook;
  mode: Mode;
  intent: Intent;
  hopThen: HopThen;
  x: number;
  y: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  segLen: number;
  segPos: number;
  node: number;
  toNode: number;
  goal: number;
  tree: PathTree | null;
  stops: Int32Array;
  stopCount: number;
  stopIndex: number;
  anchor: Anchor | null;
  seat: number;
  exitIdx: number;
  dwellLeft: number;
  /** >0 while fading out at an exit that is on screen (ms left). */
  fadeLeft: number;
  speed: number;
  scale: number;
  flip: boolean;
  shed: boolean;
  visible: boolean;
  glanceLeft: number;
  glanceCooldown: number;
  glanceFacing: Facing;
  /** ms until this person may react to Mamma Cat again. */
  noticeCooldown: number;
  /** ms Mamma Cat has lingered close while this person eats. */
  lingerMs: number;
  /** Already decided whether to share food (once per person). */
  treatRolled: boolean;
  seed: number;
  animKey: string;
  staticTex: string;
  staticFrame: number;
  cropped: boolean;
  depth: number;
}

interface CrowdGuard {
  npc: GuardNPC;
  homeX: number;
  homeY: number;
  night: boolean;
  onDuty: boolean;
  indicator: ThreatIndicator | null;
  colliders: Phaser.Physics.Arcade.Collider[];
}

// People south of Mamma Cat's feet draw over her (depth 3..3.98), people north of
// them under her (2.5..2.99); each band is y-sorted, so the crowd also sorts among itself.
const DEPTH_BASE = 3;
const DEPTH_SPAN = 0.98;
const BEHIND_BASE = 2.5;
const BEHIND_SPAN = 0.49;
const PROP_DEPTH = 3.995;
const PROP_BEHIND_DEPTH = 2.995;
const BLANKET_DEPTH = 2.4;
/** Leaving through an exit that is on screen: fade out instead of popping. */
const FADE_MS = 600;
/** In a hushed zone, someone still in view this long after the hush began fades out instead of walking. */
const HUSH_FADE_AFTER_MS = 15_000;
/** Food, water and shelter POIs (FoodSource / shelter lists in GameScene) the hostile extra guard keeps away from. */
const RESOURCE_POI =
  /^poi_(safe_sleep|feeding_station|water_bowl|starbucks|covered_area|pyramid_steps|fountain|restaurant_scraps|shops_supermarket|escalator|library)/;
/** Visible if inside the camera view grown by this (sprites are ~35 px tall above their feet). */
const VIEW_MARGIN = 48;
/** Spawns, vanishes and guard shift changes happen only outside the view grown by this. */
const HIDE_MARGIN = 96;
const HOP_SAMPLE_PX = 8;
const MAX_STEPS_PER_FRAME = 16;
/** Picnic blankets: colours that read against the lawn (no greens). */
const BLANKET_COLORS = [0xc0392b, 0x2e86c1, 0xf1c40f, 0xf3ead8, 0x8e44ad, 0xe67e22];

/** Same reach as FoodSource INTERACT_RANGE. */
const TREAT_REACH = 32;

const FACING_OF: Record<CardinalDirection, Facing> = { down: "S", up: "N", left: "W", right: "E" };
const rand = (range: readonly [number, number]): number => range[0] + Math.random() * (range[1] - range[0]);
const pickOne = <V>(list: readonly V[]): V | undefined => list[Math.floor(Math.random() * list.length)];

export class AmbientCrowdSystem {
  private readonly scene: Phaser.Scene;
  private readonly player: MammaCat;
  private readonly graph: WalkwayGraph;
  private readonly cache: PathCache;
  private readonly exits: Exit[] = [];
  private readonly anchors = new Map<AnchorType, Anchor[]>();
  private readonly hubs: Int32Array;
  private readonly mainComponent: number;
  private readonly pool: Person[] = [];
  private readonly free: Person[] = [];
  private readonly active: Person[] = [];
  /** A place strangers keep away from (the Colony Gathering): no crowd, no guards inside it. */
  private hush: { x: number; y: number; r: number } | null = null;
  private hushSince = 0;
  private readonly hushedGuards = new Set<CrowdGuard>();
  private readonly guards: CrowdGuard[] = [];
  private readonly counts: number[] = CROWD_ROLES.map(() => 0);
  private readonly staying: number[] = CROWD_ROLES.map(() => 0);
  private readonly targets: number[] = [];
  private readonly props: Phaser.GameObjects.Graphics;
  private readonly propsBehind: Phaser.GameObjects.Graphics;
  private readonly blankets: Phaser.GameObjects.Graphics;
  private readonly worldH: number;
  private slot: CrowdSlot | null = null;
  private spawnTimer = 0;
  private shedTimer = 0;
  private timeMs = 0;
  private readonly emotes: EmoteSystem;
  /** Road tiles: Mamma Cat may stand there, nobody tosses food onto them. */
  private readonly isOnRoad: (x: number, y: number) => boolean;
  /** Morsels on the ground, waiting for Mamma Cat. */
  private readonly treats: Array<{ x: number; y: number; gfx: Phaser.GameObjects.Graphics; expiresAt: number; giver: Person }> = [];
  private treatsToday = 0;
  private lastPhase: TimeOfDay | null = null;
  // Camera rectangles, refreshed once per update.
  private vx0 = 0;
  private vy0 = 0;
  private vx1 = 0;
  private vy1 = 0;
  private hx0 = 0;
  private hy0 = 0;
  private hx1 = 0;
  private hy1 = 0;
  private camX = 0;
  private camY = 0;
  /** Mamma Cat's foot line (world y), refreshed once per update, for depth sorting against her. */
  private footY = 0;

  constructor(scene: Phaser.Scene, deps: AmbientCrowdDeps) {
    this.scene = scene;
    this.player = deps.player;
    this.emotes = deps.emotes;
    this.worldH = deps.groundLayer?.tilemap.heightInPixels ?? 8192;
    this.isOnRoad = (x, y) => isRoadTile(deps.groundLayer?.getTileAtWorldXY(x, y));
    this.createAnimations();

    const isClear = makeSegmentClear([deps.groundLayer, deps.objectsLayer]);
    const walkways = placesOfType(deps.places, "walkway").flatMap((p) => (p.polyline ? [p.polyline] : []));
    this.graph = buildWalkwayGraph(walkways, { isClear });
    this.cache = new PathCache(this.graph, 2);

    const exitPlaces = placesOfType(deps.places, "exit");
    const exitNodes = exitPlaces.map((e) => nearestNode(this.graph, e.x, e.y, { maxDist: T.maxHop, isClear }));
    this.mainComponent = dominantComponent(
      this.graph,
      exitNodes.filter((n) => n >= 0),
    );
    exitPlaces.forEach((e, i) => {
      const node = exitNodes[i] ?? -1;
      if (node < 0 || this.graph.component[node] !== this.mainComponent) return;
      this.exits.push({ x: e.x, y: e.y, node, tree: this.cache.warm(node) });
    });

    const hubSet = new Set<number>();
    for (let n = 0; n < this.graph.size; n++) {
      if (this.graph.component[n] === this.mainComponent && degree(this.graph, n) !== 2) hubSet.add(n);
    }
    for (const e of this.exits) hubSet.add(e.node);
    for (const type of Object.keys(ANCHOR_SEATS) as AnchorType[]) {
      const list: Anchor[] = [];
      const seats = ANCHOR_SEATS[type];
      // People hop between the walkway node and their SEAT (up to 14 px off the anchor), both ways.
      const seatsClear: SegmentClear = (ax, ay, bx, by) => seats.every((s) => isClear(ax + s.dx, ay + s.dy, bx, by));
      for (const p of placesOfType(deps.places, type)) {
        const node = nearestNode(this.graph, p.x, p.y, {
          component: this.mainComponent,
          maxDist: T.maxHop,
          isClear: seatsClear,
        });
        if (node < 0) continue;
        hubSet.add(node);
        list.push({
          type,
          x: p.x,
          y: p.y,
          node,
          seats: seats.map(() => null),
          used: 0,
          blanket: BLANKET_COLORS[list.length % BLANKET_COLORS.length] ?? 0xc0392b,
        });
      }
      this.anchors.set(type, list);
    }
    this.hubs = Int32Array.from(hubSet);

    this.props = scene.add.graphics().setDepth(PROP_DEPTH);
    this.propsBehind = scene.add.graphics().setDepth(PROP_BEHIND_DEPTH);
    this.blankets = scene.add.graphics().setDepth(BLANKET_DEPTH);
    for (let i = 0; i < T.poolSize; i++) {
      const sprite = scene.add.sprite(0, 0, "dw_s", 0).setVisible(false).setActive(false).setDepth(DEPTH_BASE);
      const p = newPerson(sprite, i);
      this.pool.push(p);
      this.free.push(p);
    }

    this.createGuards(scene, deps);
  }

  /** Live crowd head-count (excluding guards). */
  get population(): number {
    return this.active.length;
  }

  /** Extra guards (on and off duty), e.g. for debugging. Physics colliders are owned by this system. */
  get extraGuards(): readonly GuardNPC[] {
    return this.guards.map((g) => g.npc);
  }

  /** Someone of the crowd, or an extra guard, within `r` of (x, y). */
  someoneNear(x: number, y: number, r: number): { x: number; y: number } | null {
    const near = (o: { x: number; y: number; visible: boolean }) => o.visible && Math.hypot(o.x - x, o.y - y) <= r;
    return this.active.find((p) => near(p.sprite))?.sprite ?? this.guards.find((g) => near(g.npc))?.npc ?? null;
  }

  /**
   * Advance the crowd and the extra guards. Call only from GameScene.update()
   * (which already skips pauses and cinematics).
   */
  update(deltaMs: number, phase: TimeOfDay, phaseProgress: number): void {
    const dt = Math.min(deltaMs, 100);
    const cfg = DAY_NIGHT_PHASES[phase];
    const slot = crowdSlot(phase, clockHour(cfg.startHour, DAY_NIGHT_PHASES[cfg.next].startHour, phaseProgress));
    if (slot !== this.slot) {
      this.slot = slot;
      fillTargets(CROWD_ROLES, slot, T.densityScale, this.targets);
    }
    this.timeMs += dt;
    this.readCamera();
    this.cache.tick();
    this.spawnStep(dt);
    this.shedStep(dt);

    this.props.clear();
    this.propsBehind.clear();
    // Backwards: despawn swap-removes from `active`, moving an already-stepped person into slot i.
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      if (p) this.step(p, dt);
    }
    this.drawBlankets();
    this.tickTreats(phase);
    this.updateGuards(deltaMs, slot);
    this.hushStep();
  }

  /**
   * Keep the crowd and the guards out of `zone` (null lifts it): people out of view there just go,
   * people in view get up and walk off (and fade if they're still there a while later), and guards
   * inside it stand down until it lifts.
   */
  setHush(zone: { x: number; y: number; r: number } | null): void {
    this.hush = zone;
    this.hushSince = this.timeMs;
    if (!zone) for (const g of [...this.hushedGuards]) this.unhushGuard(g);
  }

  private hushStep(): void {
    const z = this.hush;
    if (!z) return;
    const inside = (x: number, y: number) => (x - z.x) ** 2 + (y - z.y) ** 2 < z.r * z.r;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      if (!p || p.role < 0 || p.fadeLeft > 0 || !inside(p.x, p.y)) continue;
      if (!p.visible) this.despawn(p);
      else if (this.timeMs - this.hushSince > HUSH_FADE_AFTER_MS) p.fadeLeft = FADE_MS;
      else if (!p.shed) this.leave(p);
    }
    for (const g of this.guards) {
      const hide = g.onDuty && inside(g.npc.x, g.npc.y);
      if (hide && !this.hushedGuards.has(g)) {
        this.hushedGuards.add(g);
        (g.npc.body as Phaser.Physics.Arcade.Body).enable = false;
        g.npc.setVisible(false);
        g.indicator?.setHidden(true);
      } else if (!hide && this.hushedGuards.has(g)) this.unhushGuard(g);
    }
  }

  private unhushGuard(g: CrowdGuard): void {
    this.hushedGuards.delete(g);
    if (!g.onDuty) return;
    (g.npc.body as Phaser.Physics.Arcade.Body).enable = true;
    g.npc.setVisible(true);
    g.indicator?.setHidden(false);
  }

  /** Get up (or turn off the path) and head for the nearest exit. */
  private leave(p: Person): void {
    p.shed = true;
    if (p.mode === "still") {
      p.dwellLeft = Math.min(p.dwellLeft, 1000 + Math.random() * 5000);
    } else if (p.mode === "graph" || (p.mode === "hop" && p.hopThen === "graph")) {
      // Finish the current segment, then head for the nearest exit.
      this.chooseExit(p, p.toNode);
    } else if (p.mode === "wait") {
      this.chooseExit(p, p.node); // retried from step() once the exit route is cached
    } // hopping onto a seat: the short shed dwell makes them leave right after sitting
  }

  destroy(): void {
    for (const t of this.treats) t.gfx.destroy();
    this.treats.length = 0;
    for (const p of this.pool) p.sprite.destroy();
    this.pool.length = 0;
    this.free.length = 0;
    this.active.length = 0;
    this.props.destroy();
    this.propsBehind.destroy();
    this.blankets.destroy();
    for (const g of this.guards) {
      for (const c of g.colliders) c.destroy();
      g.indicator?.destroy();
      g.npc.destroy();
    }
    this.guards.length = 0;
  }

  // ──────────── setup ────────────

  private createAnimations(): void {
    const anims = this.scene.anims;
    for (const a of CROWD_ANIMS) {
      if (anims.exists(a.key)) continue;
      anims.create({
        key: a.key,
        frames: anims.generateFrameNumbers(a.texture, { frames: [...a.frames] }),
        frameRate: a.frameRate,
        repeat: a.repeat,
      });
    }
    // dogwalker-walk-*, jogger-walk-*, jogger_male-walk-* (idempotent).
    createSpriteProfileAnimations(this.scene, profileForType("dogwalker"));
    createSpriteProfileAnimations(this.scene, profileForType("jogger"));
    createSpriteProfileAnimations(this.scene, profileForType("jogger_male"));
  }

  private createGuards(scene: Phaser.Scene, deps: AmbientCrowdDeps): void {
    const restaurantGuard = placeNamed(deps.spawns, "spawn_guard");
    const playerSpawn = placeNamed(deps.spawns, "spawn_mammacat");
    const hostileKeepout: Keepout[] = [];
    if (playerSpawn) hostileKeepout.push({ x: playerSpawn.x, y: playerSpawn.y, r: T.hostileMinDist });
    if (restaurantGuard) hostileKeepout.push({ x: restaurantGuard.x, y: restaurantGuard.y, r: T.hostileMinDist });
    for (const s of deps.spawns) {
      if (RESOURCE_POI.test(s.name)) {
        hostileKeepout.push({ x: s.x, y: s.y, r: T.hostileResourceDist });
      }
    }
    const plan = planGuards(
      placesOfType(deps.places, "guard_post").map((p) => ({ name: p.name, x: p.x, y: p.y })),
      {
        exclude: restaurantGuard ? [{ x: restaurantGuard.x, y: restaurantGuard.y, r: T.guardSpacing }] : [],
        hostileKeepout,
        hostilePreference: T.hostilePreference,
        maxGuards: T.maxGuards,
        friendlyEvery: T.guardFriendlyEvery,
      },
    );
    const night = nightShift(
      plan.map((g) => g.disposition),
      T.nightGuards,
    );
    plan.forEach(({ post, disposition }, i) => {
      const npc = new GuardNPC(scene, post.x, post.y, { disposition, emotes: deps.emotes });
      npc.setTarget(deps.player);
      const colliders: Phaser.Physics.Arcade.Collider[] = [];
      for (const layer of [deps.groundLayer, deps.objectsLayer]) {
        if (layer) colliders.push(scene.physics.add.collider(npc, layer));
      }
      const guard: CrowdGuard = {
        npc,
        homeX: post.x,
        homeY: post.y,
        night: night[i] ?? false,
        onDuty: true,
        indicator: null,
        colliders,
      };
      this.setDuty(guard, false);
      this.guards.push(guard);
    });
  }

  // ──────────── per frame ────────────

  private readCamera(): void {
    const v = this.scene.cameras.main.worldView;
    this.vx0 = v.x - VIEW_MARGIN;
    this.vy0 = v.y - VIEW_MARGIN;
    this.vx1 = v.right + VIEW_MARGIN;
    this.vy1 = v.bottom + VIEW_MARGIN;
    this.hx0 = v.x - HIDE_MARGIN;
    this.hy0 = v.y - HIDE_MARGIN;
    this.hx1 = v.right + HIDE_MARGIN;
    this.hy1 = v.bottom + HIDE_MARGIN;
    this.camX = v.centerX;
    this.camY = v.centerY;
    const body = this.player.body as Phaser.Physics.Arcade.Body | null | undefined;
    this.footY = body?.bottom ?? this.player.y;
  }

  private inView(x: number, y: number): boolean {
    return x > this.vx0 && x < this.vx1 && y > this.vy0 && y < this.vy1;
  }

  private hidden(x: number, y: number): boolean {
    return x < this.hx0 || x > this.hx1 || y < this.hy0 || y > this.hy1;
  }

  private nearCamera(x: number, y: number, r: number): boolean {
    const dx = x - this.camX;
    const dy = y - this.camY;
    return dx * dx + dy * dy < r * r;
  }

  private spawnStep(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0 || this.exits.length === 0) return;
    this.spawnTimer = T.spawnIntervalMs;
    let deficit = 0;
    for (let i = 0; i < this.targets.length; i++) deficit += Math.max(0, (this.targets[i] ?? 0) - (this.counts[i] ?? 0));
    // Burst while the bubble is filling (game start, slot change); spawns are hidden anyway.
    for (let attempts = deficit > 10 ? 4 : 1; attempts > 0; attempts--) {
      const role = pickWeightedDeficit(this.counts, this.targets, Math.random());
      if (role < 0) return;
      this.spawn(role);
    }
  }

  private shedStep(dt: number): void {
    this.shedTimer -= dt;
    if (this.shedTimer > 0) return;
    this.shedTimer = T.shedIntervalMs;
    // Anyone leaving, or already shed and finishing a short dwell, no longer counts as staying.
    this.staying.fill(0);
    for (const p of this.active) {
      if (p.intent !== "leave" && !p.shed) this.staying[p.role] = (this.staying[p.role] ?? 0) + 1;
    }
    for (let n = 0; n < T.shedPerTick; n++) {
      const role = mostOverTarget(this.staying, this.targets);
      if (role < 0) return;
      let pick: Person | null = null;
      for (const p of this.active) {
        if (p.role !== role || p.intent === "leave" || p.shed) continue;
        if (!p.visible) {
          pick = p;
          break;
        }
        pick ??= p;
      }
      if (!pick) return;
      this.staying[role] = (this.staying[role] ?? 0) - 1;
      if (!pick.visible) {
        this.despawn(pick);
        continue;
      }
      this.leave(pick);
      return; // one visible person per tick, so the view empties gradually
    }
  }

  private step(p: Person, dt: number): void {
    if (p.fadeLeft > 0) {
      p.fadeLeft -= dt;
      if (p.fadeLeft <= 0 || !this.inView(p.x, p.y)) this.despawn(p);
      else p.sprite.setAlpha(p.fadeLeft / FADE_MS);
      return;
    }
    if (p.glanceCooldown > 0) p.glanceCooldown -= dt;
    if (p.glanceLeft > 0) p.glanceLeft -= dt;
    if (p.noticeCooldown > 0) p.noticeCooldown -= dt;

    if (p.mode === "graph" || p.mode === "hop") {
      if (p.glanceLeft <= 0) this.advance(p, (p.speed * dt) / 1000);
    } else if (p.mode === "still") {
      p.dwellLeft -= dt;
      if (p.dwellLeft <= 0) this.finishDwell(p);
    } else if (p.goal >= 0) {
      this.headTo(p, p.goal);
    }
    if (p.role < 0) return;

    if (!this.inView(p.x, p.y)) {
      if (p.intent === "leave" || !this.nearCamera(p.x, p.y, T.recycleRadius)) {
        this.despawn(p);
        return;
      }
      if (p.visible) this.setShown(p, false);
      return;
    }
    if (!p.visible) this.setShown(p, true);

    const role = CROWD_ROLES[p.role];
    if (!role) return;
    if (p.glanceLeft <= 0 && p.glanceCooldown <= 0 && role.gait === "walk") {
      const dx = this.player.x - p.x;
      const dy = this.player.y - p.y;
      if (dx * dx + dy * dy < T.glanceRadius * T.glanceRadius) {
        p.glanceLeft = T.glanceMs;
        p.glanceCooldown = T.glanceCooldownMs;
        p.glanceFacing = FACING_OF[BaseNPC.directionFromComponents(dx, dy)];
        if (p.look.sideView && Math.abs(dx) > 1) p.flip = dx < 0;
      }
    }
    this.considerCat(p, role.id, dt);
    this.render(p, role);
    this.drawProp(p, role);
  }

  /** React to Mamma Cat nearby; people eating may share a morsel if she lingers. */
  private considerCat(p: Person, roleId: string, dt: number): void {
    // Nobody coos at, or feeds, a cat that is asleep or out of sight.
    if (this.player.isResting || this.player.visible === false) {
      p.lingerMs = 0;
      return;
    }
    const dx = this.player.x - p.x;
    const dy = this.player.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > T.noticeRadius * T.noticeRadius) {
      p.lingerMs = 0;
      return;
    }
    if (p.noticeCooldown <= 0) {
      p.noticeCooldown = T.noticeCooldownMs;
      if (Math.random() < (NOTICE_CHANCE[roleId] ?? 0)) {
        p.glanceLeft = T.glanceMs;
        p.glanceFacing = FACING_OF[BaseNPC.directionFromComponents(dx, dy)];
        if (p.look.sideView && Math.abs(dx) > 1) p.flip = dx < 0;
        if (roleId === "tourist") this.cameraFlash(p);
        this.emotes.show(this.scene, p.sprite, roleId === "smoker" || roleId === "office_worker" ? "curious" : "heart", this.emoteOffset(p));
      }
    }
    if (!TREAT_ROLES.has(roleId) || p.mode !== "still" || p.treatRolled) return;
    // Nobody tosses a morsel into traffic: wait until she's back on the pavement.
    if (d2 > T.treatRadius * T.treatRadius || this.isOnRoad(this.player.x, this.player.y)) {
      p.lingerMs = 0;
      return;
    }
    p.lingerMs += dt;
    if (p.lingerMs < T.treatLingerMs) return;
    p.treatRolled = true;
    if (this.treatsToday >= T.treatsPerDay || Math.random() >= T.treatChance) return;
    this.treatsToday++;
    this.dropTreat(p);
  }

  private cameraFlash(p: Person): void {
    const flash = this.scene.add.circle(p.x, p.y - 20, 6, 0xffffff, 0.9).setDepth(PROP_DEPTH);
    this.scene.tweens.add({ targets: flash, alpha: 0, scale: 3, duration: 260, onComplete: () => flash.destroy() });
  }

  /** A morsel lands between the person and Mamma Cat. */
  private dropTreat(p: Person): void {
    const tx = p.x + (this.player.x - p.x) * 0.6;
    const ty = p.y + (this.player.y - p.y) * 0.6 + 4;
    const g = this.scene.add.graphics().setDepth(BLANKET_DEPTH + 0.05);
    g.fillStyle(0x000000, 0.25).fillEllipse(tx + 1, ty + 2, 10, 4);
    g.fillStyle(0xd9a45b, 1).fillCircle(tx - 2, ty, 2.2).fillCircle(tx + 2, ty - 1, 1.8);
    g.fillStyle(0xf3e3c0, 1).fillCircle(tx, ty + 1, 1.6);
    this.treats.push({ x: tx, y: ty, gfx: g, expiresAt: this.timeMs + T.treatLifeMs, giver: p });
    this.emotes.show(this.scene, p.sprite, "heart", this.emoteOffset(p));
  }

  /** EmoteSystem draws 24 px above the sprite's origin; crowd sprites are anchored at the feet, so lift it over the head. */
  private emoteOffset(p: Person): number {
    const headAbove = (p.look.originY - 0.12) * p.look.frameH * p.scale;
    return 24 - headAbove - 8;
  }

  /**
   * Eat a crowd morsel within reach (GameScene's interact key, after FoodSource).
   * Returns the hunger restored, or 0 if none is in reach.
   */
  tryEatTreat(x: number, y: number, stats: StatsSystem): number {
    const i = this.treats.findIndex((t) => (t.x - x) ** 2 + (t.y - y) ** 2 < TREAT_REACH * TREAT_REACH);
    const treat = this.treats[i];
    if (!treat) return 0;
    this.treats.splice(i, 1);
    treat.gfx.destroy();
    const restored = stats.restore("hunger", T.treatHunger);
    const label = this.scene.add
      .text(treat.x, treat.y - 16, `+${Math.round(restored)}`, {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "10px",
        color: "#e8a33d",
        stroke: "#000000",
        strokeThickness: 2,
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(100);
    this.scene.tweens.add({ targets: label, y: treat.y - 46, alpha: 0, duration: 1200, ease: "Cubic.easeOut", onComplete: () => label.destroy() });
    return restored;
  }

  private tickTreats(phase: TimeOfDay): void {
    if (phase === "dawn" && this.lastPhase !== "dawn") this.treatsToday = 0; // a new day
    this.lastPhase = phase;
    for (let i = this.treats.length - 1; i >= 0; i--) {
      const t = this.treats[i];
      if (t && this.timeMs >= t.expiresAt) {
        t.gfx.destroy();
        this.treats.splice(i, 1);
      }
    }
  }

  private advance(p: Person, distance: number): void {
    let left = distance;
    for (let guard = 0; guard < MAX_STEPS_PER_FRAME && left > 0; guard++) {
      if (p.mode !== "graph" && p.mode !== "hop") return;
      const remain = p.segLen - p.segPos;
      if (left < remain) {
        p.segPos += left;
        const t = p.segPos / p.segLen;
        p.x = p.ax + (p.bx - p.ax) * t;
        p.y = p.ay + (p.by - p.ay) * t;
        return;
      }
      left -= remain;
      p.x = p.bx;
      p.y = p.by;
      this.onSegmentEnd(p);
      if (p.role < 0) return;
    }
  }

  private onSegmentEnd(p: Person): void {
    if (p.mode === "hop") {
      if (p.hopThen === "seat") {
        this.sitDown(p);
      } else if (p.hopThen === "despawn") {
        if (p.visible) this.fadeOut(p);
        else this.despawn(p);
      } else {
        p.node = p.toNode;
        this.headTo(p, p.goal);
      }
      return;
    }
    p.node = p.toNode;
    this.continueGraph(p);
  }

  private headTo(p: Person, goal: number): void {
    p.goal = goal;
    p.tree = this.cache.get(goal);
    if (!p.tree) {
      p.mode = "wait";
      return;
    }
    this.continueGraph(p);
  }

  private continueGraph(p: Person): void {
    if (p.node === p.goal) {
      this.onGoal(p);
      return;
    }
    const next = p.tree?.next[p.node] ?? -1;
    if (next < 0) {
      this.strand(p);
      return;
    }
    const g = this.graph;
    p.mode = "graph";
    p.toNode = next;
    p.ax = g.xs[p.node] ?? p.x;
    p.ay = g.ys[p.node] ?? p.y;
    p.bx = g.xs[next] ?? p.x;
    p.by = g.ys[next] ?? p.y;
    p.segLen = Math.hypot(p.bx - p.ax, p.by - p.ay) || 0.001;
    p.segPos = 0;
  }

  private hop(p: Person, x: number, y: number, then: HopThen, toNode = -1): void {
    p.mode = "hop";
    p.hopThen = then;
    p.toNode = toNode;
    p.ax = p.x;
    p.ay = p.y;
    p.bx = x;
    p.by = y;
    p.segLen = Math.hypot(x - p.x, y - p.y) || 0.001;
    p.segPos = 0;
  }

  private onGoal(p: Person): void {
    if (p.intent === "anchor" && p.anchor) {
      const seat = ANCHOR_SEATS[p.anchor.type][p.seat];
      this.hop(p, p.anchor.x + (seat?.dx ?? 0), p.anchor.y + (seat?.dy ?? 0), "seat");
    } else if (p.intent === "roam" && p.stopIndex + 1 < p.stopCount) {
      p.stopIndex++;
      this.headTo(p, p.stops[p.stopIndex] ?? p.node);
    } else if (p.intent === "leave") {
      const exit = this.exits[p.exitIdx];
      if (exit) this.hop(p, exit.x, exit.y, "despawn");
      else this.strand(p);
    } else {
      this.startLeave(p);
    }
  }

  /** No route: stand still and vanish once off-screen. */
  private strand(p: Person): void {
    p.intent = "leave";
    p.mode = "wait";
    p.goal = -1;
  }

  /** Reached an exit in view: freeze on the current frame and fade, so nobody pops out on screen. */
  private fadeOut(p: Person): void {
    p.mode = "wait";
    p.goal = -1;
    p.fadeLeft = FADE_MS;
    p.sprite.anims.stop();
    p.animKey = "";
  }

  private sitDown(p: Person): void {
    p.mode = "still";
    const role = CROWD_ROLES[p.role];
    p.dwellLeft = p.shed ? 1000 + Math.random() * 4000 : rand(role?.dwellMs ?? [20_000, 60_000]);
  }

  private finishDwell(p: Person): void {
    const a = p.anchor;
    if (!a) {
      this.startLeave(p);
      return;
    }
    this.releaseSeat(p);
    p.node = a.node;
    if (!this.chooseExit(p, a.node)) {
      this.strand(p);
      return;
    }
    this.hop(p, this.graph.xs[a.node] ?? p.x, this.graph.ys[a.node] ?? p.y, "graph", a.node);
  }

  private startLeave(p: Person): void {
    if (this.chooseExit(p, p.node)) this.continueGraph(p);
    else this.strand(p);
  }

  /** Route to the exit nearest `node` by walkway distance (applied from `node` onward). */
  private chooseExit(p: Person, node: number): boolean {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.exits.length; i++) {
      const d = this.exits[i]?.tree.dist[node] ?? Infinity;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const exit = this.exits[best];
    if (!exit) return false;
    if (p.anchor) this.releaseSeat(p);
    p.intent = "leave";
    p.exitIdx = best;
    p.goal = exit.node;
    p.tree = exit.tree;
    return true;
  }

  private releaseSeat(p: Person): void {
    const a = p.anchor;
    if (!a) return;
    if (a.seats[p.seat] === p) {
      a.seats[p.seat] = null;
      a.used--;
    }
    p.anchor = null;
  }

  // ──────────── spawning ────────────

  private spawn(roleIdx: number): void {
    const role = CROWD_ROLES[roleIdx];
    const p = this.free.pop();
    if (!role || !p) return;
    p.look = this.lookFor(role, null);
    p.role = roleIdx;
    p.intent = role.motion === "anchored" ? "anchor" : "roam";
    p.anchor = null;
    p.shed = false;
    p.goal = -1;
    p.tree = null;
    p.speed = rand(role.speed);
    p.glanceLeft = 0;
    p.glanceCooldown = 0;
    p.noticeCooldown = 0;
    p.lingerMs = 0;
    p.treatRolled = false;
    // Only side-view art mirrors to face west; 4-direction art has real west frames, and a
    // stray flip there makes people walk backwards.
    p.flip = p.look.sideView && Math.random() < 0.5;
    p.seed = Math.random() * 10_000;
    const placed = role.motion === "anchored" ? this.placeAnchored(p, role) : this.placeStroller(p, role);
    if (!placed) {
      p.role = -1;
      this.free.push(p);
      return;
    }
    this.counts[roleIdx] = (this.counts[roleIdx] ?? 0) + 1;
    p.index = this.active.length;
    this.active.push(p);
    p.visible = false;
    p.animKey = "";
    p.staticTex = "";
    p.depth = -1;
    // ±6% height so clones of the same sheet are less obvious side by side.
    p.scale = p.look.scale * (0.94 + Math.random() * 0.12);
    p.sprite
      .setAlpha(1)
      .setScale(p.scale)
      .setOrigin(p.look.originX, p.look.originY)
      .setTint(pickOne(T.tints) ?? 0xffffff)
      .setFlipX(false)
      .setPosition(p.x, p.y);
    if (p.cropped) {
      p.sprite.setCrop();
      p.cropped = false;
    }
  }

  private placeAnchored(p: Person, role: CrowdRole): boolean {
    const anchor = role.anchor ? this.pickAnchor(role.anchor, role.joinChance ?? 0) : null;
    if (!anchor) return false;
    const tree = this.cache.get(anchor.node);
    if (!tree) return false;
    const seat = anchor.seats.indexOf(null);
    const seatDef = ANCHOR_SEATS[anchor.type][seat];
    if (seat < 0 || !seatDef) return false;
    const seatX = anchor.x + seatDef.dx;
    const seatY = anchor.y + seatDef.dy;
    p.look = this.lookFor(role, anchor);

    const reserve = (): void => {
      anchor.seats[seat] = p;
      anchor.used++;
      p.anchor = anchor;
      p.seat = seat;
      p.goal = anchor.node;
    };
    // Already there (off-screen): fills benches and tables quickly at game start.
    if (this.hidden(seatX, seatY) && Math.random() < 0.5) {
      reserve();
      p.x = seatX;
      p.y = seatY;
      p.node = anchor.node;
      this.sitDown(p);
      p.dwellLeft *= Math.random();
      return true;
    }
    if (Math.random() < T.exitEntryChance) {
      const exit = this.exits[this.pickHiddenExit(tree, T.entryMax * 1.5)];
      if (exit) {
        reserve();
        this.startAtExit(p, exit);
        return true;
      }
    }
    const start = this.pickHiddenNode(tree);
    if (start < 0) return false;
    reserve();
    p.x = this.graph.xs[start] ?? 0;
    p.y = this.graph.ys[start] ?? 0;
    p.node = start;
    this.headTo(p, anchor.node);
    return true;
  }

  private placeStroller(p: Person, role: CrowdRole): boolean {
    const exit = Math.random() < T.exitEntryChance ? this.exits[this.pickHiddenExit(null, T.spawnRadius)] : undefined;
    const start = exit ? exit.node : this.pickHiddenNode(null);
    if (start < 0) return false;
    const want = Math.round(rand(role.stops ?? [2, 3]));
    const sx = this.graph.xs[start] ?? 0;
    const sy = this.graph.ys[start] ?? 0;
    let prev = start;
    p.stopCount = 0;
    for (let k = 0; k < want && k < p.stops.length; k++) {
      // Usually route the first leg past the camera so walkers cross the player's view.
      let hub = k === 0 && Math.random() < T.nearBias ? this.pickHub(this.camX, this.camY, T.nearRadius, prev) : -1;
      if (hub < 0) hub = this.pickHub(sx, sy, T.roamRadius, prev);
      if (hub < 0) break;
      p.stops[p.stopCount++] = hub;
      prev = hub;
    }
    if (p.stopCount === 0) return false;
    p.stopIndex = 0;
    p.goal = p.stops[0] ?? start;
    if (exit) {
      this.startAtExit(p, exit);
    } else {
      p.x = this.graph.xs[start] ?? 0;
      p.y = this.graph.ys[start] ?? 0;
      p.node = start;
      this.headTo(p, p.goal);
    }
    return true;
  }

  /** Random look for the role; at a shared anchor, avoid twins sitting side by side when possible. */
  private lookFor(role: CrowdRole, anchor: Anchor | null): CrowdLook {
    let chosen: CrowdLook | null = null;
    let seen = 0;
    for (const id of role.looks) {
      const look = CROWD_LOOKS[id];
      if (anchor && anchor.seats.some((o) => o?.look === look)) continue;
      if (Math.random() * ++seen < 1) chosen = look;
    }
    const any = pickOne(role.looks);
    return chosen ?? (any ? CROWD_LOOKS[any] : CROWD_LOOKS.walkerF);
  }

  private startAtExit(p: Person, exit: Exit): void {
    p.x = exit.x;
    p.y = exit.y;
    p.node = exit.node;
    this.hop(p, this.graph.xs[exit.node] ?? exit.x, this.graph.ys[exit.node] ?? exit.y, "graph", exit.node);
  }

  /**
   * Free anchor of `type`, usually close to the camera (so the player actually
   * sees the benches and tables fill), preferring shared ones with `joinChance`.
   */
  private pickAnchor(type: AnchorType, joinChance: number): Anchor | null {
    const list = this.anchors.get(type) ?? [];
    const join = Math.random() < joinChance;
    const near = Math.random() < T.nearBias;
    return (near ? this.scanAnchors(list, join, T.nearRadius) : null) ?? this.scanAnchors(list, join, T.spawnRadius);
  }

  private scanAnchors(list: readonly Anchor[], join: boolean, radius: number): Anchor | null {
    let chosen: Anchor | null = null;
    let seen = 0;
    let fallback: Anchor | null = null;
    let fallbackSeen = 0;
    for (const a of list) {
      if (a.used >= a.seats.length || !this.nearCamera(a.x, a.y, radius)) continue;
      if (Math.random() * ++fallbackSeen < 1) fallback = a;
      if (join === (a.used > 0) && Math.random() * ++seen < 1) chosen = a;
    }
    return chosen ?? fallback;
  }

  /** Random hidden walkway node near the camera; with a tree, also within entry walking distance of its target. */
  private pickHiddenNode(tree: PathTree | null): number {
    const g = this.graph;
    let chosen = -1;
    let seen = 0;
    for (let n = 0; n < g.size; n++) {
      if (g.component[n] !== this.mainComponent) continue;
      const x = g.xs[n] ?? 0;
      const y = g.ys[n] ?? 0;
      if (!this.hidden(x, y)) continue;
      if (tree) {
        const d = tree.dist[n] ?? Infinity;
        if (d < T.entryMin || d > T.entryMax) continue;
      } else if (!this.nearCamera(x, y, T.spawnRadius)) {
        continue;
      }
      if (Math.random() * ++seen < 1) chosen = n;
    }
    return chosen;
  }

  private pickHiddenExit(tree: PathTree | null, maxDist: number): number {
    let chosen = -1;
    let seen = 0;
    this.exits.forEach((e, i) => {
      if (!this.hidden(e.x, e.y)) return;
      const far = tree ? (tree.dist[e.node] ?? Infinity) > maxDist : !this.nearCamera(e.x, e.y, maxDist);
      if (!far && Math.random() * ++seen < 1) chosen = i;
    });
    return chosen;
  }

  private pickHub(x: number, y: number, radius: number, avoid: number): number {
    let chosen = -1;
    let seen = 0;
    const r2 = radius * radius;
    for (const n of this.hubs) {
      if (n === avoid) continue;
      const dx = (this.graph.xs[n] ?? 0) - x;
      const dy = (this.graph.ys[n] ?? 0) - y;
      if (dx * dx + dy * dy <= r2 && Math.random() * ++seen < 1) chosen = n;
    }
    return chosen;
  }

  private despawn(p: Person): void {
    if (p.role < 0) return; // already back in the pool (a second swap-remove would corrupt `active`)
    if (p.anchor) this.releaseSeat(p);
    this.counts[p.role] = (this.counts[p.role] ?? 0) - 1;
    p.role = -1;
    p.fadeLeft = 0;
    p.mode = "wait";
    p.goal = -1;
    p.tree = null;
    this.setShown(p, false);
    const last = this.active.pop();
    if (last && last !== p) {
      this.active[p.index] = last;
      last.index = p.index;
    }
    this.free.push(p);
  }

  // ──────────── rendering ────────────

  private setShown(p: Person, shown: boolean): void {
    p.visible = shown;
    p.sprite.setVisible(shown).setActive(shown);
    if (!shown) {
      p.sprite.anims.stop();
      p.animKey = "";
      p.staticTex = "";
    }
  }

  private render(p: Person, role: CrowdRole): void {
    const look = p.look;
    if (!look.sideView) p.flip = false;
    const glancing = p.glanceLeft > 0;
    let sink = 0;
    let crop = false;
    if ((p.mode === "graph" || p.mode === "hop") && !glancing) {
      const dx = p.bx - p.ax;
      const dir = BaseNPC.directionFromComponents(dx, p.by - p.ay);
      if (look.sideView && Math.abs(dx) > 0.5) p.flip = dx < 0;
      const gait = role.gait === "run" ? (look.run ?? look.walk) : (look.walk ?? look.run);
      const key = role.phoneWalk && look.phoneWalkAnim ? look.phoneWalkAnim : gait?.[dir];
      if (key) this.playAnim(p, key);
      else this.setStatic(p, look.face[FACING_OF[dir]]);
    } else if (p.mode === "still" && p.anchor) {
      const facing = glancing ? p.glanceFacing : this.seatFacing(p);
      this.faceFlip(p, facing);
      switch (role.pose) {
        case "seated":
        case "groundSit": {
          const real =
            role.pose === "seated" ? (look.sitFrames?.[facing] ?? look.sitFrame) : (look.groundSitFrames?.[facing] ?? look.groundSitFrame);
          if (real) {
            this.setStatic(p, real);
          } else {
            this.setStatic(p, look.face[facing]);
            crop = true;
            sink = (look.originY * look.frameH - look.seatCropY) * p.scale - 2;
          }
          break;
        }
        case "selfie":
          if (look.selfieAnim && !glancing) this.playAnim(p, look.selfieAnim);
          else if (look.selfieFrame && !glancing) this.setStatic(p, look.selfieFrame);
          else this.setStatic(p, look.face[glancing ? facing : "S"]);
          break;
        default:
          if (role.prop === "cigarette" && look.smokeFrame && !glancing) this.setStatic(p, look.smokeFrame);
          else if (look.idleAnim && !glancing) this.playAnim(p, look.idleAnim);
          else this.setStatic(p, look.face[facing]);
      }
    } else {
      const facing = glancing ? p.glanceFacing : "S";
      this.faceFlip(p, facing);
      this.setStatic(p, look.face[facing]);
    }

    const s = p.sprite;
    if (s.flipX !== p.flip) {
      s.setFlipX(p.flip);
      // Crop UVs depend on the flip; clear here and let the block below re-apply.
      if (p.cropped) {
        s.setCrop();
        p.cropped = false;
      }
    }
    if (crop !== p.cropped) {
      if (crop) s.setCrop(0, 0, look.frameW, look.seatCropY);
      else s.setCrop();
      p.cropped = crop;
    }
    s.setPosition(p.x, p.y + sink);
    const t = Math.min(1, Math.max(0, p.y / this.worldH));
    const depth = p.y < this.footY ? BEHIND_BASE + BEHIND_SPAN * t : DEPTH_BASE + DEPTH_SPAN * t;
    if (Math.abs(depth - p.depth) > 1e-4) {
      s.setDepth(depth);
      p.depth = depth;
    }
  }

  /** Pairs face each other, singles face the camera (selfie spots always face the camera). */
  private seatFacing(p: Person): Facing {
    const a = p.anchor;
    const seat = a ? ANCHOR_SEATS[a.type][p.seat] : undefined;
    if (!a || !seat) return "S";
    return a.used >= 2 || a.type === "selfie" ? seat.face : "S";
  }

  /** Side-view art: east/west set the flip, north/south keep whichever way the person last faced. */
  private faceFlip(p: Person, facing: Facing): void {
    if (!p.look.sideView) return;
    if (facing === "E") p.flip = false;
    else if (facing === "W") p.flip = true;
  }

  private playAnim(p: Person, key: string): void {
    if (p.animKey === key) return;
    p.sprite.anims.play(key);
    p.animKey = key;
    p.staticTex = "";
  }

  private setStatic(p: Person, [tex, frame]: readonly [string, number]): void {
    if (p.animKey === "" && p.staticTex === tex && p.staticFrame === frame) return;
    p.sprite.anims.stop();
    p.sprite.setTexture(tex, frame);
    p.animKey = "";
    p.staticTex = tex;
    p.staticFrame = frame;
    // A new frame resets the crop rectangle's UVs; force it to be re-applied.
    if (p.cropped) {
      p.sprite.setCrop();
      p.cropped = false;
    }
  }

  private drawProp(p: Person, role: CrowdRole): void {
    if (role.prop === "none") return;
    const g = p.y < this.footY ? this.propsBehind : this.props;
    const still = p.mode === "still";
    const side = p.flip ? -1 : 1;
    switch (role.prop) {
      case "cigarette": {
        if (!still) return;
        const t = ((this.timeMs + p.seed) % 1800) / 1800;
        if (p.look.smokeFrame) {
          // the pose already holds the cigarette at the lips: just the drifting smoke
          const mouthY = p.y - (p.look.originY - 0.3) * p.look.frameH * p.scale;
          g.fillStyle(0xdddddd, 0.35 * (1 - t)).fillCircle(p.x + 4 + t * 3, mouthY - 3 - t * 10, 1.5 + t * 2.5);
          return;
        }
        const hx = p.x + side * 5;
        const hy = p.y - 15;
        g.fillStyle(0xf5f5f5, 1).fillRect(hx, hy, 2, 1);
        const glow = 0.6 + 0.4 * Math.sin((this.timeMs + p.seed) / 180);
        g.fillStyle(0xff6a00, glow).fillRect(hx + side * 2, hy, 1, 1);
        g.fillStyle(0xdddddd, 0.35 * (1 - t)).fillCircle(hx + side * 2 + t * 3, hy - 3 - t * 10, 1.5 + t * 2.5);
        return;
      }
      case "food": {
        if (!still) return;
        const ground = role.pose === "groundSit";
        const fx = p.x + side * (ground ? 7 : 3);
        const fy = ground ? p.y - 2 : p.y - 5;
        g.fillStyle(0xfdfdfd, 1).fillRect(fx - 2, fy - 2, 5, 3);
        g.fillStyle(0xc0392b, 1).fillRect(fx - 2, fy - 2, 5, 1);
        return;
      }
      case "cup": {
        const a = p.anchor;
        const seat = a ? ANCHOR_SEATS[a.type][p.seat] : undefined;
        if (!still || !a || !seat) return;
        const cx = a.x + seat.dx * 0.35;
        g.fillStyle(0xffffff, 1).fillRect(cx - 1, a.y - 5, 3, 4);
        g.fillStyle(0x6b3e1f, 1).fillRect(cx - 1, a.y - 5, 3, 1);
        return;
      }
      case "phone": {
        const selfie = still && role.pose === "selfie";
        if (!selfie && !(role.phoneWalk && !still)) return;
        const girlArt = selfie ? !!(p.look.selfieAnim || p.look.selfieFrame) : !!p.look.phoneWalkAnim; // art already shows the phone
        const px = p.x + side * (selfie ? 9 : 5);
        const py = p.y - (selfie ? 30 : 20);
        if (!girlArt) g.fillStyle(0x1b1b1b, 1).fillRect(px - 1, py - 2, 2, 3);
        if (selfie && (this.timeMs + p.seed) % 4500 < 120) g.fillStyle(0xffffff, 0.85).fillCircle(px, py, 4);
        return;
      }
    }
  }

  private drawBlankets(): void {
    const g = this.blankets;
    g.clear();
    for (const a of this.anchors.get("picnic") ?? []) {
      if (a.used === 0 || !this.inView(a.x, a.y)) continue;
      g.fillStyle(a.blanket, 0.9).fillRect(a.x - 17, a.y - 7, 34, 18);
      g.fillStyle(0xffffff, 0.35).fillRect(a.x - 17, a.y - 1, 34, 3);
    }
  }

  // ──────────── guards ────────────

  private updateGuards(deltaMs: number, slot: CrowdSlot): void {
    const night = slot === "night";
    for (const g of this.guards) {
      const want = night ? g.night : true;
      // Shift changes only off-screen, so nobody pops in or out in view.
      if (want !== g.onDuty && this.hidden(g.npc.x, g.npc.y) && this.hidden(g.homeX, g.homeY)) {
        this.setDuty(g, want);
      }
      if (!g.onDuty) continue;
      g.npc.update(deltaMs);
      g.indicator?.update();
    }
  }

  private setDuty(g: CrowdGuard, on: boolean): void {
    g.onDuty = on;
    const body = g.npc.body as Phaser.Physics.Arcade.Body;
    if (on) {
      body.enable = true;
      g.npc.setActive(true).setVisible(true);
      g.npc.resetToPost();
      if (g.npc.disposition === "hostile") {
        g.indicator = new ThreatIndicator(this.scene, g.npc, "Guard", "dangerous", true, GUARD_HEAD_DROP_PX);
      }
      return;
    }
    g.npc.setVelocity(0);
    body.enable = false;
    g.npc.setActive(false).setVisible(false);
    g.indicator?.destroy();
    g.indicator = null;
  }
}

function newPerson(sprite: Phaser.GameObjects.Sprite, index: number): Person {
  return {
    sprite,
    index,
    role: -1,
    look: CROWD_LOOKS.walkerF,
    mode: "wait",
    intent: "roam",
    hopThen: "graph",
    x: 0,
    y: 0,
    ax: 0,
    ay: 0,
    bx: 0,
    by: 0,
    segLen: 1,
    segPos: 0,
    node: -1,
    toNode: -1,
    goal: -1,
    tree: null,
    stops: new Int32Array(6),
    stopCount: 0,
    stopIndex: 0,
    anchor: null,
    seat: 0,
    exitIdx: -1,
    dwellLeft: 0,
    fadeLeft: 0,
    speed: 40,
    scale: 1,
    flip: false,
    shed: false,
    visible: false,
    glanceLeft: 0,
    glanceCooldown: 0,
    glanceFacing: "S",
    noticeCooldown: 0,
    lingerMs: 0,
    treatRolled: false,
    seed: 0,
    animKey: "",
    staticTex: "",
    staticFrame: -1,
    cropped: false,
    depth: -1,
  };
}

/** Walkability of a straight hop, sampled every few px against colliding tiles on the given layers. */
function makeSegmentClear(layers: ReadonlyArray<Phaser.Tilemaps.TilemapLayer | null>): SegmentClear {
  const live = layers.filter((l): l is Phaser.Tilemaps.TilemapLayer => l !== null);
  const blocked = (x: number, y: number): boolean => {
    for (const layer of live) {
      const tile = layer.getTileAtWorldXY(x, y);
      if (tile && (tile.collides || tile.properties?.collides === true)) return true;
    }
    return false;
  };
  return (ax, ay, bx, by) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / HOP_SAMPLE_PX));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (blocked(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  };
}
