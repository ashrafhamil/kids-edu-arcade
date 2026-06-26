// Pure, framework-free rules for Coin Count.
// Kept out of the React component so the difficulty curve and scoring are easy
// to read and reason about. Nothing here touches the DOM, storage, or randomness
// at module scope — callers invoke these inside handlers/effects only.

/** The coins a child can tap, smallest to largest. */
export const COIN_VALUES = [1, 2, 5, 10] as const;
export type CoinValue = (typeof COIN_VALUES)[number];

// Scoring knobs. Tuned so 1 star comes in a few solves, but 3 stars (400) needs
// a long, unbroken streak — a single miss resets the multiplier to 1.
const BASE_POINTS = 10;
const MAX_SPEED_BONUS = 10;
const MAX_MULTIPLIER = 4;

// Price grows band by band. A 1¢ coin always exists, so every price is solvable.
const PRICE_BANDS: ReadonlyArray<readonly [number, number]> = [
  [3, 10],
  [6, 15],
  [10, 22],
  [14, 32],
  [20, 45],
  [30, 60],
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Difficulty band, steps up every 4 solved prices (capped at the last band). */
export function levelFor(solvedCount: number): number {
  return Math.min(Math.floor(solvedCount / 4), PRICE_BANDS.length - 1);
}

/** A random target price (in cents) for the given level's band. */
export function priceFor(level: number): number {
  const [min, max] = PRICE_BANDS[Math.min(level, PRICE_BANDS.length - 1)];
  return randInt(min, max);
}

/** Timer per price: generous 10s, shrinking slightly each level, floored at 6s. */
export function durationFor(level: number): number {
  return Math.max(6000, 10000 - level * 700);
}

/** Stars from the final score, per the game spec thresholds. */
export function starsFor(score: number): number {
  if (score >= 400) return 3;
  if (score >= 200) return 2;
  if (score >= 80) return 1;
  return 0;
}

/**
 * Points for an exact payment: a base reward plus a speed bonus (how much of the
 * timer was left), all multiplied by the consecutive-solve streak.
 */
export function pointsFor(remainingMs: number, durationMs: number, combo: number): number {
  const speedBonus = Math.round(clamp01(remainingMs / durationMs) * MAX_SPEED_BONUS);
  const multiplier = Math.min(Math.max(combo, 1), MAX_MULTIPLIER);
  return (BASE_POINTS + speedBonus) * multiplier;
}

/** Streak multiplier actually applied, for display ("x3"). */
export function multiplierFor(combo: number): number {
  return Math.min(Math.max(combo, 1), MAX_MULTIPLIER);
}
