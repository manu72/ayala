/**
 * Format Fluffy's "Manu was here…" awareness line for the AI prompt's
 * `recentEvents` slot. Pure, no Phaser dependencies, so the surface
 * text is unit-testable without spinning up a scene.
 *
 * Inputs are kept loose (`unknown` registry value, raw current day) on
 * purpose — the registry is read from a long-lived save store that may
 * round-trip through hand-edited LocalStorage or a future schema bump.
 * NaN, negative, fractional, and non-numeric reads collapse to "no
 * event" rather than asserting false history at the LLM. Mirrors the
 * `readCount` defensive pattern used in {@link CamilleEncounterSystem}.
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
