/**
 * Days since Manu last visited Fluffy, from the raw `MANU_VISITED_FLUFFY_DAY`
 * registry value. Pure, no Phaser dependencies, so the story facts built from
 * it are unit-testable without spinning up a scene.
 *
 * Inputs are kept loose (`unknown` registry value, raw current day) on
 * purpose — the registry is read from a long-lived save store that may
 * round-trip through hand-edited LocalStorage or a future schema bump.
 * Defensive handling, mirroring the `readCount` pattern in
 * {@link CamilleEncounterSystem}:
 *
 *   - Non-numeric, NaN, ±Infinity, and zero/negative reads → return
 *     `null` so the prompt stays silent rather than asserting a visit
 *     that never happened. (Fresh saves and pre-Chapter-5 runs leave
 *     the key unset; the controller maps that to 0, which lands here.)
 *   - Finite-positive fractional reads are NOT collapsed to "no event"
 *     — they are floored via {@link Math.floor} and treated as the
 *     floored integer day, consistent with `readCount`. So `raw=6.9`
 *     on `currentDay=7` reads as "yesterday", and `raw=7.4` on
 *     `currentDay=7` reads as "today".
 *   - `currentDay` is also floored before the diff so a fractional
 *     `dayCount` (impossible today, but defensive) cannot produce a
 *     negative-days-ago string. The diff is additionally clamped at 0
 *     to defend against a hand-edited save where the recorded day
 *     sits in the future relative to `currentDay`.
 *
 * @param raw The raw registry value for `MANU_VISITED_FLUFFY_DAY`.
 *            Treated as the in-game day on which Manu last came within
 *            `CAT_PERSON_GREET_DIST` of Fluffy.
 * @param currentDay The current in-game day (`DayNightCycle.dayCount`).
 * @returns Whole days since the visit, or `null` when there is no
 *          recorded visit (or the value is invalid). `null` must never be
 *          replaced with a fabricated default.
 */
export function manuVisitDaysAgo(raw: unknown, currentDay: number): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  if (typeof currentDay !== "number" || !Number.isFinite(currentDay)) return null;
  return Math.max(0, Math.floor(currentDay) - Math.floor(raw));
}

/** Fluffy's story fact, in the second person because Fluffy reads it; `null` = omit. */
export function buildManuVisitedFluffyMessage(raw: unknown, currentDay: number): string | null {
  const daysSince = manuVisitDaysAgo(raw, currentDay);
  if (daysSince === null) return null;
  if (daysSince === 0) return "Manu came by to see you today.";
  if (daysSince === 1) return "Manu came by to see you yesterday.";
  return `Manu came by to see you ${daysSince} days ago.`;
}
