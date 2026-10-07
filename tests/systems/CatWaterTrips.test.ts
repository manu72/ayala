import { describe, expect, it, vi } from "vitest";
import { CatWaterTrips, MAX_TRAVELLING, TRIP_EVERY_MS, type TripCat } from "../../src/systems/CatWaterTrips";
import type { DrinkSpot } from "../../src/utils/waterEdge";

type Pt = { x: number; y: number };

/** A cat whose walks and drinks finish when the test says so. */
class FakeCat implements TripCat {
  active = true;
  state = "idle";
  inDialogue = false;
  onErrand = false;
  route: Pt[] | null = null;
  drinkingFrom: Pt | null = null;
  readonly home: Pt;
  private done: (() => void) | null = null;
  constructor(
    public x: number,
    public y: number,
  ) {
    this.home = { x, y };
  }
  followRoute(route: ReadonlyArray<Pt>, done: () => void): void {
    this.route = [...route];
    this.done = done;
    this.onErrand = true;
    this.state = "walking";
  }
  drink(water: Pt, _ms: number, done: () => void): void {
    this.route = null;
    this.drinkingFrom = water;
    this.done = done;
    this.onErrand = true;
    this.state = "drinking";
  }
  /** Arrive at the end of the route, or finish drinking. */
  finish(): void {
    const end = this.route?.[this.route.length - 1];
    if (end) Object.assign(this, { x: end.x, y: end.y });
    Object.assign(this, { route: null, drinkingFrom: null, onErrand: false, state: "idle" });
    const done = this.done;
    this.done = null;
    done?.();
  }
  /** A scare: the errand is dropped (NPCCat cancels it without calling back). */
  scare(): void {
    Object.assign(this, { route: null, drinkingFrom: null, onErrand: false, state: "alert", done: null });
  }
}

const spots: DrinkSpot[] = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 1000 + 32 * i, y: 0, water: { x: 1000 + 32 * i, y: -32 } }));

function setup(cats: FakeCat[], over: Partial<{ player: Pt; story: boolean; route: (from: Pt, to: Pt) => Pt[] | null }> = {}) {
  const onDrink = vi.fn();
  const state = { player: over.player ?? { x: -5000, y: -5000 }, story: over.story ?? false };
  const trips = new CatWaterTrips<FakeCat>({
    cats: () => cats,
    spots,
    route: over.route ?? ((from, to) => [from, to]),
    player: () => state.player,
    storyMoment: () => state.story,
    onDrink,
    rng: () => 0.5,
  });
  return { trips, onDrink, state };
}

describe("CatWaterTrips", () => {
  it("sends cats to water within the trip interval, no more than MAX_TRAVELLING at once, each to its own spot", () => {
    const cats = Array.from({ length: 10 }, (_, i) => new FakeCat(i * 50, 500));
    const { trips } = setup(cats);
    trips.update(TRIP_EVERY_MS[1] + 1);
    expect(trips.travelling).toBe(MAX_TRAVELLING);
    const going = cats.filter((c) => c.route);
    expect(going).toHaveLength(MAX_TRAVELLING);
    const ends = going.map((c) => JSON.stringify(c.route![c.route!.length - 1]));
    expect(new Set(ends).size).toBe(MAX_TRAVELLING);
  });

  it("walks there, drinks facing the water, walks home and is done", () => {
    const cat = new FakeCat(200, 500);
    const { trips, onDrink } = setup([cat]);
    trips.update(TRIP_EVERY_MS[1] + 1);
    const spot = cat.route![cat.route!.length - 1]!;
    expect(spots).toContainEqual(expect.objectContaining(spot));
    cat.finish(); // arrives
    expect(onDrink).toHaveBeenCalledWith(cat);
    expect(cat.drinkingFrom).toEqual(spots.find((s) => s.x === spot.x)!.water);
    cat.finish(); // drinks up
    expect(cat.route![cat.route!.length - 1]).toEqual(cat.home);
    cat.finish(); // home again
    expect(trips.travelling).toBe(0);
  });

  it("never sets off during a story moment, beside Mamma Cat or mid-dialogue", () => {
    const story = new FakeCat(200, 500);
    setup([story], { story: true }).trips.update(TRIP_EVERY_MS[1] + 1);
    const beside = new FakeCat(200, 500);
    setup([beside], { player: { x: 260, y: 500 } }).trips.update(TRIP_EVERY_MS[1] + 1);
    const talking = new FakeCat(200, 500);
    talking.inDialogue = true;
    setup([talking]).trips.update(TRIP_EVERY_MS[1] + 1);
    for (const cat of [story, beside, talking]) expect(cat.route).toBeNull();
  });

  it("sends a cat scared off on the way straight home once it has calmed down", () => {
    const cat = new FakeCat(200, 500);
    const { trips } = setup([cat]);
    trips.update(TRIP_EVERY_MS[1] + 1);
    cat.x = 600; // half way
    cat.scare();
    trips.update(16);
    expect(cat.route).toBeNull(); // still alert
    cat.state = "idle";
    trips.update(16);
    expect(cat.route?.[0]).toEqual({ x: 600, y: 500 });
    expect(cat.route?.[cat.route.length - 1]).toEqual(cat.home);
  });

  it("stays home when there is no way to the water, and tries again later", () => {
    const cat = new FakeCat(200, 500);
    let reachable = false;
    const { trips } = setup([cat], { route: (from, to) => (reachable ? [from, to] : null) });
    trips.update(TRIP_EVERY_MS[1] + 1);
    expect(cat.route).toBeNull();
    reachable = true;
    trips.update(5_001);
    expect(cat.route).not.toBeNull();
  });
});
