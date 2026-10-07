import type { DrinkSpot } from "../utils/waterEdge";

type Pt = { x: number; y: number };

/** The parts of {@link NPCCat} a water trip drives (plain objects in tests). */
export interface TripCat extends Pt {
  readonly active: boolean;
  readonly state: string;
  readonly home: Pt;
  readonly inDialogue: boolean;
  readonly onErrand: boolean;
  followRoute(route: ReadonlyArray<Pt>, done: () => void): void;
  drink(water: Pt, ms: number, done: () => void): void;
}

export interface CatWaterTripsOptions<C extends TripCat> {
  cats: () => ReadonlyArray<C>;
  /** Where cats can stand to drink (see drinkSpots in utils/waterEdge). */
  spots: ReadonlyArray<DrinkSpot>;
  /** A walkable route from `from` ending at `to` (world px waypoints), or null when there is none. */
  route: (from: Pt, to: Pt) => Pt[] | null;
  player: () => Pt;
  /** True while a cinematic, dialogue or frozen story moment is on: no trip starts then. */
  storyMoment: () => boolean;
  /** Called as a cat starts drinking (e.g. a 💧 emote). */
  onDrink?: (cat: C) => void;
  rng?: () => number;
}

/** Each cat heads for water every 4-7 minutes of play: a few times per 14-minute day. */
export const TRIP_EVERY_MS: readonly [number, number] = [240_000, 420_000];
/** At most this many cats on a water trip at once, so the pond doesn't become a parade. */
export const MAX_TRAVELLING = 4;
const DRINK_MS: readonly [number, number] = [4_000, 7_000];
/** A cat Mamma Cat is right beside stays put. */
const PLAYER_NEAR_PX = 160;
/** A cat that can't go yet tries again after this. */
const RETRY_MS = 5_000;
/** Pick among this many nearest free drinking spots, so cats spread round the pond... */
const SPOT_CHOICE = 3;
/** ...trying up to this many nearest before giving up for now (each try is a nav-grid search). */
const SPOT_TRIES = 6;

interface Trip {
  /** The drinking spot it claimed (no two cats share one). */
  spot: DrinkSpot;
}

/**
 * Colony cats, named story cats included, walk to open water now and then
 * (the PSE pond, the McMicking pool, the Starbucks waterfall), drink a while
 * and walk home, as the real ATG cats do. No trip starts during a story
 * moment or for a cat Mamma Cat is right beside; one interrupted by a scare or
 * dialogue goes straight home afterwards. Cats can't find paths themselves, so
 * routes come from the human nav grid.
 */
export class CatWaterTrips<C extends TripCat> {
  /** Weak, so cats removed from the park (snatched) don't linger here. */
  private readonly due = new WeakMap<C, number>();
  private readonly trips = new Map<C, Trip>();
  private readonly rng: () => number;

  constructor(private readonly opts: CatWaterTripsOptions<C>) {
    this.rng = opts.rng ?? Math.random;
  }

  get travelling(): number {
    return this.trips.size;
  }

  update(deltaMs: number): void {
    if (this.opts.spots.length === 0) return;
    for (const cat of [...this.trips.keys()]) {
      if (!cat.active) {
        this.trips.delete(cat);
        continue;
      }
      // Scared off or talked to on the way: once it's calm, it goes home.
      if (!cat.onErrand && !cat.inDialogue && cat.state !== "alert" && cat.state !== "fleeing") this.sendHome(cat);
    }

    const story = this.opts.storyMoment();
    for (const cat of this.opts.cats()) {
      if (!cat.active || this.trips.has(cat)) continue;
      const left = (this.due.get(cat) ?? this.between(0, TRIP_EVERY_MS[1])) - deltaMs;
      this.due.set(cat, left);
      if (left > 0 || this.trips.size >= MAX_TRAVELLING) continue;
      if (story || !this.canSetOff(cat) || !this.setOff(cat)) {
        this.due.set(cat, RETRY_MS);
        continue;
      }
      this.due.set(cat, this.between(...TRIP_EVERY_MS));
    }
  }

  private canSetOff(cat: C): boolean {
    if (cat.inDialogue || cat.onErrand || (cat.state !== "idle" && cat.state !== "walking")) return false;
    const p = this.opts.player();
    return Math.hypot(p.x - cat.x, p.y - cat.y) > PLAYER_NEAR_PX;
  }

  private setOff(cat: C): boolean {
    const taken = new Set([...this.trips.values()].map((t) => t.spot));
    const home = cat.home;
    const near = this.opts.spots
      .filter((s) => !taken.has(s))
      .sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y))
      .slice(0, SPOT_TRIES);
    // One of the few nearest at random (cats spread round the pond); if there's no way there, the next nearest.
    const first = Math.floor(this.rng() * Math.min(SPOT_CHOICE, near.length));
    let spot: DrinkSpot | undefined;
    let route: Array<{ x: number; y: number }> | null = null;
    for (const candidate of [near[first], ...near.filter((_, i) => i !== first)]) {
      if (!candidate) continue;
      route = this.opts.route({ x: cat.x, y: cat.y }, candidate);
      if (route) {
        spot = candidate;
        break;
      }
    }
    if (!spot || !route) return false;
    this.trips.set(cat, { spot });
    cat.followRoute(route, () => {
      this.opts.onDrink?.(cat);
      cat.drink(spot.water, this.between(...DRINK_MS), () => this.sendHome(cat));
    });
    return true;
  }

  private sendHome(cat: C): void {
    const route = this.opts.route({ x: cat.x, y: cat.y }, cat.home);
    if (!route) {
      this.trips.delete(cat); // it wanders back on its own
      return;
    }
    cat.followRoute(route, () => this.trips.delete(cat));
  }

  private between(lo: number, hi: number): number {
    return lo + (hi - lo) * this.rng();
  }
}
