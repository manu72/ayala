/**
 * Tracks global colony trust and per-cat relationship scores.
 * Trust determines dialogue changes, disposition shifts, and chapter triggers.
 */

export interface TrustData {
  global: number;
  cats: Record<string, number>;
}

const MAX_TRUST = 100;

/** Proximity-based trust cooldown: award at most once per this interval (ms). */
const PROXIMITY_INTERVAL_MS = 30_000;

export class TrustSystem {
  private _global = 0;
  private _cats: Record<string, number> = {};

  /** Per-cat cooldown timestamps for proximity trust. */
  private proximityCooldowns: Record<string, number> = {};

  get global(): number {
    return this._global;
  }

  getCatTrust(name: string): number {
    return this._cats[name] ?? 0;
  }

  /** Award trust for first conversation with a named cat. */
  firstConversation(catName: string): void {
    this.addGlobal(5);
    this.addCat(catName, 10);
  }

  /** Award trust for a return conversation. */
  returnConversation(catName: string): void {
    this.addGlobal(2);
    this.addCat(catName, 5);
  }

  /** Award proximity trust (30s near a cat). Throttled by cooldown. */
  proximityTick(catName: string, now: number): void {
    const last = this.proximityCooldowns[catName] ?? 0;
    if (now - last < PROXIMITY_INTERVAL_MS) return;
    this.proximityCooldowns[catName] = now;
    this.addGlobal(1);
    this.addCat(catName, 2);
  }

  /** Award trust for being seen eating. */
  seenEating(): void {
    this.addGlobal(1);
  }

  /** Award trust for surviving a full day cycle. */
  survivedDay(): void {
    this.addGlobal(3);
  }

  private addGlobal(amount: number): void {
    this._global = Math.min(MAX_TRUST, this._global + amount);
  }

  private addCat(name: string, amount: number): void {
    const current = this._cats[name] ?? 0;
    this._cats[name] = Math.min(MAX_TRUST, current + amount);
  }

  toJSON(): TrustData {
    return { global: this._global, cats: { ...this._cats } };
  }

  fromJSON(data: TrustData): void {
    this._global = clamp(data.global ?? 0);
    this._cats = {};
    if (data.cats && typeof data.cats === "object") {
      for (const [name, val] of Object.entries(data.cats)) {
        this._cats[name] = clamp(typeof val === "number" ? val : 0);
      }
    }
  }
}

function clamp(v: number): number {
  return Number.isFinite(v) ? Math.min(MAX_TRUST, Math.max(0, v)) : 0;
}
