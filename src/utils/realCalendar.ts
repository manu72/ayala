/**
 * The real-world calendar (device local time). The only real-clock reads in the game: Sundays bring
 * the Paseo de Roxas street market and the Sunday Lights, and in the Christmas season the lights
 * become the Festival of Lights.
 */

export const isRealSunday = (now: Date): boolean => now.getDay() === 0;

/** 10 Nov – 15 Jan, the real Ayala Triangle Festival of Lights season. */
export function isFestiveSeason(now: Date): boolean {
  const m = now.getMonth(); // 0 = Jan
  const d = now.getDate();
  return (m === 10 && d >= 10) || m === 11 || (m === 0 && d <= 15);
}

/** 0 on a Sunday, else days until the next one. */
export const daysUntilSunday = (now: Date): number => (7 - now.getDay()) % 7;

/**
 * `?sunday=1` / `?sunday=0` forces (or suppresses) Sunday, `?season=xmas` the festive season and
 * `?programme=zumba` (yoga, zumba, adoption, chalk, visitor) the market's programme, so the weekly
 * events can be seen any day.
 */
export function calendarOverrides(search: string): { sunday?: boolean; festive?: boolean; programme?: SundayProgramme } {
  const q = new URLSearchParams(search);
  const sunday = q.get("sunday");
  const programme = SUNDAY_PROGRAMMES.find((p) => p === q.get("programme"));
  return {
    sunday: sunday === "1" ? true : sunday === "0" ? false : undefined,
    festive: q.get("season") === "xmas" ? true : undefined,
    ...(programme ? { programme } : {}),
  };
}

export const SUNDAY_PROGRAMMES = ["yoga", "zumba", "adoption", "chalk", "visitor"] as const;
export type SundayProgramme = (typeof SUNDAY_PROGRAMMES)[number];

/** This week's market programme: they take turns, one a week, so each comes back every five weeks. */
export function sundayProgramme(now: Date): SundayProgramme {
  const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000);
  const week = Math.floor((day + 4) / 7); // 1970-01-01 was a Thursday: weeks counted Sunday to Saturday
  return SUNDAY_PROGRAMMES[((week % 5) + 5) % 5]!;
}
