import type Phaser from "phaser";
import { DAY_NIGHT_PHASES, type TimeOfDay } from "./DayNightCycle";
import { nightLevel } from "../utils/nightLevel";
import { pickVehicle, VEHICLE_ATLAS, WIDEST_VEHICLE_PX, type VehicleModel } from "../data/vehicles";
import { LANE_WIDTH_PX, topDownPose } from "../utils/kerbsideDropoff";
import { closestOnPolyline, placesOfType, pointAlong, polylineLength, type MapPlace, type Pt } from "../utils/mapPlaces";
import {
  CAT_GAP_PX,
  catInPath,
  extendToBounds,
  fitLaneCount,
  hourOfDay,
  laneOffset,
  MIN_GAP_PX,
  notPastCat,
  offsetPolyline,
  passClearance,
  sideGap,
  reservedStretch,
  stepLane,
  trafficDensity,
  type LaneCar,
  type LaneObstacle,
} from "../utils/trafficLanes";

/** Phaser.BlendModes.ADD (the type-only Phaser import has no runtime value). */
const BLEND_ADD = 1;
/** Phaser.WEBGL */
const RENDERER_WEBGL = 2;
const CAR_DEPTH = 4;
/** World-fixed drop shadow: the car's own frame in black, offset down-right in world space (sun fixed, cars turn). */
const SHADOW_DEPTH = CAR_DEPTH - 0.01;
const SHADOW_ALPHA = 0.28;
const SHADOW_DX = 3;
const SHADOW_DY = 4;
/** Headlights: an additive cone from the nose, above the night overlay (depth 50). */
const BEAM_DEPTH = 51;
const BEAM_ALPHA = 0.32;
const BEAM_TINT = 0xfff1d0;
/** Ayala Avenue and Paseo de Roxas carry nearly all the buses. */
const MAIN_ROAD = /ayala|paseo/i;
const MIN_CRUISE = 150;
const MAX_CRUISE = 200;
const MEAN_SPEED = (MIN_CRUISE + MAX_CRUISE) / 2;
/** Free road a spawn needs ahead of its nose, px (also the least bumper gap between prewarmed cars beyond MIN_GAP_PX). */
const SPAWN_CLEAR_PX = 48;
/** Alpha ramp at lane ends (normally off-map) and for new or re-revealed cars. */
const EDGE_FADE_PX = 96;
const FADE_IN_PER_S = 2.5;
const CULL_MARGIN_PX = 48;
/** Largest simulated step; a long frame hitch just skips ahead. */
const MAX_STEP_MS = 250;
/** Mamma Cat counts as still (drivers go round her) after this long within STILL_DRIFT_PX of one spot. */
const STILL_AFTER_MS = 2500;
const STILL_DRIFT_PX = 6;
/** A driver starts steering round a still cat this far short of her. */
const SWERVE_LOOKAHEAD_PX = 320;
/** Before borrowing the next lane it must be clear from this far behind the car's tail (traffic further back queues behind it, see markIntruders). */
const NEIGHBOUR_LOOKBACK_PX = 100;
/** Sideways px per forward px when steering; a stopped car still inches round at STEER_CREEP_PX_S. */
const STEER_RATIO = 0.35;
/** Motorbikes lean in much sharper. */
const AGILE_STEER_RATIO = 0.8;
const STEER_CREEP_PX_S = 30;
const MAX_YAW = 0.45;
/**
 * A car whose body (plus its side gap, which also bounds its drawn steering
 * swing) reaches further than this from its lane centre could touch a bus
 * centred in the next lane: it must check that lane and hold its traffic back.
 */
const NEXT_LANE_CLEAR_PX = LANE_WIDTH_PX - WIDEST_VEHICLE_PX / 2;
/** A driver held up by her honks after this (sooner after an emergency stop), now and then, a few times at most. */
const HORN_AFTER_MS = 1800;
const HORN_AFTER_SCREECH_MS = 500;
const HORN_CHANCE = 0.7;
/** Only drivers this close behind her (nose to cat, a few cars back) honk at her; further back they are just in a queue. */
const HORN_RANGE_PX = 320;
const MAX_HONKS = 3;

