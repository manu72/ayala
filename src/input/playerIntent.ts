import { TOUCH_STICK_DEAD_ZONE_PX } from "../config/gameplayConstants";

export interface MovementIntent {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
}

export const EMPTY_MOVEMENT_INTENT: MovementIntent = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
  run: false,
});

export function mergeMovementIntents(...intents: readonly MovementIntent[]): MovementIntent {
  return intents.reduce<MovementIntent>(
    (merged, intent) => ({
      up: merged.up || intent.up,
      down: merged.down || intent.down,
      left: merged.left || intent.left,
      right: merged.right || intent.right,
      run: merged.run || intent.run,
    }),
    { ...EMPTY_MOVEMENT_INTENT },
  );
}

export function vectorToMovementIntent(
  dx: number,
  dy: number,
  deadZonePx = TOUCH_STICK_DEAD_ZONE_PX,
): MovementIntent {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { ...EMPTY_MOVEMENT_INTENT };
  if (Math.hypot(dx, dy) < deadZonePx) return { ...EMPTY_MOVEMENT_INTENT };

  return {
    up: dy < 0,
    down: dy > 0,
    left: dx < 0,
    right: dx > 0,
    run: false,
  };
}
