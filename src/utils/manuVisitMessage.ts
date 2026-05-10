/**
 * Format Fluffy's "Manu was here…" awareness line for the AI prompt's
 * `recentEvents` slot. Pure, no Phaser dependencies, so the surface
 * text is unit-testable without spinning up a scene.
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
 * @returns A human-readable surface line for the AI prompt, or `null`
 *          when there is no recorded visit (or the value is invalid).
 *          A `null` result must result in the line being omitted from
 *          `recentEvents` — never replaced with a fabricated default.
 */
export function buildManuVisitedFluffyMessage(raw: unknown, currentDay: number): string | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  if (typeof currentDay !== "number" || !Number.isFinite(currentDay)) return null;
  const lastDay = Math.floor(raw);
  const today = Math.floor(currentDay);
  const daysSince = Math.max(0, today - lastDay);
  if (daysSince === 0) {
    return "Manu (Fluffy's favourite human) visited Fluffy today.";
  }
  if (daysSince === 1) {
    return "Manu (Fluffy's favourite human) last visited Fluffy yesterday.";
  }
  return `Manu (Fluffy's favourite human) last visited Fluffy ${daysSince} game days ago.`;
}