interface CarSprites {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  /** Created on first use after dusk. */
  beam?: Phaser.GameObjects.Image;
}

interface Car extends LaneCar, CarSprites {
  /** 0..1 visibility ramp (fade-in on spawn, fade-out inside a reservation). */
  fade: number;
  shown: boolean;
  width: number;
  lat: number;
  agile: boolean;
  /** Lateral offset the driver is steering toward, and which way round the cat (-1 left, 1 right, 0 not passing). */
  latTarget: number;
  swerve: -1 | 0 | 1;
  /** Lateral speed, px/s, for the nose's yaw while steering. */
  latVel: number;
  /** Time stopped for the cat, and when (in that time) the driver next considers the horn. */
  heldMs: number;
  hornAt: number;
  honks: number;
  /** Already screeched for this stop. */
  screeched: boolean;
}

interface Lane {
  /** The map `traffic` place this lane belongs to (one carriageway). */
  road: string;
  pts: Pt[];
  length: number;
  /** Fraction of the car cap this lane gets (its share of total lane length). */
  share: number;
  /** Desired car count right now. */
  target: number;
  /** Front first (descending dist); cars never overtake, so this order holds. */
  cars: Car[];
  spawnIn: number;
  stretch: [number, number] | null;
  /** Ayala Avenue / Paseo de Roxas (bus routes). */
  mainRoad: boolean;
  /** Model picked for the next spawn; kept until it fits, so big vehicles aren't skipped in queues. */
  next: VehicleModel | null;
  /** Same-direction lanes either side (right = toward the kerb). */
  right?: Lane;
  left?: Lane;
  /** Mamma Cat seen from this lane this frame, if she is near it. */
  cat: LaneObstacle | null;
  /** Stop lines behind cars from the next lane steering into this one round her. */
  stops: number[];
}

/** Where Mamma Cat is, for the drivers. */
export interface TrafficCat {
  x: number;
  y: number;
  /** Rough body radius, px. */
  radius: number;
  /** On the asphalt rather than the pavement. */
  onRoad: boolean;
  /** Sitting, asleep or collapsed. */
  settled: boolean;
}

export interface TrafficOptions {
  /** World size in px. Lane ends are carried straight on until they leave it, so cars enter and exit off-map. */
  bounds?: { width: number; height: number };
  /** True where a car may be drawn. Checked once, to drop outer lanes that would run onto pavement. */
  isDrivable?: (x: number, y: number) => boolean;
  /** Cap on cars alive at once (rush hour reaches it). */
  maxCars?: number;
  /** True where something overhead (tree canopy, roof) hides the road: headlights stay off there. */
  isCovered?: (x: number, y: number) => boolean;
  /** Mamma Cat each frame, or null while she can't be on the road (cars then ignore her). */
  cat?: () => TrafficCat | null;
  /** A car braked hard for her (tyre screech); world px of its nose. */
  onScreech?: (x: number, y: number) => void;
  /** A driver held up by her sounds the horn; world px of the car. */
  onHorn?: (x: number, y: number) => void;
  rng?: () => number;
}

/** The day-night readout traffic density follows ({@link DayNightCycle} satisfies it). */
export interface TrafficClock {
  currentPhase: TimeOfDay;
  phaseProgress: number;
}

/**
 * Ambient traffic on the map's `traffic` places: pooled, physics-free top-down
 * vehicles (the `vehicles` atlas, real scale) driving each lane in its real
 * direction with simple car-following, denser in the rush hours, each with a
 * world-fixed soft shadow. Mamma Cat may cross the roads: drivers brake for her
 * (screeching and honking if she darts out), crawl round her if she sits or
 * sleeps on the road, and never run her over. Cars have no physics bodies.
 * Everything advances in {@link update}, so traffic freezes with the game
 * (pause, journal, cinematics) instead of running on tweens.
 */
