/**
 * Pure helpers for the dynamic colony-count model.
 *
 * `COLONY_COUNT` in the Phaser registry represents the *total* cat
 * population of the colony (named cats + Mamma Cat + unseen background),
 * not just the visible background roster. Visible "Colony Cat N" entities
 * are a bounded sample of the total. Keeping these helpers Phaser-free so
 * they can be exercised with plain unit tests.
 */

/**
 * Compute how many background "Colony Cat N" entities `GameScene.spawnColonyCats`
 * should instantiate given the current narrative total and the cap.
 *
 *   visible = clamp(total - namedAndMamma, 0, cap)
 *
 * - `total - namedAndMamma` is the count of "available" background cats
 *   (unseen + visible combined).
 * - The floor of 0 guards against weird saves / over-decrements.
 * - The cap is a perf/readability ceiling — on a healthy colony the
 *   visible count is just the cap, regardless of how many unseen cats
 *   exist. Once snatching thins the total enough that the cap no longer
 *   binds (total < namedAndMamma + cap), the visible roster shrinks.
 */
export function computeBackgroundSpawnCount(
  total: number,
  namedAndMamma: number,
  cap: number,
): number {
  if (!Number.isFinite(total) || !Number.isFinite(namedAndMamma) || !Number.isFinite(cap)) {
    return 0;
  }
  if (cap <= 0) return 0;
  const available = Math.floor(total) - Math.floor(namedAndMamma);
  if (available <= 0) return 0;
  return Math.min(available, Math.floor(cap));
}

/**
 * Apply a snatcher-driven decrement to the colony total, clamped so the
 * counter never falls below the named+Mamma floor. Returns the new total.
 * Pure — caller is responsible for writing the result back to the registry.
 */
export function decrementColonyTotal(current: number, floor: number): number {
  const safeCurrent = Number.isFinite(current) ? Math.floor(current) : floor;
  const safeFloor = Number.isFinite(floor) ? Math.floor(floor) : 0;
  return Math.max(safeFloor, safeCurrent - 1);
}
