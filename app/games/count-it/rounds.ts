// Pure, framework-free round logic for Count It.
// Kept out of the React component so the counting/difficulty/scoring rules stay
// readable. Every random call here runs only from event handlers / effects
// (startGame, loadNext), never at render or module scope — keeps it SSR-safe.

/** Per-emoji visual offset used to "scatter" the cluster at higher levels. */
export type Jitter = { rot: number; dx: number; dy: number };

export type Round = {
  id: number;
  /** The emoji repeated `count` times in the cluster. */
  emoji: string;
  /** The correct number of objects shown. */
  count: number;
  /** Four options, shuffled, exactly one equals `count`. */
  choices: number[];
  /** How long this round's timer bar lasts, in ms. */
  durationMs: number;
  /** Small visual offsets per item; non-zero only when the cluster is scattered. */
  jitter: Jitter[];
};

/** Countable emoji objects. Identical within a round, random across rounds. */
export const OBJECTS = [
  "🍎",
  "⭐",
  "🐟",
  "🍌",
  "🐤",
  "🎈",
  "🌸",
  "🚗",
  "🐞",
  "🍓",
] as const;

/** Difficulty band, ramps every 5 correct answers (capped at 4). */
export function levelFor(correctCount: number): number {
  return Math.min(Math.floor(correctCount / 5), 4);
}

/** How big the cluster gets, per band. Level 3+ scatters the objects. */
function rangeFor(level: number): { min: number; max: number; scattered: boolean } {
  switch (level) {
    case 0:
      return { min: 1, max: 5, scattered: false };
    case 1:
      return { min: 2, max: 10, scattered: false };
    case 2:
      return { min: 4, max: 12, scattered: false };
    case 3:
      return { min: 6, max: 16, scattered: true };
    default:
      return { min: 8, max: 20, scattered: true };
  }
}

/** Timer shrinks each band, never below 4s. */
export function durationFor(level: number): number {
  return Math.max(4000, 8000 - level * 800);
}

/** Emoji size class for the cluster — smaller as the count grows, so it fits 360px. */
export function emojiSizeFor(count: number): string {
  if (count <= 5) return "text-5xl";
  if (count <= 10) return "text-4xl";
  if (count <= 15) return "text-3xl";
  return "text-2xl";
}

/** Stars from final score, matching the on-screen thresholds. */
export function starsFor(score: number): number {
  if (score >= 500) return 3;
  if (score >= 250) return 2;
  if (score >= 100) return 1;
  return 0;
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Three plausible, distinct, near distractors. Counts are always >= 1, so options
// stay >= 1. Bounded loop + deterministic padding so it can never spin forever.
function makeChoices(count: number): number[] {
  const options = new Set<number>([count]);

  let guard = 0;
  while (options.size < 4 && guard < 60) {
    guard++;
    const sign = Math.random() < 0.5 ? -1 : 1;
    const candidate = count + rand(1, 3) * sign;
    if (candidate >= 1) options.add(candidate);
  }

  // Padding fallback (e.g. count of 1, where only larger neighbours exist).
  let step = 1;
  while (options.size < 4) {
    if (count + step >= 1) options.add(count + step);
    if (options.size < 4 && count - step >= 1) options.add(count - step);
    step++;
  }

  return shuffle([...options]);
}

// Scatter offsets are kept well under the cluster's flex gap so two objects can
// never visually merge (counting must stay possible). Zeroed when not scattered.
function makeJitter(count: number, scattered: boolean): Jitter[] {
  return Array.from({ length: count }, () =>
    scattered
      ? { rot: rand(-18, 18), dx: rand(-3, 3), dy: rand(-3, 3) }
      : { rot: 0, dx: 0, dy: 0 }
  );
}

/** Build the next round for the given difficulty band. */
export function genRound(level: number, id: number): Round {
  const { min, max, scattered } = rangeFor(level);
  const count = rand(min, max);
  const emoji = OBJECTS[Math.floor(Math.random() * OBJECTS.length)];
  return {
    id,
    emoji,
    count,
    choices: makeChoices(count),
    durationMs: durationFor(level),
    jitter: makeJitter(count, scattered),
  };
}
