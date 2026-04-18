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

/** Hunger/thirst decay multiplier while deliberately resting (lower metabolic rate). */
export const STATS_REST_DECAY_MULTIPLIER = 0.1;

/** Stat thresholds and multipliers for `speedMultiplier`. Exported for tests. */
export const STATS_SPEED_PENALTY = {
  hunger30: 0.8,
  hunger10: 0.5,
  thirst20: 0.8,
  energy20: 0.7,
  minMultiplier: 0.25,
} as const;

/** Grace period before collapse triggers.
 * Duration (ms) a stat must be at 0 before collapse triggers. Exported so
 * tests and tooling stay in lockstep with the runtime value; previously hard-
 * coded "15s" / "16s" expectations in tests drifted silently when this value
 * was bumped to 30s. */
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

  /** Stat-based speed multiplier (cumulative, minimum 0.25). */
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
      const rate = inShelter
        ? STATS_REST_RATE_SAFE
        : inShade
          ? STATS_REST_RATE_SHADE
          : STATS_REST_RATE_OPEN;
      this.energy = Math.min(100, this.energy + rate * deltaSec);
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

    // Collapse check — resting cats don't collapse (they chose to stop and recover)
    if (!isResting && (this.hunger <= 0 || this.thirst <= 0 || this.energy <= 0)) {
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
