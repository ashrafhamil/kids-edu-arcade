// Spell It dataset + pure difficulty/scoring helpers.
//
// No React and nothing random or time-based at module scope. Every Math.random
// call sits inside a generator function that the component only invokes from
// handlers and effects, which keeps this module SSR-safe.

export type WordEntry = {
  /** The word to spell, always uppercase A–Z. */
  word: string;
  /** Picture cue that stays on screen after the word hides. */
  emoji: string;
};

/**
 * 47 concrete nouns, 4–7 letters, each with an unambiguous emoji. Homophones
 * (bear/bare, sun/son) and silent-letter traps (knife, lamb, ghost) are left
 * out so a wrong answer always means "misremembered", never "unfair spelling".
 */
const WORDS: WordEntry[] = [
  // 4 letters
  { word: "FROG", emoji: "🐸" },
  { word: "DUCK", emoji: "🦆" },
  { word: "BOOK", emoji: "📕" },
  { word: "MOON", emoji: "🌙" },
  { word: "STAR", emoji: "⭐" },
  { word: "CAKE", emoji: "🍰" },
  { word: "FISH", emoji: "🐟" },
  { word: "TREE", emoji: "🌳" },
  { word: "DRUM", emoji: "🥁" },
  { word: "CORN", emoji: "🌽" },
  { word: "LEAF", emoji: "🍃" },
  { word: "BELL", emoji: "🔔" },
  // 5 letters
  { word: "APPLE", emoji: "🍎" },
  { word: "TIGER", emoji: "🐯" },
  { word: "TRAIN", emoji: "🚂" },
  { word: "HOUSE", emoji: "🏠" },
  { word: "SNAKE", emoji: "🐍" },
  { word: "ROBOT", emoji: "🤖" },
  { word: "CLOUD", emoji: "☁️" },
  { word: "HORSE", emoji: "🐴" },
  { word: "MOUSE", emoji: "🐭" },
  { word: "PIZZA", emoji: "🍕" },
  { word: "SHEEP", emoji: "🐑" },
  { word: "ZEBRA", emoji: "🦓" },
  { word: "CROWN", emoji: "👑" },
  { word: "BREAD", emoji: "🍞" },
  { word: "CHAIR", emoji: "🪑" },
  { word: "LEMON", emoji: "🍋" },
  // 6 letters
  { word: "ROCKET", emoji: "🚀" },
  { word: "FLOWER", emoji: "🌸" },
  { word: "PENCIL", emoji: "✏️" },
  { word: "BANANA", emoji: "🍌" },
  { word: "CARROT", emoji: "🥕" },
  { word: "MONKEY", emoji: "🐒" },
  { word: "TURTLE", emoji: "🐢" },
  { word: "GUITAR", emoji: "🎸" },
  { word: "ORANGE", emoji: "🍊" },
  { word: "RABBIT", emoji: "🐰" },
  { word: "CAMERA", emoji: "📷" },
  // 7 letters
  { word: "PENGUIN", emoji: "🐧" },
  { word: "DOLPHIN", emoji: "🐬" },
  { word: "BALLOON", emoji: "🎈" },
  { word: "CHICKEN", emoji: "🐔" },
  { word: "GIRAFFE", emoji: "🦒" },
  { word: "RAINBOW", emoji: "🌈" },
  { word: "OCTOPUS", emoji: "🐙" },
  { word: "POPCORN", emoji: "🍿" },
];

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Correct spellings needed before the word length steps up. */
const CORRECT_PER_LEVEL = 4;
/** Level 1 spells 4-letter words, level 4 spells 7-letter words. */
const MAX_LEVEL = 4;
const SHORTEST_WORD = 4;

/** Wrong letters mixed into the keyboard, before the 12-key cap trims them. */
const DISTRACTOR_KEYS = 5;
/** Hard ceiling so three key rows always fit a 360px-wide phone. */
export const KEY_CAP = 12;

const STAR_THRESHOLDS = [80, 200, 400] as const;

/** Points scale with word length, so later levels are worth chasing. */
const POINTS_PER_LETTER = 3;
/** Streak multiplier ceiling, keeping the score curve readable. */
export const MAX_MULTIPLIER = 3;

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Level 1–4, stepping up every CORRECT_PER_LEVEL correct spellings. */
export function levelFor(correct: number): number {
  return Math.min(1 + Math.floor(correct / CORRECT_PER_LEVEL), MAX_LEVEL);
}

/** Word length for a level: 4 → 5 → 6 → 7. */
export function lengthFor(level: number): number {
  return SHORTEST_WORD + level - 1;
}

/** Keys on screen: every distinct letter needed, padded with distractors. */
export function keyCountFor(uniqueLetters: number): number {
  return Math.min(uniqueLetters + DISTRACTOR_KEYS, KEY_CAP);
}

/** 0–3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

/** Round value: longer words and longer streaks pay more. A peek pays nothing. */
export function pointsFor(word: string, streak: number, peeked: boolean): number {
  if (peeked) return 0;
  return word.length * POINTS_PER_LETTER * Math.min(streak, MAX_MULTIPLIER);
}

/** A word of the level's length, never the same one twice in a row. */
function pickWord(level: number, avoid: string): WordEntry {
  const length = lengthFor(level);
  const sized = WORDS.filter((entry) => entry.word.length === length);
  const fresh = sized.filter((entry) => entry.word !== avoid);
  return pick(fresh.length > 0 ? fresh : sized);
}

/** Shuffled keyboard: the word's distinct letters plus wrong-letter distractors. */
function makeKeys(word: string): string[] {
  const needed = [...new Set(word.split(""))];
  const padding = keyCountFor(needed.length) - needed.length;
  const distractors = shuffle(ALPHABET.filter((letter) => !needed.includes(letter)));
  return shuffle([...needed, ...distractors.slice(0, padding)]);
}

export type Round = {
  id: number;
  entry: WordEntry;
  /** Tap keys for this round, already shuffled. */
  keys: string[];
};

/** Build the next round for a level. Called from handlers/effects only. */
export function genRound(id: number, level: number, avoid: string): Round {
  const entry = pickWord(level, avoid);
  return { id, entry, keys: makeKeys(entry.word) };
}
