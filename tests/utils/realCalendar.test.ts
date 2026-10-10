import { describe, expect, it } from "vitest";
import { calendarOverrides, daysUntilSunday, isFestiveSeason, isRealSunday, sundayProgramme } from "../../src/utils/realCalendar";

describe("realCalendar", () => {
  it("knows Sundays and counts down to the next one", () => {
    expect(isRealSunday(new Date(2026, 9, 11))).toBe(true); // Sun 11 Oct 2026
    expect(isRealSunday(new Date(2026, 9, 10))).toBe(false);
    expect(daysUntilSunday(new Date(2026, 9, 11))).toBe(0);
    expect(daysUntilSunday(new Date(2026, 9, 10))).toBe(1);
    expect(daysUntilSunday(new Date(2026, 9, 12))).toBe(6);
  });

  it("runs the festive season 10 Nov to 15 Jan", () => {
    expect(isFestiveSeason(new Date(2026, 10, 9))).toBe(false);
    expect(isFestiveSeason(new Date(2026, 10, 10))).toBe(true);
    expect(isFestiveSeason(new Date(2026, 11, 25))).toBe(true);
    expect(isFestiveSeason(new Date(2027, 0, 15))).toBe(true);
    expect(isFestiveSeason(new Date(2027, 0, 16))).toBe(false);
  });

  it("lets the URL force Sunday or the season", () => {
    expect(calendarOverrides("?sunday=1&season=xmas")).toEqual({ sunday: true, festive: true });
    expect(calendarOverrides("?sunday=0")).toEqual({ sunday: false, festive: undefined });
    expect(calendarOverrides("")).toEqual({ sunday: undefined, festive: undefined });
  });
});

describe("sundayProgramme", () => {
  it("is the same all week and rotates through all five, one a week", () => {
    const sun = new Date(2026, 9, 11);
    const sat = new Date(2026, 9, 17);
    expect(sundayProgramme(sat)).toBe(sundayProgramme(sun));
    const weeks = Array.from({ length: 5 }, (_, i) => sundayProgramme(new Date(2026, 9, 11 + 7 * i)));
    expect(new Set(weeks).size).toBe(5);
    expect(sundayProgramme(new Date(2026, 9, 11 + 35))).toBe(weeks[0]);
  });
});
