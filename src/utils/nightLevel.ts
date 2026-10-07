import type { TimeOfDay } from "../systems/DayNightCycle";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * How lit-up the night is, 0 (daylight) .. 1 (full night): street lamps and
 * headlights come on through the evening and go off after dawn.
 */
export function nightLevel(phase: TimeOfDay, progress: number): number {
  switch (phase) {
    case "night":
      return 1;
    case "evening":
      return smooth(0.35, 1, progress); // reaches 1 exactly where night begins
    case "dawn":
      return 1 - smooth(0, 0.45, progress);
    default:
      return 0;
  }
}
