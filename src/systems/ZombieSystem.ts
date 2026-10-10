import type Phaser from "phaser";
import type { GameScene } from "../scenes/GameScene";
import { pixelCrowdTexture, type PixelLookId } from "../data/ambient-roles";
import { GP } from "../config/gameplayConstants";
import { hasLineOfSightTiles } from "../utils/lineOfSight";
import { offsetFromPolyline, placeNamed, placesOfType, type Pt } from "../utils/mapPlaces";
import { isRoadTile } from "../utils/roadTiles";

/** Shamble speeds, px/s (Mamma Cat walks at 80, runs at 160). */
const WANDER_SPEED = 10;
const CHASE_SPEED = 26;
const HOME_SPEED = 20;
/** They notice her this close, with a clear view: half that crouching, more running, never asleep. */
const SEE_PX = 128;
const SEE_CROUCHING_PX = 64;
const SEE_RUNNING_PX = 192;
/** ...and lose interest once she is this far off. */
export const ZOMBIE_LOSE_PX = 360;
/** Within reach they lunge, then need a moment to come again. */
export const ZOMBIE_GRAB_PX = 20;
const GRAB_PAUSE_MS = 2500;
/** She leaps this far from a lunge. */
const LEAP_PX = 72;
const LEAP_MS = 320;
/** A car body this close scares them back; touching (and moving) it knocks them flat. */
export const ZOMBIE_CAR_FRIGHT_PX = 40;
const BODY_PX = 8;
const KNOCKDOWN_MIN_SPEED = 30;
const DOWN_MS = 6000;
/**
 * Signed px from the Makati Ave northbound centreline (minus is west): they
 * may follow her out over the northbound lanes, never past the median.
 */
export const ZOMBIE_WEST_LIMIT_PX = -80;
/** After turning back they ignore her this long. */
const CALM_MS = 8000;
/** Idle shuffles stay this near home (each zombie's own spot in its swarm). */
const HOME_RADIUS = 48;
/** A swarm of 5 or 6 stands around its zombie_home within this radius, at least SPACING_PX apart. */
const SWARM_RADIUS = 64;
const SPACING_PX = 20;
/** Breadcrumb spacing on a chase; they retrace it home. */
const CRUMB_PX = 24;
/** Near enough a crumb to move on: mates on the same trail shoulder each other up to half SPACING_PX off it. */
const CRUMB_REACH_PX = 12;

// light clothes take the green tint best
const LOOKS: readonly PixelLookId[] = ["officeMan", "officeWoman", "barongMan"];
const TINTS = [0x8fcf78, 0xa6d48e];
const GROANS = ["Uuurgh…", "Hnnngh…", "Mrraagh…"];
/** PixelLab crowd sheet: standing frames per facing, and the feet line. */
const STAND = { down: 32, right: 33, up: 34, left: 35 } as const;
type Dir = keyof typeof STAND;

type Mode = "idle" | "wander" | "chase" | "home" | "down";
interface Zombie extends Pt {
  sprite: Phaser.GameObjects.Sprite;
  look: PixelLookId;
  swarm: Zombie[];
  home: Pt;
  mode: Mode;
  /** Wander goal. */
  goal: Pt | null;
  /** idle: next shuffle; wander: give up; chase: lunge recovered; down: gets up. */
  until: number;
  calmUntil: number;
  trail: Pt[];
  facing: Dir;
  moving: boolean;
  sway: number;
}

/**
 * Easter egg: swarms of 5 or 6 zombies loiter on the city side of Makati Ave
 * against the map's east edge. Mostly still until one spots Mamma Cat, which
 * wakes its whole swarm; they shamble after her and lunge, scaring her off. They never get past the avenue's
 * median: a car close by (or the median itself) turns them back, and they
 * retrace their steps home. Drivers don't stop for them, so a slow one gets
 * knocked flat; it gets up again.
 */
export class ZombieSystem {
  private readonly zombies: Zombie[] = [];
  private readonly makati: ReadonlyArray<Pt> = [];
  private narrated = false;
  /** One leap at a time, however many of a swarm lunge at once. */
  private leapUntil = 0;

