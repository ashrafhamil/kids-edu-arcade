// Pure, framework-free scoring rules for Times Tiles.
// No React, no localStorage, no Math.random / Date.now — just deterministic math
// so the points/stars logic is easy to reason about and unit-friendly.

/** Score needed for 1 / 2 / 3 stars, per the game spec. */
export const STAR_THRESHOLDS = [80, 200, 400] as const;

/** Points awarded for a correct answer at combo x1, before bonuses. */
export const BASE_POINTS = 10;

/** Combo multiplier is capped here so late streaks stay fair. */
export const MAX_MULTIPLIER = 5;

/** Most a fast answer can add on top of the base × multiplier. */
export const SPEED_BONUS_MAX = 10;

/** Stars (0–3) from the final score. */
export function starsFor(score: number): number {
  if (score >= STAR_THRESHOLDS[2]) return 3;
  if (score >= STAR_THRESHOLDS[1]) return 2;
  if (score >= STAR_THRESHOLDS[0]) return 1;
  return 0;
}

/** Combo multiplier for a given streak length (1-based), capped. */
export function comboMultiplier(streak: number): number {
  return Math.max(1, Math.min(streak, MAX_MULTIPLIER));
}

/**
 * Speed bonus from the fraction of the timer still remaining (0..1).
 * Answer instantly -> full bonus; answer as the bar empties -> none.
 */
export function speedBonus(remainingFraction: number): number {
  const clamped = Math.max(0, Math.min(1, remainingFraction));
  return Math.round(clamped * SPEED_BONUS_MAX);
}

/** Total points for one correct answer: base × combo + speed bonus. */
export function pointsFor(streak: number, remainingFraction: number): number {
  return BASE_POINTS * comboMultiplier(streak) + speedBonus(remainingFraction);
}
