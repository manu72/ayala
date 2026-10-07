import type Phaser from "phaser";
import { DAY_NIGHT_PHASES, type TimeOfDay } from "./DayNightCycle";
import { nightLevel } from "../utils/nightLevel";
import { pickVehicle, VEHICLE_ATLAS, type VehicleModel } from "../data/vehicles";
import { topDownPose } from "../utils/kerbsideDropoff";
import { placesOfType, pointAlong, polylineLength, type MapPlace, type Pt } from "../utils/mapPlaces";
import {
  extendToBounds,
  fitLaneCount,
  hourOfDay,
  laneOffset,
  MIN_GAP_PX,
  offsetPolyline,
  reservedStretch,
  stepLane,
  trafficDensity,
  type LaneCar,
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
}

interface Lane {
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
 * world-fixed soft shadow. Purely visual; roads already block movement via tile
 * collision. Everything advances in {@link update}, so traffic freezes with the
 * game (pause, journal, cinematics) instead of running on tweens.
 */
export class TrafficSystem {
  private readonly lanes: Lane[] = [];
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

  constructor(
    private readonly scene: Phaser.Scene,
    places: ReadonlyArray<MapPlace>,
    options: TrafficOptions = {},
  ) {
    this.maxCars = options.maxCars ?? 70;
    this.rng = options.rng ?? Math.random;
    this.isCovered = options.isCovered ?? (() => false);
    this.fx = (scene.sys?.game?.renderer?.type ?? RENDERER_WEBGL) === RENDERER_WEBGL;
    for (const place of placesOfType(places, "traffic")) {
      if (!place.polyline || place.polyline.length < 2) continue;
      const centre = options.bounds ? extendToBounds(place.polyline, options.bounds) : place.polyline;
      if (polylineLength(centre) < 1) continue; // every vertex coincides: nothing to drive on
      const maxLanes = Math.max(1, Math.floor(Number(place.props.lanes) || 2));
      const lanes = options.isDrivable ? fitLaneCount(centre, maxLanes, options.isDrivable) : maxLanes;
      this.fitted.set(place.name, lanes);
      const mainRoad = MAIN_ROAD.test(`${place.name} ${String(place.props.road ?? "")}`);
      for (let k = 0; k < lanes; k++) {
        const pts = offsetPolyline(centre, laneOffset(lanes, k));
        this.lanes.push({ pts, length: polylineLength(pts), share: 0, target: 0, cars: [], spawnIn: 0, stretch: null, mainRoad, next: null });
      }
    }
    const total = this.lanes.reduce((sum, lane) => sum + lane.length, 0);
    for (const lane of this.lanes) lane.share = total > 0 ? lane.length / total : 0;
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

  /** Advance and draw traffic. Call from GameScene.update() after its pause/cinematic early-returns. */
  update(deltaMs: number, clock: TrafficClock): void {
    if (this.destroyed) return;
    // A NaN step would poison every car's dist/speed for good.
    const dt = Number.isFinite(deltaMs) ? Math.min(Math.max(deltaMs, 0), MAX_STEP_MS) / 1000 : 0;
    this.night = nightLevel(clock.currentPhase, clock.phaseProgress);
    const phase = DAY_NIGHT_PHASES[clock.currentPhase];
    const density = trafficDensity(hourOfDay(phase.startHour, DAY_NIGHT_PHASES[phase.next].startHour, clock.phaseProgress));
    for (const lane of this.lanes) lane.target = density * this.maxCars * lane.share;

    // The camera's worldView is only filled in by its first render; start (and
    // prewarm) only then, so prewarmed cars stay out of view instead of fading in beside the cat.
    if (!this.started) {
      if (this.scene.cameras.main.worldView.width <= 0) return;
      this.started = true;
      this.prewarm();
    }

    for (const lane of this.lanes) {
      stepLane(lane.cars, dt, lane.stretch ? lane.stretch[0] : null);
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
    if (room < model.length + SPAWN_CLEAR_PX || blocked) return; // retry next frame
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
    lane.cars.push({ ...sprites, dist, speed: cruise, cruise, length: model.length, fade: 0, shown: false });
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
        const p = pointAlong(lane.pts, car.dist);
        const half = car.length / 2; // a bus's centre can be off-screen while its nose is not
        if (p.x < left - half || p.x > right + half || p.y < top - half || p.y > bottom + half) {
          this.show(car, false);
          continue;
        }
        // Heading from the chord under the car body, so it turns smoothly through bends.
        const back = pointAlong(lane.pts, car.dist - half);
        const front = pointAlong(lane.pts, car.dist + half);
        const { rotation } = topDownPose(Math.atan2(front.y - back.y, front.x - back.x));
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
