// First Sound dataset + pure round/scoring helpers.
//
// No React, and nothing random or time-based at module scope. The only
// Math.random lives inside genRound(), which the component calls strictly from
// handlers/effects, keeping this module SSR-safe.

export type SoundItem = {
  /** The letter the child taps. Unique across the dataset, so it doubles as an id. */
  letter: string;
  /** Picture shown as the prompt. Its name starts with `letter`. */
  emoji: string;
  /** What the picture is, used for the aria-label only — never rendered. */
  word: string;
};

// One picture per letter, each chosen so the starting sound is unambiguous when
// the word is said aloud. A pre-reader answers from the picture alone.
const ITEMS: SoundItem[] = [
  { letter: "A", emoji: "🍎", word: "Apple" },
  { letter: "B", emoji: "🍌", word: "Banana" },
  { letter: "C", emoji: "🐱", word: "Cat" },
  { letter: "D", emoji: "🐶", word: "Dog" },
  { letter: "E", emoji: "🥚", word: "Egg" },
  { letter: "F", emoji: "🐟", word: "Fish" },
  { letter: "G", emoji: "🍇", word: "Grapes" },
  { letter: "H", emoji: "🏠", word: "House" },
  { letter: "I", emoji: "🍦", word: "Ice cream" },
  { letter: "J", emoji: "🧃", word: "Juice" },
  { letter: "K", emoji: "🔑", word: "Key" },
  { letter: "L", emoji: "🦁", word: "Lion" },
  { letter: "M", emoji: "🌙", word: "Moon" },
  { letter: "N", emoji: "👃", word: "Nose" },
  { letter: "O", emoji: "🐙", word: "Octopus" },
  { letter: "P", emoji: "🍕", word: "Pizza" },
  { letter: "Q", emoji: "👑", word: "Queen" },
  { letter: "R", emoji: "🌈", word: "Rainbow" },
  { letter: "S", emoji: "☀️", word: "Sun" },
  { letter: "T", emoji: "🌳", word: "Tree" },
  { letter: "U", emoji: "☂️", word: "Umbrella" },
  { letter: "V", emoji: "🎻", word: "Violin" },
  { letter: "W", emoji: "🍉", word: "Watermelon" },
  { letter: "X", emoji: "🩻", word: "X-ray" },
  { letter: "Y", emoji: "🪀", word: "Yo-yo" },
  { letter: "Z", emoji: "🦓", word: "Zebra" },
];

// Letters a young ear genuinely confuses, either because they share a place of
// articulation (b/p, d/t, m/n, f/v) or because they can spell the same sound
// (c/k, g/j, s/z). These are blocked as distractors outright — the game teaches
// the starting sound, so a round with two defensible answers is just unfair.
const CONFUSABLE: Record<string, readonly string[]> = {
  B: ["P", "D"],
  P: ["B"],
  D: ["T", "B"],
  T: ["D"],
  M: ["N"],
  N: ["M"],
  F: ["V"],
  V: ["F"],
  C: ["K", "S"],
  K: ["C", "Q"],
  Q: ["K"],
  G: ["J"],
  J: ["G"],
  S: ["Z", "C"],
  Z: ["S"],
};

export type Round = {
  id: number;
  /** The picture shown big as the prompt. */
  emoji: string;
  /** Read out by screen readers so the round is answerable non-visually. */
  word: string;
  /** The correct letter. */
  answer: string;
  /** Shuffled tap options; always contains the answer plus distinct distractors. */
  choices: string[];
  /** How long this round's timer bar lasts, in ms. */
  durationMs: number;
};

const STAR_THRESHOLDS = [80, 200, 400] as const;

/** 0–3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

/** Three letters to start, four once the player is warmed up. */
export function choiceCountFor(score: number): number {
  return score >= 150 ? 4 : 3;
}

/** Timer bar length, tightening as the run goes on and never below 4s. */
export function durationFor(step: number): number {
  return Math.max(4000, 7000 - step * 300);
}

function pick<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build one round. `avoidLetter` keeps the same answer from repeating twice in a
 * row; `step` is how many rounds have been played, which drives the timer.
 */
export function genRound(id: number, score: number, step: number, avoidLetter?: string): Round {
  const pool = avoidLetter ? ITEMS.filter((i) => i.letter !== avoidLetter) : ITEMS;
  const target = pick(pool);

  const blocked = new Set([target.letter, ...(CONFUSABLE[target.letter] ?? [])]);
  const distractorPool = ITEMS.filter((i) => !blocked.has(i.letter)).map((i) => i.letter);

  const wanted = choiceCountFor(score) - 1;
  const distractors = shuffle(distractorPool).slice(0, wanted);

  return {
    id,
    emoji: target.emoji,
    word: target.word,
    answer: target.letter,
    choices: shuffle([target.letter, ...distractors]),
    durationMs: durationFor(step),
  };
}
