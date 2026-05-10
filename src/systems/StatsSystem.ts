export interface CatStats {
  hunger: number;
  thirst: number;
  energy: number;
}

/** Per-second base decay rates (subtracted each real-time second). Exported for tests and tooling. */
export const STATS_DECAY = {
  hunger: 0.05,
  thirst: 0.1,
  energyRest: 0.05,
  energyMoving: 0.15,
  energyRunning: 0.3,
} as const;

/** Multiplier on decay during heat when not in shade. */
export const STATS_HEAT_MULTIPLIER = 1.5;

/** Passive energy regen per second (idle, not deliberate rest). */
export const STATS_SHADE_ENERGY_REGEN = 0.2;
export const STATS_SHELTER_ENERGY_REGEN = 0.5;

/** Deliberate rest/sleep energy gain (per second). */
export const STATS_REST_RATE_OPEN = 0.2;
export const STATS_REST_RATE_SHADE = 0.5;
export const STATS_REST_RATE_SAFE = 1.0;

/**
 * Hunger/thirst decay multiplier while deliberately resting.
 *
 * Resting represents lower metabolic activity, but a sleeping cat still
 * needs food and water — she does not wake up days later fully refreshed.
 * Pre-v0.3.8 this was 0.1 (effectively pausing hunger/thirst), which let
 * the player sleep through multiple in-game days with no consequence and
 * was a load-bearing part of the chapter-cascade-after-sleep bug. Set to
 * 0.5 so a full day of rest costs roughly half a day's worth of stats.
 */
export const STATS_REST_DECAY_MULTIPLIER = 0.5;

/**
 * Minimum hunger/thirst required before deliberate rest can restore energy.
 * A starving or dehydrated cat cannot recover by sleeping; she has to wake
 * up and find food/water first. Below this threshold, rest decays hunger
 * and thirst as normal but no energy is gained.
 */
export const STATS_REST_REGEN_HUNGER_MIN = 20;
export const STATS_REST_REGEN_THIRST_MIN = 20;

/** Stat multipliers for `speedMultiplier`.
 * Thresholds are hardcoded in the getter speedMultiplier function.
 * Exported for tests. */

export const STATS_SPEED_PENALTY = {
  hunger30: 0.6, // reduced from 0.8 to 0.6 19/4/26
  hunger10: 0.3, // reduced from 0.5 to 0.3 19/4/26
  thirst20: 0.6, // reduced from 0.8 to 0.6 19/4/26
  energy20: 0.5, // reduced from 0.7 to 0.5 19/4/26
  minMultiplier: 0.1, // minimum speed multiplier for exhausted mamma cat reduced from .25 to .1 19/4/26
} as const;

/** Grace period before collapse triggers. This is not the warning screen.
 * Duration (ms) a stat must be at 0 before collapse triggers. */
export const COLLAPSE_THRESHOLD_MS = 30_000;

/** Minimum stat floors applied by `resetCollapse()` after recovery. */
export const STATS_RESET_MIN_ENERGY = 30;
export const STATS_RESET_MIN_HUNGER = 15;
export const STATS_RESET_MIN_THIRST = 15;

export class StatsSystem {
  hunger = 100;
  thirst = 100;
  energy = 100;

  private collapseTimer = 0;
  private _collapsed = false;

  get collapsed(): boolean {
    return this._collapsed;
  }

  /** Stat-based speed multiplier (cumulative product of penalties, floored at `STATS_SPEED_PENALTY.minMultiplier`). */
  get speedMultiplier(): number {
    let m = 1.0;
    if (this.hunger < 10) m *= STATS_SPEED_PENALTY.hunger10;
    else if (this.hunger < 30) m *= STATS_SPEED_PENALTY.hunger30;
    if (this.thirst < 20) m *= STATS_SPEED_PENALTY.thirst20;
    if (this.energy < 20) m *= STATS_SPEED_PENALTY.energy20;
    return Math.max(STATS_SPEED_PENALTY.minMultiplier, m);
  }

  /** True when any stat is low enough to darken screen edges. */
  get screenDarken(): boolean {
    return this.hunger < 10 || this.thirst < 10;
  }

  /** True when energy is too low to run. */
  get canRun(): boolean {
    return this.energy >= 20;
  }

