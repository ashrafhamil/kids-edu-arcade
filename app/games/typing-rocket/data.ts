// Pure, framework-free target & difficulty logic for Typing Rocket.
// Kept out of the React component so the game loop stays readable and the
// difficulty/scoring rules are easy to reason about.

export type Target = { text: string; emoji: string };

// 18 highly readable 3–4 letter words, each with an emoji hint.
export const WORDS: Target[] = [
  { text: "CAT", emoji: "🐱" },
  { text: "DOG", emoji: "🐶" },
  { text: "SUN", emoji: "☀️" },
  { text: "BUS", emoji: "🚌" },
  { text: "PIG", emoji: "🐷" },
  { text: "BEE", emoji: "🐝" },
  { text: "OWL", emoji: "🦉" },
  { text: "COW", emoji: "🐮" },
  { text: "BAT", emoji: "🦇" },
  { text: "FOX", emoji: "🦊" },
  { text: "STAR", emoji: "⭐" },
  { text: "FISH", emoji: "🐟" },
  { text: "FROG", emoji: "🐸" },
  { text: "CAKE", emoji: "🍰" },
  { text: "MOON", emoji: "🌙" },
  { text: "DUCK", emoji: "🦆" },
  { text: "BEAR", emoji: "🐻" },
  { text: "TREE", emoji: "🌳" },
];

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function randFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Level climbs by one with every rocket launched. */
export function levelFor(completed: number): number {
  return completed + 1;
}

/** Levels 1–2 are single letters; level 3+ are short words. */
export function isWordLevel(level: number): boolean {
  return level >= 3;
}

/**
 * Difficulty tier, used to fire a level-up cue only when the challenge actually
 * steps up: 0 = single letters, 1 = 3-letter words, 2 = 4-letter words.
 */
export function tierFor(level: number): number {
  if (!isWordLevel(level)) return 0;
  return level >= 5 ? 2 : 1;
}

/** Keyboard size grows with the level, capped at 12 so it always fits a phone. */
export function keyCountFor(level: number): number {
  return Math.min(9 + Math.floor((level - 1) / 2), 12);
}

/** Stars from the final score, per the game spec thresholds. */
export function starsFor(score: number): number {
  if (score >= 500) return 3;
  if (score >= 250) return 2;
  if (score >= 100) return 1;
  return 0;
}

function pickLetter(avoid: string): Target {
  let pool = ALPHABET.filter((c) => c !== avoid);
  if (pool.length === 0) pool = ALPHABET;
  return { text: randFrom(pool), emoji: "" };
}

function pickWord(level: number, avoid: string): Target {
  const maxLen = tierFor(level) >= 2 ? 4 : 3;
  let pool = WORDS.filter((w) => w.text.length <= maxLen && w.text !== avoid);
  if (pool.length === 0) pool = WORDS.filter((w) => w.text !== avoid);
  if (pool.length === 0) pool = WORDS;
  return randFrom(pool);
}

/** The next target for a level, never repeating the previous one back-to-back. */
export function pickTarget(level: number, avoid: string): Target {
  return isWordLevel(level) ? pickWord(level, avoid) : pickLetter(avoid);
}

/**
 * The on-screen keys for a target: every distinct letter it needs, padded with
 * random wrong-letter distractors up to `count`, then shuffled.
 */
export function makeKeys(text: string, count: number): string[] {
  const need = [...new Set(text.split(""))];
  const distractors = shuffle(ALPHABET.filter((c) => !need.includes(c)));
  const padding = Math.max(0, count - need.length);
  return shuffle([...need, ...distractors.slice(0, padding)]);
}
