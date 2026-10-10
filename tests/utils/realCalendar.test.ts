import { describe, expect, it } from "vitest";
import { calendarOverrides, daysUntilSunday, isFestiveSeason, isRealSunday } from "../../src/utils/realCalendar";

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