export class TrafficSystem {
  private readonly lanes: Lane[] = [];
  private closed: ReadonlySet<string> = new Set();
  private readonly fitted = new Map<string, number>();
  private readonly pool: CarSprites[] = [];
  private readonly maxCars: number;
  private readonly rng: () => number;
  private carTotal = 0;
  private visible = true;
  private started = false;
  private destroyed = false;
  /** 0 daylight .. 1 night: headlight strength. */
  private night = 0;
  private readonly isCovered: (x: number, y: number) => boolean;
  /**
   * Tint-based shadows and additive headlights need WebGL; Phaser's Canvas fallback
   * would draw the shadow as a second, full-colour car.
   */
  private readonly fx: boolean;
  private fadeOutMs = 0;
  private reservationId = 0;
  private readonly isDrivable?: (x: number, y: number) => boolean;
  private readonly catSource?: () => TrafficCat | null;
  private readonly onScreech?: (x: number, y: number) => void;
  private readonly onHorn?: (x: number, y: number) => void;
  /** Mamma Cat this frame, with drivers' idea of whether she is staying put. */
  private cat: (TrafficCat & { still: boolean }) | null = null;
  private catAnchor: Pt | null = null;
  private catStillMs = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    places: ReadonlyArray<MapPlace>,
    options: TrafficOptions = {},
  ) {
    this.maxCars = options.maxCars ?? 70;
    this.rng = options.rng ?? Math.random;
    this.isCovered = options.isCovered ?? (() => false);
    this.isDrivable = options.isDrivable;
    this.catSource = options.cat;
    this.onScreech = options.onScreech;
    this.onHorn = options.onHorn;
    this.fx = (scene.sys?.game?.renderer?.type ?? RENDERER_WEBGL) === RENDERER_WEBGL;
    for (const place of placesOfType(places, "traffic")) {
      if (!place.polyline || place.polyline.length < 2) continue;
      const centre = options.bounds ? extendToBounds(place.polyline, options.bounds) : place.polyline;
      if (polylineLength(centre) < 1) continue; // every vertex coincides: nothing to drive on
      const maxLanes = Math.max(1, Math.floor(Number(place.props.lanes) || 2));
      const lanes = options.isDrivable ? fitLaneCount(centre, maxLanes, options.isDrivable) : maxLanes;
      this.fitted.set(place.name, lanes);
      const mainRoad = MAIN_ROAD.test(`${place.name} ${String(place.props.road ?? "")}`);
      let kerbward: Lane | undefined;
      for (let k = 0; k < lanes; k++) {
        const pts = offsetPolyline(centre, laneOffset(lanes, k));
        const lane: Lane = { road: place.name, pts, length: polylineLength(pts), share: 0, target: 0, cars: [], spawnIn: 0, stretch: null, mainRoad, next: null, cat: null, stops: [] };
        if (kerbward) {
          lane.right = kerbward;
          kerbward.left = lane;
        }
        kerbward = lane;
        this.lanes.push(lane);
      }
    }
    const total = this.lanes.reduce((sum, lane) => sum + lane.length, 0);
    for (const lane of this.lanes) lane.share = total > 0 ? lane.length / total : 0;
  }

  /**
   * Close carriageways (map `traffic` place names) to cars, e.g. Paseo de Roxas for the Sunday
   * market: nothing spawns there, cars out of view are taken off at once, and those in view drive
   * on out. Pass [] to reopen.
   */
  setClosedRoads(roads: ReadonlyArray<string>): void {
    this.closed = new Set(roads);
  }

  /** Cars still on a closed carriageway (in view, driving out). */
  carsOnClosedRoads(): number {
    return this.lanes.filter((l) => this.closed.has(l.road)).reduce((n, l) => n + l.cars.length, 0);
  }

  get carCount(): number {
    return this.carTotal;
  }

  get laneCount(): number {
    return this.lanes.length;
  }

  /**
   * Lanes actually driven on the named `traffic` place (OSM's `lanes` minus any
   * that would leave the road); 0 if unknown. Scripted kerbside cars should use
   * this so they stop in the kerb lane the ambient cars use, not on the pavement.
   */
  lanesFor(placeName: string): number {
    return this.fitted.get(placeName) ?? 0;
  }

  /**
   * The car whose body comes nearest `p`, if within `radius` px of it: world
   * centre, heading, speed and the gap (0: touching). Drivers stop only for
   * Mamma Cat; this lets other actors (the zombies across Makati Ave) dodge or be hit.
   */
  carNear(p: Pt, radius: number): { x: number; y: number; angle: number; speed: number; gap: number } | null {
    if (this.destroyed || !this.visible) return null;
    let best: { x: number; y: number; angle: number; speed: number; gap: number } | null = null;
    let bestGap = Infinity;
    for (const lane of this.lanes) {
      const near = closestOnPolyline(lane.pts, p);
      if (near.distance > radius + 2 * LANE_WIDTH_PX + WIDEST_VEHICLE_PX) continue;
      const { angle } = pointAlong(lane.pts, near.along);
      const side = (p.x - near.x) * -Math.sin(angle) + (p.y - near.y) * Math.cos(angle) >= 0 ? 1 : -1;
      for (const car of lane.cars) {
        if (car.fade <= 0.01) continue;
        const gap = Math.hypot(
          Math.max(0, Math.abs(near.along - car.dist) - car.length / 2),
          Math.max(0, Math.abs(side * near.distance - car.lat) - car.width / 2),
        );
        if (gap > radius || gap >= bestGap) continue;
        bestGap = gap;
        best = { ...this.laneToWorld(lane, car.dist, car.lat), angle: pointAlong(lane.pts, car.dist).angle, speed: car.speed, gap };
      }
    }
    return best;
  }

  /** Advance and draw traffic. Call from GameScene.update() after its pause/cinematic early-returns. */
  update(deltaMs: number, clock: TrafficClock): void {
    if (this.destroyed) return;
    // A NaN step would poison every car's dist/speed for good.
    const dt = Number.isFinite(deltaMs) ? Math.min(Math.max(deltaMs, 0), MAX_STEP_MS) / 1000 : 0;
    this.night = nightLevel(clock.currentPhase, clock.phaseProgress);
    const phase = DAY_NIGHT_PHASES[clock.currentPhase];
    const density = trafficDensity(hourOfDay(phase.startHour, DAY_NIGHT_PHASES[phase.next].startHour, clock.phaseProgress));
    for (const lane of this.lanes) {
      const closed = this.closed.has(lane.road);
      lane.target = closed ? 0 : density * this.maxCars * lane.share;
      if (closed && lane.cars.some((c) => !c.shown)) {
        lane.cars = lane.cars.filter((c) => c.shown || (this.recycle(c), false));
      }
    }

    // The camera's worldView is only filled in by its first render; start (and
    // prewarm) only then, so prewarmed cars stay out of view instead of fading in beside the cat.
    if (!this.started) {
      if (this.scene.cameras.main.worldView.width <= 0) return;
      this.started = true;
      this.prewarm();
    }

    this.watchCat(dt);
    for (const lane of this.lanes) {
      lane.cat = this.cat ? this.catOn(lane, this.cat) : null;
      lane.stops.length = 0;
    }
    for (const lane of this.lanes) this.markIntruders(lane);
    for (const lane of this.lanes) this.planSwerves(lane);

    for (const lane of this.lanes) {
      stepLane(lane.cars, dt, lane.stretch ? lane.stretch[0] : null, { cat: lane.cat, stops: lane.stops });
      this.steer(lane, dt);
      this.driverReactions(lane, dt);
      let front = lane.cars[0];
      while (front && front.dist - front.length / 2 >= lane.length) {
        lane.cars.shift();
        this.recycle(front);
        front = lane.cars[0];
      }
      this.trySpawn(lane, dt);
    }
    this.draw(dt);
  }

  /**
   * Keep the road around `point` clear for a scripted car: cars overlapping the
   * stretch of any lane within `radiusPx` are hidden (at once, or over
   * `fadeOutMs` when update() is running), cars approaching it queue at its
   * upstream edge, and nothing spawns into it. One reservation at a time; a new
   * call replaces the old one. Returns a token for {@link release}.
   */
  reserve(point: Pt, radiusPx: number, fadeOutMs = 0): number {
    this.reservationId += 1;
    this.fadeOutMs = Math.max(0, fadeOutMs);
    for (const lane of this.lanes) {
      lane.stretch = reservedStretch(lane.pts, point, radiusPx);
      if (!lane.stretch || this.fadeOutMs > 0) continue;
      for (const car of lane.cars) {
        if (this.inStretch(lane, car)) {
          car.fade = 0;
          this.show(car, false);
        }
      }
    }
    return this.reservationId;
  }

  /**
   * Lift the reservation; queued cars move off and hidden cars fade back in.
   * With a token, only lifts that reservation (a newer one, e.g. an overlapping
   * dumping event, stays in place).
   */
  release(token?: number): void {
    if (token !== undefined && token !== this.reservationId) return;
    for (const lane of this.lanes) lane.stretch = null;
  }

  /** Scene-wide show/hide (hiding is immediate; cars keep driving while hidden and fade back in when shown). */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) return;
    for (const lane of this.lanes) {
      for (const car of lane.cars) {
        car.fade = 0;
        this.show(car, false);
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    for (const lane of this.lanes) {
      for (const car of lane.cars) {
        car.img.destroy();
        car.shadow.destroy();
        car.beam?.destroy();
      }
      lane.cars = [];
    }
    for (const sprites of this.pool) {
      sprites.img.destroy();
      sprites.shadow.destroy();
      sprites.beam?.destroy();
    }
    this.pool.length = 0;
    this.carTotal = 0;
  }

  // ──────────── internals ────────────

  private headway(lane: Lane): number {
    return lane.target > 0 ? lane.length / (lane.target * MEAN_SPEED) : Infinity;
  }

  /**
   * First update: scatter the current hour's traffic along every lane so the
   * roads aren't empty at load. Never inside the camera view, where a car would
   * visibly materialise next to the cat (e.g. as the intro ends); those drive in.
   */
  private prewarm(): void {
    const view = this.scene.cameras.main.worldView;
    for (const lane of this.lanes) {
      const n = Math.floor(lane.target) + (this.rng() < lane.target % 1 ? 1 : 0);
      for (let i = n - 1; i >= 0; i--) {
        const dist = ((i + 0.2 + 0.6 * this.rng()) * lane.length) / n;
        const model = pickVehicle(this.rng, lane.mainRoad);
        const half = model.length / 2;
        const ahead = lane.cars[lane.cars.length - 1];
        if (ahead && ahead.dist - ahead.length / 2 - (dist + half) < MIN_GAP_PX + SPAWN_CLEAR_PX) continue;
        if (lane.stretch && dist + model.length > lane.stretch[0] && dist - model.length < lane.stretch[1]) continue;
        const pad = CULL_MARGIN_PX + model.length;
        const p = pointAlong(lane.pts, dist);
        const inView =
          p.x > view.x - pad && p.x < view.x + view.width + pad && p.y > view.y - pad && p.y < view.y + view.height + pad;
        if (inView) continue;
        this.spawn(lane, dist, model);
      }
      lane.spawnIn = this.headway(lane) * this.rng();
    }
  }

  private trySpawn(lane: Lane, dt: number): void {
    const headway = this.headway(lane);
    lane.spawnIn = Math.min(lane.spawnIn - dt, headway * 1.6);
    if (lane.spawnIn > 0 || lane.cars.length >= Math.ceil(lane.target) || this.carTotal >= this.maxCars) return;
    const model = (lane.next ??= pickVehicle(this.rng, lane.mainRoad));
    const tail = lane.cars[lane.cars.length - 1];
    const room = tail ? tail.dist - tail.length / 2 - MIN_GAP_PX : Infinity;
    const blocked = lane.stretch !== null && lane.stretch[0] < model.length + SPAWN_CLEAR_PX;
    const cat = lane.cat;
    const catThere =
      cat !== null && cat.along - cat.radius < model.length + SPAWN_CLEAR_PX + CAT_GAP_PX && catInPath({ dist: 0, speed: 0, cruise: 0, length: model.length, width: model.width }, cat);
    if (room < model.length + SPAWN_CLEAR_PX || blocked || catThere) return; // retry next frame
    this.spawn(lane, 0, model);
    lane.next = null;
    lane.spawnIn = headway * (0.4 + 1.2 * this.rng());
  }

  private spawn(lane: Lane, dist: number, model: VehicleModel): void {
    if (this.carTotal >= this.maxCars) return;
    const sprites = this.pool.pop() ?? {
      img: this.scene.add.image(0, 0, VEHICLE_ATLAS, model.frame).setDepth(CAR_DEPTH),
      shadow: this.scene.add.image(0, 0, VEHICLE_ATLAS, model.frame).setDepth(SHADOW_DEPTH).setTint(0x000000),
    };
    sprites.img.setFrame(model.frame).setVisible(false);
    sprites.shadow.setFrame(model.frame).setVisible(false);
    sprites.beam?.setVisible(false);
    const cruise = MIN_CRUISE + (MAX_CRUISE - MIN_CRUISE) * this.rng();
    lane.cars.push({
      ...sprites,
      dist,
      speed: cruise,
      cruise,
      length: model.length,
      width: model.width,
      agile: model.agile === true,
      fade: 0,
      shown: false,
      lat: 0,
      latTarget: 0,
      swerve: 0,
      latVel: 0,
      heldMs: 0,
      hornAt: HORN_AFTER_MS * (1 + 0.8 * this.rng()),
      honks: 0,
      screeched: false,
    });
    this.carTotal++;
  }

  private recycle(car: Car): void {
    car.img.setVisible(false);
    car.shadow.setVisible(false);
    car.beam?.setVisible(false);
    this.pool.push({ img: car.img, shadow: car.shadow, beam: car.beam });
    this.carTotal--;
  }

  private inStretch(lane: Lane, car: Car): boolean {
    const s = lane.stretch;
    return s !== null && car.dist + car.length / 2 > s[0] && car.dist - car.length / 2 < s[1];
  }

  private show(car: Car, shown: boolean): void {
    if (car.shown === shown) return;
    car.shown = shown;
    car.img.setVisible(shown);
    car.shadow.setVisible(shown && this.fx);
    if (!shown) car.beam?.setVisible(false);
  }

  /** Lane px + right-of-travel offset to world px. */
  private laneToWorld(lane: Lane, along: number, lat: number): Pt {
    const p = pointAlong(lane.pts, along);
    return { x: p.x - Math.sin(p.angle) * lat, y: p.y + Math.cos(p.angle) * lat };
  }

  /** Read Mamma Cat; she is "still" once settled, or after STILL_AFTER_MS without wandering off one spot. */
  private watchCat(dt: number): void {
    const raw = this.catSource?.() ?? null;
    if (!raw) {
      this.cat = null;
      this.catAnchor = null;
      return;
    }
    if (!this.catAnchor || Math.hypot(raw.x - this.catAnchor.x, raw.y - this.catAnchor.y) > STILL_DRIFT_PX) {
      this.catAnchor = { x: raw.x, y: raw.y };
      this.catStillMs = 0;
    } else this.catStillMs += dt * 1000;
    this.cat = { ...raw, still: raw.settled || this.catStillMs >= STILL_AFTER_MS };
  }

  /** The cat in a lane's terms, or null when she is more than two lanes off it. */
  private catOn(lane: Lane, cat: TrafficCat & { still: boolean }): LaneObstacle | null {
    const near = closestOnPolyline(lane.pts, cat);
    if (near.distance > 2 * LANE_WIDTH_PX) return null;
    const { angle } = pointAlong(lane.pts, near.along);
    const side = (cat.x - near.x) * -Math.sin(angle) + (cat.y - near.y) * Math.cos(angle) >= 0 ? 1 : -1;
    return { along: near.along, lateral: side * near.distance, radius: cat.radius, onRoad: cat.onRoad, still: cat.still };
  }

  /**
   * A car whose body pokes (or is about to poke) into the next lane while
   * passing her holds that lane's traffic back behind it.
   */
  private markIntruders(lane: Lane): void {
    for (const car of lane.cars) {
      const reach = Math.max(Math.abs(car.lat), car.swerve !== 0 ? Math.abs(car.latTarget) : 0);
      if (!this.reachesNextLane(car, reach)) continue;
      const into = (car.swerve || car.lat) > 0 ? lane.right : lane.left;
      if (!into) continue;
      const along = closestOnPolyline(into.pts, this.laneToWorld(lane, car.dist, car.lat)).along;
      into.stops.push(along - car.length / 2 - MIN_GAP_PX);
    }
  }

  /**
   * Drivers approaching a still cat pick a way round her: the nearer side that
   * stays on the asphalt and, if it borrows the next lane, only when that lane
   * is clear. With no way round they wait (and may honk). Motorbikes don't wait
   * for her to settle and may put a wheel on the pavement. Everyone else heads
   * back to the lane centre.
   */
  private planSwerves(lane: Lane): void {
    const cat = lane.cat;
    for (const car of lane.cars) {
      if (!cat || !(cat.still || car.agile) || !notPastCat(car, cat)) {
        car.swerve = 0;
        car.latTarget = 0;
        continue;
      }
      const need = passClearance(car, cat) + 2;
      const toCat = cat.along - cat.radius - (car.dist + car.length / 2);
      if (car.swerve !== 0) {
        // She may shuffle: follow her, but further out only if that way is still clear.
        const lat = cat.lateral + car.swerve * need;
        if (Math.abs(lat) > LANE_WIDTH_PX) car.swerve = 0; // no longer fits that way: think again next frame
        else if (Math.abs(lat) <= Math.abs(car.latTarget) || this.canPass(lane, car, cat, lat, toCat)) car.latTarget = lat;
        // else it keeps the line it checked, and stops for her if she is now in it
        continue;
      }
      car.latTarget = 0;
      if (toCat > SWERVE_LOOKAHEAD_PX || Math.abs(cat.lateral) >= need) continue;
      const sides: Array<-1 | 1> = [-1, 1];
      sides.sort((a, b) => Math.abs(cat.lateral + a * need) - Math.abs(cat.lateral + b * need));
      for (const side of sides) {
        const lat = cat.lateral + side * need;
        if (Math.abs(lat) <= LANE_WIDTH_PX && this.canPass(lane, car, cat, lat, toCat)) {
          car.swerve = side;
          car.latTarget = lat;
          break;
        }
      }
    }
  }

  private canPass(lane: Lane, car: Car, cat: LaneObstacle, lat: number, toCat: number): boolean {
    const halfW = car.width / 2;
    if (this.reachesNextLane(car, lat)) {
      const into = lat > 0 ? lane.right : lane.left;
      if (!into || !this.cat) return false; // kerb, median or oncoming traffic that way
      const at = closestOnPolyline(into.pts, this.cat).along;
      const from = at - cat.radius - Math.max(0, toCat) - car.length - NEIGHBOUR_LOOKBACK_PX;
      const to = at + cat.radius + car.length + 120; // nothing slow just ahead to run into either
      if (into.cars.some((n) => n.dist + n.length / 2 > from && n.dist - n.length / 2 < to)) return false;
    }
    if (!this.isDrivable || car.agile) return true;
    for (const along of [cat.along - car.length / 2, cat.along, cat.along + car.length / 2])
      for (const edge of [-halfW, halfW]) {
        const p = this.laneToWorld(lane, along, lat + edge);
        if (!this.isDrivable(p.x, p.y)) return false;
      }
    return true;
  }

  private reachesNextLane(car: Car, lat: number): boolean {
    return Math.abs(lat) + car.width / 2 + sideGap(car) > NEXT_LANE_CLEAR_PX;
  }

  /**
   * Ease each car toward its lateral target. Level with her a car holds its
   * line: no sliding or turning beside or over her (and a car stopped over her
   * doesn't move at all).
   */
  private steer(lane: Lane, dt: number): void {
    const cat = lane.cat;
    for (const car of lane.cars) {
      const level = cat !== null && notPastCat(car, cat) && car.dist + car.length / 2 > cat.along - cat.radius - CAT_GAP_PX;
      const step = Math.max(car.speed, STEER_CREEP_PX_S) * (car.agile ? AGILE_STEER_RATIO : STEER_RATIO) * dt;
      const lat = level ? car.lat : car.lat + Math.max(-step, Math.min(step, car.latTarget - car.lat));
      car.latVel = dt > 0 ? (lat - car.lat) / dt : 0;
      car.lat = lat;
    }
  }

  /**
   * Tyre screech on an emergency stop; a driver held up by her, whatever she
   * is doing, may honk. Cars faded out of a scripted car's reserved stretch
   * still stop for her, but make no sound.
   */
  private driverReactions(lane: Lane, dt: number): void {
    for (const car of lane.cars) {
      const heard = this.visible && car.fade > 0.01 && !this.inStretch(lane, car);
      if (!car.blocked) {
        if (car.screeched || car.heldMs > 0 || car.honks > 0) {
          car.screeched = false;
          car.heldMs = 0;
          car.honks = 0;
          car.hornAt = HORN_AFTER_MS * (1 + 0.8 * this.rng());
        }
        continue;
      }
      if (car.hardBraking && !car.screeched) {
        car.screeched = true;
        car.heldMs = 0;
        car.hornAt = HORN_AFTER_SCREECH_MS * (1 + 0.8 * this.rng());
        // Heard, not seen: the camera may lag a dart onto the road. Callers fade it with distance.
        // From the nose, where the tyres stop short of her (a bus's centre is ~100 px back).
        if (heard) {
          const p = this.laneToWorld(lane, car.dist + car.length / 2, car.lat);
          this.onScreech?.(p.x, p.y);
        }
      }
      const cat = lane.cat;
      if (car.speed >= 5 || !cat || cat.along - (car.dist + car.length / 2) > HORN_RANGE_PX) continue;
      car.heldMs += dt * 1000;
      if (car.heldMs < car.hornAt || car.honks >= MAX_HONKS) continue;
      car.honks++;
      car.hornAt = car.heldMs + 3500 + 2500 * this.rng();
      if (heard && this.rng() < HORN_CHANCE) {
        const p = this.laneToWorld(lane, car.dist, car.lat);
        this.onHorn?.(p.x, p.y);
      }
    }
  }

  private draw(dt: number): void {
    const view = this.scene.cameras.main.worldView;
    const left = view.x - CULL_MARGIN_PX;
    const right = view.x + view.width + CULL_MARGIN_PX;
    const top = view.y - CULL_MARGIN_PX;
    const bottom = view.y + view.height + CULL_MARGIN_PX;
    const fadeOut = this.fadeOutMs > 0 ? (dt * 1000) / this.fadeOutMs : 1;
    for (const lane of this.lanes) {
      for (const car of lane.cars) {
        car.fade = this.inStretch(lane, car) ? Math.max(0, car.fade - fadeOut) : Math.min(1, car.fade + FADE_IN_PER_S * dt);
        const alpha = car.fade * Math.min(1, car.dist / EDGE_FADE_PX, (lane.length - car.dist) / EDGE_FADE_PX);
        if (!this.visible || alpha <= 0.01) {
          this.show(car, false);
          continue;
        }
        const p = this.laneToWorld(lane, car.dist, car.lat);
        const half = car.length / 2; // a bus's centre can be off-screen while its nose is not
        if (p.x < left - half || p.x > right + half || p.y < top - half || p.y > bottom + half) {
          this.show(car, false);
          continue;
        }
        // Heading from the chord under the car body, so it turns smoothly through bends, plus any steering yaw.
        const back = this.laneToWorld(lane, car.dist - half, car.lat);
        const front = this.laneToWorld(lane, car.dist + half, car.lat);
        // Steering yaw, capped so the corners never swing out further than the car's side gap.
        const maxYaw = Math.min(MAX_YAW, Math.asin(Math.min(1, sideGap(car) / half)));
        const yaw = Math.max(-maxYaw, Math.min(maxYaw, Math.atan2(car.latVel, Math.max(car.speed, 40))));
        const { rotation } = topDownPose(Math.atan2(front.y - back.y, front.x - back.x) + yaw);
        car.img.setPosition(p.x, p.y).setRotation(rotation).setAlpha(alpha);
        car.shadow
          .setPosition(p.x + SHADOW_DX, p.y + SHADOW_DY)
          .setRotation(rotation)
          .setAlpha(alpha * SHADOW_ALPHA);
        this.show(car, true);
        if (this.fx && this.night > 0.02 && !this.isCovered(front.x, front.y)) {
          car.beam ??= this.scene.add.image(0, 0, "light_beam").setOrigin(0, 0.5).setDepth(BEAM_DEPTH).setBlendMode(BLEND_ADD).setTint(BEAM_TINT);
          car.beam.setPosition(front.x, front.y).setRotation(rotation).setAlpha(alpha * this.night * BEAM_ALPHA).setVisible(true);
        } else car.beam?.setVisible(false);
      }
    }
  }
}