  /**
   * Tick the decay system.
   * @param deltaSec - frame delta in seconds
   * @param isMoving - player is walking
   * @param isRunning - player is sprinting
   * @param isHeatActive - midday heat phase
   * @param inShade - under tree canopy
   * @param inShelter - in a sheltered rest spot
   * @param isResting - player is deliberately resting/sleeping
   */
  update(
    deltaSec: number,
    isMoving: boolean,
    isRunning: boolean,
    isHeatActive: boolean,
    inShade: boolean,
    inShelter: boolean,
    isResting = false,
  ): void {
    if (this._collapsed) return;

    const heatMod = isHeatActive && !inShade ? STATS_HEAT_MULTIPLIER : 1.0;

    // Hunger/thirst always decay, but at reduced rate while resting
    const decayMod = isResting ? STATS_REST_DECAY_MULTIPLIER : 1.0;
    this.hunger = Math.max(0, this.hunger - STATS_DECAY.hunger * heatMod * decayMod * deltaSec);
    this.thirst = Math.max(0, this.thirst - STATS_DECAY.thirst * heatMod * decayMod * deltaSec);

    if (isResting) {
      // Energy only restores when Mamma is well-fed and hydrated. A starving
      // or dehydrated cat cannot recover by sleeping — she has to wake up,
      // find food and water, then rest. Hunger/thirst still decay above
      // (gated by STATS_REST_DECAY_MULTIPLIER) so a long sleep on a near-
      // empty stomach actively pushes Mamma toward collapse.
      if (this.hunger >= STATS_REST_REGEN_HUNGER_MIN && this.thirst >= STATS_REST_REGEN_THIRST_MIN) {
        const rate = inShelter ? STATS_REST_RATE_SAFE : inShade ? STATS_REST_RATE_SHADE : STATS_REST_RATE_OPEN;
        this.energy = Math.min(100, this.energy + rate * deltaSec);
      }
    } else if (isRunning && this.canRun) {
      this.energy = Math.max(0, this.energy - STATS_DECAY.energyRunning * heatMod * deltaSec);
    } else if (isMoving) {
      this.energy = Math.max(0, this.energy - STATS_DECAY.energyMoving * heatMod * deltaSec);
    } else {
      this.energy = Math.max(0, this.energy - STATS_DECAY.energyRest * heatMod * deltaSec);

      // Passive shade/shelter regen (stationary but not deliberately resting)
      if (inShelter) {
        this.energy = Math.min(100, this.energy + STATS_SHELTER_ENERGY_REGEN * deltaSec);
      } else if (inShade) {
        this.energy = Math.min(100, this.energy + STATS_SHADE_ENERGY_REGEN * deltaSec);
      }
    }

    // Collapse check — applies whether or not Mamma is resting. Pre-v0.3.8
    // resting cats were exempt from collapse, which combined with the old
    // 0.1× rest decay meant the player could "rest forever" with zero
    // gameplay consequence. Now a long sleep on an empty stomach trips
    // collapse just like exhaustion in the open; the CollapseSystem handles
    // the wake-up + recovery flow uniformly for both cases.
    if (this.hunger <= 0 || this.thirst <= 0 || this.energy <= 0) {
      this.collapseTimer += deltaSec * 1000;
      if (this.collapseTimer >= COLLAPSE_THRESHOLD_MS) {
        this._collapsed = true;
      }
    } else {
      this.collapseTimer = 0;
    }
  }

  /** Apply a stat change (food, water, rest). Clamps 0-100 and returns actual delta applied. */
  restore(stat: keyof CatStats, amount: number): number {
    const before = this[stat];
    const after = Math.min(100, Math.max(0, before + amount));
    this[stat] = after;
    return after - before;
  }

  /** Reset collapse state after teleporting to safe spot. */
  resetCollapse(): void {
    this._collapsed = false;
    this.collapseTimer = 0;
    this.energy = Math.max(STATS_RESET_MIN_ENERGY, this.energy);
    this.hunger = Math.max(STATS_RESET_MIN_HUNGER, this.hunger);
    this.thirst = Math.max(STATS_RESET_MIN_THIRST, this.thirst);
  }

  /** Serialise for save. */
  toJSON(): CatStats {
    return { hunger: this.hunger, thirst: this.thirst, energy: this.energy };
  }

  /** Restore from save. Clamps to valid range to guard against corrupt data. */
  fromJSON(data: CatStats): void {
    const clamp = (v: number, fallback = 100) => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fallback);
    this.hunger = clamp(data.hunger);
    this.thirst = clamp(data.thirst);
    this.energy = clamp(data.energy);
    this._collapsed = false;
    this.collapseTimer = 0;
  }
}
