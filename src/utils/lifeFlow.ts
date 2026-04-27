export const MAX_LIVES = 3;
export const DEFAULT_LIVES = MAX_LIVES;

export interface LifeLossResult {
  lives: number;
  gameOver: boolean;
}

export function normaliseLives(value: unknown, fallback = DEFAULT_LIVES): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_LIVES, Math.max(0, Math.floor(value)));
}

export function applyLifeLoss(currentLives: number): LifeLossResult {
  const lives = Math.max(0, normaliseLives(currentLives, 0) - 1);
  return {
    lives,
    gameOver: lives <= 0,
  };
}