  constructor(private readonly scene: GameScene) {
    const lane = placeNamed(scene.places, "traffic_makati_northbound")?.polyline;
    if (!lane) return;
    this.makati = lane;
    placesOfType(scene.places, "zombie_home").forEach((h, n) => {
      const swarm: Zombie[] = [];
      for (const spot of this.swarmSpots(h, 5 + (n % 2))) {
        const i = this.zombies.length;
        const look = LOOKS[i % LOOKS.length]!;
        const sprite = scene.add
          .sprite(spot.x, spot.y, pixelCrowdTexture(look), STAND.down)
          .setOrigin(0.5, 59 / 68)
          .setScale(0.7)
          .setTint(TINTS[i % TINTS.length]!)
          .setDepth(3);
        const z: Zombie = {
          sprite, look, swarm, ...spot, home: spot, mode: "idle", goal: null,
          until: scene.time.now + 2000 + Math.random() * 10000, calmUntil: 0, trail: [],
          facing: "down", moving: false, sway: Math.random() * Math.PI * 2,
        };
        swarm.push(z);
        this.zombies.push(z);
      }
    });
  }

  /** True while any zombie is after her (the danger music plays). */
  get chasing(): boolean {
    return this.zombies.some((z) => z.mode === "chase");
  }

  /** Every zombie's position and mode, for tests and live checks. */
  get all(): ReadonlyArray<Readonly<Pt & { mode: Mode }>> {
    return this.zombies;
  }

  update(deltaMs: number): void {
    const dt = Math.min(Math.max(deltaMs, 0), 100) / 1000;
    const now = this.scene.time.now;
    for (const z of this.zombies) {
      this.think(z, now, dt);
      this.draw(z, now);
    }
  }

  destroy(): void {
    for (const z of this.zombies) z.sprite.destroy();
    this.zombies.length = 0;
  }

