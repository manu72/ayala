/**
 * Touch paw swipe (ATG-008): a quick flick that starts on Mamma Cat. All
 * distances are canvas pixels (Mamma Cat is ~80 px tall at the default zoom),
 * so the gesture feels the same at any camera zoom.
 */
export const PAW_FLICK = {
  /** The touch must land this close to Mamma Cat's centre. */
  START_RADIUS: 70,
  /** ...then travel this far... */
  MIN_DISTANCE: 28,
  /** ...within this long of touching down, or it is just a slow drag. */
  MAX_MS: 350,
} as const;

type Point = { x: number; y: number };

export function flickStartsOnCat(cat: Point, start: Point): boolean {
  return Math.hypot(start.x - cat.x, start.y - cat.y) <= PAW_FLICK.START_RADIUS;
}

export function isPawFlick(start: Point, now: Point, elapsedMs: number): boolean {
  return elapsedMs <= PAW_FLICK.MAX_MS && Math.hypot(now.x - start.x, now.y - start.y) >= PAW_FLICK.MIN_DISTANCE;
}

/** Swat the way the flick went; a mostly vertical flick (she has no N/S swipe) keeps her facing. */
export function pawFlickFacing(start: Point, now: Point): "e" | "w" | null {
  const dx = now.x - start.x;
  if (Math.abs(dx) * 2 < Math.abs(now.y - start.y)) return null;
  return dx >= 0 ? "e" : "w";
}
