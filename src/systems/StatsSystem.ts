export interface CatStats {
  hunger: number;
  thirst: number;
  energy: number;
}

/** Per-second base decay rates (subtracted each real-time second). */
const DECAY = {
  hunger: 0.05,
  thirst: 0.1,
  energyRest: 0.05,
  energyMoving: 0.15,
  energyRunning: 0.3,
} as const;

const HEAT_MULTIPLIER = 1.5;
const SHADE_ENERGY_REGEN = 0.5;
const SHELTER_ENERGY_REGEN = 1.0;

/** Deliberate rest/sleep energy rates (per second). */
const REST_RATE_OPEN = 0.5;
const REST_RATE_SHADE = 1.0;
const REST_RATE_SAFE = 2.0;

/** Hunger/thirst decay while sleeping is reduced (lower metabolic rate). */
const REST_DECAY_MULTIPLIER = 0.1;

const SPEED_PENALTY_HUNGER_30 = 0.8;
const SPEED_PENALTY_HUNGER_10 = 0.5;
const SPEED_PENALTY_THIRST_20 = 0.8;
const SPEED_PENALTY_ENERGY_20 = 0.7;

/** Grace period before collapse triggers.
 * Duration (ms) a stat must be at 0 before collapse triggers. Exported so
 * tests and tooling stay in lockstep with the runtime value; previously hard-
 * coded "15s" / "16s" expectations in tests drifted silently when this value
 * was bumped to 30s. */
export const COLLAPSE_THRESHOLD_MS = 30_000;

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
    if (this.hunger < 10) m *= SPEED_PENALTY_HUNGER_10;
    else if (this.hunger < 30) m *= SPEED_PENALTY_HUNGER_30;
    if (this.thirst < 20) m *= SPEED_PENALTY_THIRST_20;
    if (this.energy < 20) m *= SPEED_PENALTY_ENERGY_20;
    return Math.max(0.25, m);
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

    const heatMod = isHeatActive && !inShade ? HEAT_MULTIPLIER : 1.0;

    // Hunger/thirst always decay, but at half rate while resting
    const decayMod = isResting ? REST_DECAY_MULTIPLIER : 1.0;
    this.hunger = Math.max(0, this.hunger - DECAY.hunger * heatMod * decayMod * deltaSec);
    this.thirst = Math.max(0, this.thirst - DECAY.thirst * heatMod * decayMod * deltaSec);

    if (isResting) {
      const rate = inShelter ? REST_RATE_SAFE : inShade ? REST_RATE_SHADE : REST_RATE_OPEN;
      this.energy = Math.min(100, this.energy + rate * deltaSec);
    } else if (isRunning && this.canRun) {
      this.energy = Math.max(0, this.energy - DECAY.energyRunning * heatMod * deltaSec);
    } else if (isMoving) {
      this.energy = Math.max(0, this.energy - DECAY.energyMoving * heatMod * deltaSec);
    } else {
      this.energy = Math.max(0, this.energy - DECAY.energyRest * heatMod * deltaSec);

      // Passive shade/shelter regen (stationary but not deliberately resting)
      if (inShelter) {
        this.energy = Math.min(100, this.energy + SHELTER_ENERGY_REGEN * deltaSec);
      } else if (inShade) {
        this.energy = Math.min(100, this.energy + SHADE_ENERGY_REGEN * deltaSec);
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
    this.energy = Math.max(30, this.energy);
    this.hunger = Math.max(15, this.hunger);
    this.thirst = Math.max(15, this.thirst);
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