  /** `count` open spots round a swarm's home, apart from each other; crowded ones fall back to the home itself. */
  private swarmSpots(home: Pt, count: number): Pt[] {
    const spots: Pt[] = [];
    for (let tries = 0; spots.length < count && tries < 200; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * SWARM_RADIUS;
      const p = { x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r };
      if (this.walkable(p.x, p.y) && !this.isOnRoad(p) && spots.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= SPACING_PX))
        spots.push(p);
    }
    while (spots.length < count) spots.push({ x: home.x, y: home.y });
    return spots;
  }

  /** One of them has seen her: the whole swarm comes. */
  private wake(z: Zombie, now: number): void {
    for (const m of z.swarm) {
      if (m.mode === "chase" || m.mode === "down" || now < m.calmUntil) continue;
      m.mode = "chase";
      m.until = now;
      m.goal = null;
      if (m.trail.length === 0) m.trail.push({ x: m.x, y: m.y });
      this.scene.emotes.show(this.scene, m.sprite, "hostile");
    }
  }

  private think(z: Zombie, now: number, dt: number): void {
    z.moving = false;
    if (z.mode === "down") {
      if (now >= z.until) {
        this.groan(z, "…hnngh");
        this.turnBack(z, now);
      }
      return;
    }

    // only those on the move can reach a road
    const car = z.mode === "chase" || z.mode === "home" ? this.scene.traffic.carNear(z, ZOMBIE_CAR_FRIGHT_PX) : null;
    if (car && car.gap <= BODY_PX && car.speed >= KNOCKDOWN_MIN_SPEED) return this.knockDown(z, car, now);
    if (car && z.mode === "chase") {
      this.scene.emotes.show(this.scene, z.sprite, "alert");
      return this.turnBack(z, now);
    }

    const p = this.scene.player;
    const dist = Math.hypot(p.x - z.x, p.y - z.y);
    if (z.mode !== "chase" && now >= z.calmUntil && this.notices(z, dist)) {
      this.wake(z, now);
      this.groan(z, GROANS[Math.floor(Math.random() * GROANS.length)]!);
      // once per save, and only once she really saw it (a narration that didn't show doesn't count)
      if (!this.narrated && !this.scene.curiosity?.zombiesSeen) {
        const shown = this.scene.narrateIfPerceivable(
          "That human moves wrong. Stiff and dragging, and it smells like the bins behind the mall at noon.",
          z,
          SEE_RUNNING_PX,
        );
        if (shown) {
          this.narrated = true;
          this.scene.curiosity?.markZombiesSeen();
        }
      }
    }

    switch (z.mode) {
      case "chase": {
        if (p.isResting || !p.visible || dist > ZOMBIE_LOSE_PX) {
          if (p.isResting && dist <= ZOMBIE_LOSE_PX) this.scene.emotes.show(this.scene, z.sprite, "curious");
          return this.turnBack(z, now);
        }
        if (now < z.until) return; // still recovering from a lunge
        if (dist < ZOMBIE_GRAB_PX) return this.lunge(z, now);
        if (this.step(z, p, CHASE_SPEED, dt) === "balked") {
          this.groan(z, GROANS[0]!);
          return this.turnBack(z, now);
        }
        const last = z.trail[z.trail.length - 1];
        if (!last || Math.hypot(z.x - last.x, z.y - last.y) >= CRUMB_PX) z.trail.push({ x: z.x, y: z.y });
        return;
      }
      case "home": {
        // crumbs out on the asphalt only lead back into traffic: make straight for the pavement instead
        while (z.trail.length > 0 && this.isOnRoad(z.trail[z.trail.length - 1]!)) z.trail.pop();
        const crumb = z.trail[z.trail.length - 1];
        if (!crumb) {
          z.mode = "idle";
          z.until = now + 4000 + Math.random() * 8000;
        } else if (Math.hypot(crumb.x - z.x, crumb.y - z.y) < CRUMB_REACH_PX || this.step(z, crumb, HOME_SPEED, dt) === "arrived") {
          z.trail.pop();
          z.moving = true; // still on its way: no stop-start at every crumb
        }
        return;
      }
      case "wander": {
        if (!z.goal || now >= z.until || this.step(z, z.goal, WANDER_SPEED, dt) !== "moving") {
          z.mode = "idle";
          z.goal = null;
          z.until = now + 6000 + Math.random() * 12000;
        }
        return;
      }
      case "idle": {
        if (now < z.until) return;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * HOME_RADIUS;
        const goal = { x: z.home.x + Math.cos(a) * r, y: z.home.y + Math.sin(a) * r };
        if (this.walkable(goal.x, goal.y) && !this.isOnRoad(goal)) {
          z.mode = "wander";
          z.goal = goal;
        }
        z.until = now + 8000;
        return;
      }
    }
  }

  private notices(z: Zombie, dist: number): boolean {
    const p = this.scene.player;
    if (p.isResting || !p.visible) return false;
    const range = p.isRunning ? SEE_RUNNING_PX : p.isCrouching ? SEE_CROUCHING_PX : SEE_PX;
    if (dist > range) return false;
    return hasLineOfSightTiles(z.x, z.y - 24, p.x, p.y, GP.TILE_SIZE, (x, y) => !this.walkable(x, y));
  }

  /** Shuffle toward `to`; "balked" if that would take it past the median. Slides along walls. */
  private step(z: Zombie, to: Pt, speed: number, dt: number): "arrived" | "moving" | "balked" {
    const dx = to.x - z.x;
    const dy = to.y - z.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) return "arrived";
    const s = Math.min(d, speed * dt);
    const nx = z.x + (dx / d) * s;
    const ny = z.y + (dy / d) * s;
    const off = offsetFromPolyline(this.makati, { x: nx, y: ny });
    // past the limit only ever eastward, so nothing knocked over it is stranded there
    if (off < ZOMBIE_WEST_LIMIT_PX && off < offsetFromPolyline(this.makati, z)) return "balked";
    if (this.walkable(nx, z.y)) z.x = nx;
    if (this.walkable(z.x, ny)) z.y = ny;
    // shoulder clear of swarm-mates rather than stacking on one spot
    for (const m of z.swarm) {
      const gap = Math.hypot(z.x - m.x, z.y - m.y);
      if (m === z || m.mode === "down" || gap >= SPACING_PX || gap === 0) continue;
      const px = z.x + ((z.x - m.x) / gap) * (SPACING_PX - gap) * 0.5;
      const py = z.y + ((z.y - m.y) / gap) * (SPACING_PX - gap) * 0.5;
      if (this.walkable(px, py) && offsetFromPolyline(this.makati, { x: px, y: py }) >= ZOMBIE_WEST_LIMIT_PX) {
        z.x = px;
        z.y = py;
      }
    }
    z.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down";
    z.moving = true;
    return "moving";
  }

  private turnBack(z: Zombie, now: number): void {
    z.mode = "home";
    z.goal = null;
    z.calmUntil = now + CALM_MS;
  }

  /** Lurch at her: she hisses and leaps clear, away from it. */
  private lunge(z: Zombie, now: number): void {
    const s = this.scene;
    const p = s.player;
    z.until = now + GRAB_PAUSE_MS;
    this.groan(z, "GRAAAH!");
    s.emotes.show(s, p, "danger");
    s.audio?.playCatGrowl();
    p.startle();
    if (now < this.leapUntil) return;
    this.leapUntil = now + LEAP_MS;
    const d = Math.hypot(p.x - z.x, p.y - z.y) || 1;
    const ux = (p.x - z.x) / d;
    const uy = (p.y - z.y) / d;
    const leap = { t: 0 };
    let done = 0;
    s.tweens.add({
      targets: leap,
      t: LEAP_PX,
      duration: LEAP_MS,
      ease: "Quad.easeOut",
      // per-frame deltas, like MammaCat.startle, so her own movement carries on
      onUpdate: () => {
        const dx = ux * (leap.t - done);
        const dy = uy * (leap.t - done);
        done = leap.t;
        if (this.walkable(p.x + dx, p.y + dy)) {
          p.x += dx;
          p.y += dy;
        }
      },
    });
  }

  /** A car that doesn't stop: flung along its heading, flat on the road for a while. */
  private knockDown(z: Zombie, car: { x: number; y: number; angle: number }, now: number): void {
    const s = this.scene;
    z.mode = "down";
    z.until = now + DOWN_MS;
    z.goal = null;
    s.audio?.playTyreScreech(s.earVolume(z.x, z.y));
    this.groan(z, "Urk!");
    const side = (z.x - car.x) * -Math.sin(car.angle) + (z.y - car.y) * Math.cos(car.angle) >= 0 ? 1 : -1;
    z.sprite.anims.stop();
    z.sprite.setFrame(STAND[z.facing]).setRotation(side * Math.PI * 0.5);
    // thrown along the car's way and a little aside; never over the median, into a wall or off the map
    const ok = (p: Pt) => this.walkable(p.x, p.y) && offsetFromPolyline(this.makati, p) >= ZOMBIE_WEST_LIMIT_PX;
    const along = { x: z.x + Math.cos(car.angle) * 40, y: z.y + Math.sin(car.angle) * 40 };
    const aside = { x: along.x - Math.sin(car.angle) * side * 12, y: along.y + Math.cos(car.angle) * side * 12 };
    const to = ok(aside) ? aside : ok(along) ? along : null;
    if (!to) return;
    // the landing is clear but the way there may clip a wall corner: like her leap, check every
    // sample, and stop where the first one would put it in a wall
    const pos = { x: z.x, y: z.y };
    let blocked = false;
    s.tweens.add({
      targets: pos,
      ...to,
      duration: 260,
      ease: "Quad.easeOut",
      onUpdate: () => {
        if (blocked) return;
        if (!ok(pos)) blocked = true;
        else {
          z.x = pos.x;
          z.y = pos.y;
        }
      },
    });
  }

  private draw(z: Zombie, now: number): void {
    const sp = z.sprite;
    sp.setPosition(z.x, z.y);
    // in front of Mamma Cat when lower on screen
    const footY = (this.scene.player.body as Phaser.Physics.Arcade.Body | null)?.bottom ?? this.scene.player.y;
    sp.setDepth(z.y < footY ? 2.99 : 3.01);
    if (z.mode === "down") return;
    const walk = `crowd-${z.look}-walk-${z.facing}`;
    if (z.moving && this.scene.anims.exists(walk)) sp.anims.play({ key: walk, frameRate: 4 }, true);
    else if (!z.moving) {
      if (sp.anims.isPlaying) sp.anims.stop();
      sp.setFrame(STAND[z.facing]);
    }
    // a slow pendulum sway from the feet, leaning into the shamble
    const lean = !z.moving ? 0 : z.facing === "left" ? -0.08 : z.facing === "right" ? 0.08 : 0;
    sp.setRotation(lean + Math.sin(now / 600 + z.sway) * (z.moving ? 0.12 : 0.04));
  }

  private groan(z: Zombie, line: string): void {
    const t = this.scene.add
      .text(z.x, z.y - 48, line, { fontSize: "11px", fontFamily: "monospace", color: "#a8d48f", stroke: "#000000", strokeThickness: 2 })
      .setOrigin(0.5)
      .setDepth(100);
    this.scene.tweens.add({ targets: t, y: t.y - 18, alpha: 0, duration: 1400, ease: "Power2", onComplete: () => t.destroy() });
  }

  /** Open ground or asphalt; never buildings, water or off the map. */
  private walkable(x: number, y: number): boolean {
    const ground = this.scene.groundLayer?.getTileAtWorldXY(x, y);
    if (!ground || (ground.collides && !isRoadTile(ground))) return false;
    return !this.scene.objectsLayer?.getTileAtWorldXY(x, y)?.collides;
  }

  private isOnRoad(p: Pt): boolean {
    return isRoadTile(this.scene.groundLayer?.getTileAtWorldXY(p.x, p.y));
  }
}
