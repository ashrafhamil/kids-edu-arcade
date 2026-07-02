// Pure, framework-free round logic for Big Number.
// Kept out of the React component so the compare/difficulty/scoring rules stay
// readable. Every random call here runs only from event handlers / effects
// (startGame, loadNext), never at render or module scope — keeps it SSR-safe.

/** Which card the kid must tap this round. */
export type Target = "bigger" | "smaller";

export type Round = {
  id: number;
  /** Value shown on the left card. */
  left: number;
  /** Value shown on the right card. */
  right: number;
  /** Whether to tap the bigger or the smaller number. */
  target: Target;
  /** The correct value (matches `left` or `right`). */
  answer: number;
  /** How long this round's timer bar lasts, in ms. */
  durationMs: number;
};

type Band = {
  /** Largest number that can appear this band. */
  max: number;
  /** Minimum distance between the two numbers, so they read as clearly unequal. */
  minGap: number;
  /** Chance the prompt asks for the SMALLER number instead of the bigger. */
  smallerProb: number;
};

/** Difficulty band, ramps every 4 correct answers (capped at 4). */
export function levelFor(correctCount: number): number {
  return Math.min(Math.floor(correctCount / 4), 4);
}

/** Numbers grow and the gap tightens as the level climbs; SMALLER creeps in. */
function bandFor(level: number): Band {
  switch (level) {
    case 0:
      return { max: 9, minGap: 3, smallerProb: 0 };
    case 1:
      return { max: 20, minGap: 3, smallerProb: 0 };
    case 2:
      return { max: 40, minGap: 2, smallerProb: 0.3 };
    case 3:
      return { max: 70, minGap: 2, smallerProb: 0.4 };
    default:
      return { max: 99, minGap: 1, smallerProb: 0.5 };
  }
}

/** Timer tightens each band: ~6.5s at the start, never below 4s (two-digit reads take time). */
export function durationFor(level: number): number {
  return Math.max(4000, 6500 - level * 600);
}

/** Stars from final score, matching the on-screen thresholds. */
export function starsFor(score: number): number {
  if (score >= 400) return 3;
  if (score >= 200) return 2;
  if (score >= 80) return 1;
  return 0;
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Build the next round for the given difficulty band. */
export function genRound(level: number, id: number): Round {
  const { max, minGap, smallerProb } = bandFor(level);
  // Pick the high value first, then a low value at least `minGap` below it, so
  // the pair is always distinct and the winner is unambiguous.
  const hi = rand(minGap + 1, max);
  const lo = rand(1, hi - minGap);

  const target: Target = Math.random() < smallerProb ? "smaller" : "bigger";
  const answer = target === "bigger" ? hi : lo;

  const hiOnLeft = Math.random() < 0.5;
  return {
    id,
    left: hiOnLeft ? hi : lo,
    right: hiOnLeft ? lo : hi,
    target,
    answer,
    durationMs: durationFor(level),
  };
}
