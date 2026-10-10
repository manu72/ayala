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
 * `?sunday=1` / `?sunday=0` forces (or suppresses) Sunday, `?season=xmas` the festive season, so the
 * weekly events can be seen any day.
 */
export function calendarOverrides(search: string): { sunday?: boolean; festive?: boolean } {
  const q = new URLSearchParams(search);
  const sunday = q.get("sunday");
  return {
    sunday: sunday === "1" ? true : sunday === "0" ? false : undefined,
    festive: q.get("season") === "xmas" ? true : undefined,
  };
}
