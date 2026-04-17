/**
 * Defensive reader for lifetime-counter registry values (collapse count,
 * player snatches, colony cats lost, …).
 *
 * The journal UI and any other life-stat surface needs a safe non-negative
 * integer. Non-finite values, negative values, and non-numeric registry
 * entries all collapse to 0 so callers can use `> 0` as a "show this row"
 * gate. Values are floored rather than rounded because these counters are
 * always whole-number increments.
 *
 * Kept in utils (no Phaser import) so it can be unit-tested directly and
 * reused by other surfaces (HUD, epilogue, etc.) without pulling in scene
 * types.
 */

/** Minimal registry surface — matches the relevant bit of `Phaser.Data.DataManager`. */
export interface CountRegistry {
  get(key: string): unknown;
}

export function readLifetimeCount(
  source: { registry: CountRegistry } | undefined,
  key: string,
): number {
  const raw = source?.registry.get(key);
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return 0;
  return Math.floor(raw);
}
