// Rhyme Time dataset + pure round/scoring helpers.
//
// No React, and nothing random or time-based at module scope. The only Math.random
// lives inside genRound(), which the component calls strictly from handlers/effects,
// keeping this module SSR-safe.

export type RhymeWord = {
  /** Uppercase display word. Unique across the whole dataset, so it doubles as an id. */
  word: string;
  emoji: string;
  /** Rhyme-family key. Words sharing a key rhyme; words across keys never do. */
  family: string;
};

export type RhymeFamily = {
  key: string;
  words: RhymeWord[];
};

// Each family has a phonetically distinct rhyme (vowel + ending) and NO two families
// rhyme with one another. That single invariant is what makes the puzzle airtight: any
// word from a different family is a guaranteed non-rhyming distractor. KEY/TEA (-ee) and
// WHALE (-ail) rhyme by sound rather than spelling, which is the point of a phonics game.
type RawFamily = { key: string; words: [word: string, emoji: string][] };

const RAW_FAMILIES: RawFamily[] = [
  { key: "at", words: [["CAT", "🐱"], ["HAT", "🎩"], ["BAT", "🦇"], ["RAT", "🐀"]] },
  { key: "an", words: [["MAN", "👨"], ["FAN", "🪭"], ["PAN", "🍳"], ["VAN", "🚐"], ["CAN", "🥫"]] },
  { key: "og", words: [["DOG", "🐶"], ["FROG", "🐸"], ["LOG", "🪵"], ["HOG", "🐗"]] },
  { key: "ee", words: [["BEE", "🐝"], ["TREE", "🌳"], ["KEY", "🔑"], ["TEA", "🍵"]] },
  { key: "un", words: [["SUN", "☀️"], ["BUN", "🍞"], ["RUN", "🏃"]] },
  { key: "ug", words: [["BUG", "🐛"], ["MUG", "☕"], ["HUG", "🤗"]] },
  { key: "ar", words: [["CAR", "🚗"], ["STAR", "⭐"], ["JAR", "🫙"]] },
  { key: "ock", words: [["SOCK", "🧦"], ["CLOCK", "🕐"], ["ROCK", "🪨"], ["LOCK", "🔒"]] },
  { key: "ox", words: [["FOX", "🦊"], ["BOX", "📦"], ["OX", "🐂"]] },
  { key: "ing", words: [["RING", "💍"], ["KING", "🤴"], ["STRING", "🧵"], ["WING", "🪽"]] },
  { key: "ed", words: [["BED", "🛏️"], ["RED", "🟥"], ["SLED", "🛷"]] },
  { key: "all", words: [["BALL", "⚽"], ["WALL", "🧱"], ["FALL", "🍁"]] },
  { key: "own", words: [["CROWN", "👑"], ["CLOWN", "🤡"], ["TOWN", "🏘️"], ["BROWN", "🟤"]] },
  { key: "ouse", words: [["HOUSE", "🏠"], ["MOUSE", "🐭"]] },
  { key: "ail", words: [["SNAIL", "🐌"], ["WHALE", "🐋"], ["SAIL", "⛵"], ["MAIL", "✉️"]] },
  { key: "oon", words: [["MOON", "🌙"], ["SPOON", "🥄"], ["BALLOON", "🎈"]] },
];

export const FAMILIES: RhymeFamily[] = RAW_FAMILIES.map((f) => ({
  key: f.key,
  words: f.words.map(([word, emoji]) => ({ word, emoji, family: f.key })),
}));

const FAMILY_BY_KEY: Record<string, RhymeFamily> = Object.fromEntries(
  FAMILIES.map((f) => [f.key, f]),
);

export const ALL_WORDS: RhymeWord[] = FAMILIES.flatMap((f) => f.words);

export type Round = {
  id: number;
  /** The word shown big at the top. */
  target: RhymeWord;
  /** A DIFFERENT word from the same family as the target — the one true rhyme. */
  correct: RhymeWord;
  /** The correct word plus distractors from other families, shuffled. */
  choices: RhymeWord[];
  /** Per-round countdown, eases down gently as the streak of correct grows. */
  durationMs: number;
};

// --- Difficulty + scoring --------------------------------------------------

// Gentle timer: reading takes time, so it starts generous and only tightens a little.
const START_MS = 7000;
const MIN_MS = 4000;
const STEP_MS = 300;
const ANSWERS_PER_STEP = 3;

const STAR_THRESHOLDS = [60, 150, 300] as const;

/** Countdown length for the next round, based on how many are already correct. */
export function durationFor(correctCount: number): number {
  const step = Math.floor(correctCount / ANSWERS_PER_STEP);
  return Math.max(MIN_MS, START_MS - step * STEP_MS);
}

/** Three choices to start, four once the player is warmed up. */
export function choiceCountFor(correctCount: number): number {
  return correctCount >= 4 ? 4 : 3;
}

/** 0–3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Build a round: a target word, one DIFFERENT same-family word as the correct rhyme,
 * and distractors each drawn from a DISTINCT other family. Because no two families
 * rhyme, no distractor can ever rhyme with the target.
 *
 * `usedTargets` keeps a target from repeating until the pool cycles; `avoidWord` blocks
 * an immediate repeat across a cycle reset. Random calls live only here, so callers must
 * invoke this from handlers/effects (never during render) to stay SSR-safe.
 */
export function genRound(
  correctCount: number,
  id: number,
  usedTargets: readonly string[] = [],
  avoidWord?: string,
): Round {
  const used = new Set(usedTargets);
  let eligible = ALL_WORDS.filter((w) => !used.has(w.word) && w.word !== avoidWord);
  // Fallbacks keep the game playable if the caller hasn't reset the cycle yet.
  if (eligible.length === 0) eligible = ALL_WORDS.filter((w) => w.word !== avoidWord);
  if (eligible.length === 0) eligible = [...ALL_WORDS];

  const target = pick(eligible);
  const sameFamily = FAMILY_BY_KEY[target.family].words.filter((w) => w.word !== target.word);
  const correct = pick(sameFamily);

  const distractorsNeeded = choiceCountFor(correctCount) - 1;
  const otherFamilies = shuffle(FAMILIES.filter((f) => f.key !== target.family));
  const distractors = otherFamilies.slice(0, distractorsNeeded).map((f) => pick(f.words));

  return {
    id,
    target,
    correct,
    choices: shuffle([correct, ...distractors]),
    durationMs: durationFor(correctCount),
  };
}
