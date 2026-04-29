import type { HumanType } from "../sprites/SpriteProfiles";
import type { TimeOfDay } from "../systems/DayNightCycle";

export const FEEDERS_UNLOCK_DAY = 3; // defines the day when feeder humans become active
const FEEDER_LOCKED_PHASE: TimeOfDay = "day"; // defines the phase when feeder humans are hidden

export function isFeederHumanType(type: HumanType): boolean {
  return type === "feeder" || type === "ben";
}

export function getEffectiveHumanPhase(type: HumanType, calendarPhase: TimeOfDay, dayCount: number): TimeOfDay {
  if (isFeederHumanType(type) && dayCount < FEEDERS_UNLOCK_DAY) {
    // Feeders are dawn/evening-only, so the daytime phase keeps them hidden
    // without affecting the schedules of joggers, dog walkers, or named humans.
    return FEEDER_LOCKED_PHASE;
  }
  return calendarPhase;
}
