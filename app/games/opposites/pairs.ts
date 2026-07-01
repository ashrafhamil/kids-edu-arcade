// Opposites dataset + pure round/scoring helpers.
//
// No React, and nothing random or time-based at module scope. The only Math.random
// lives inside genRound(), which the component calls strictly from handlers/effects,
// keeping this module SSR-safe.

export type OppWord = {
  /** Display word. Unique across the dataset, so it doubles as an id. */
  word: string;
  emoji: string;
  /** Key of the pair this word belongs to. The two words sharing a key are opposites. */
  pair: string;
};

export type OppPair = { key: string; a: OppWord; b: OppWord };

type RawPair = {
  key: string;
  a: [word: string, emoji: string];
  b: [word: string, emoji: string];
};

const RAW_PAIRS: RawPair[] = [
  { key: "temp", a: ["Hot", "🔥"], b: ["Cold", "🧊"] },
  { key: "size", a: ["Big", "🐘"], b: ["Small", "🐭"] },
  { key: "vertical", a: ["Up", "⬆️"], b: ["Down", "⬇️"] },
  { key: "speed", a: ["Fast", "🐇"], b: ["Slow", "🐢"] },
  { key: "sky", a: ["Day", "☀️"], b: ["Night", "🌙"] },
  { key: "mood", a: ["Happy", "😄"], b: ["Sad", "😢"] },
  { key: "door", a: ["Open", "🔓"], b: ["Closed", "🔒"] },
  { key: "water", a: ["Wet", "💧"], b: ["Dry", "🌵"] },
  { key: "fill", a: ["Full", "🔋"], b: ["Empty", "🪫"] },
  { key: "volume", a: ["Loud", "📢"], b: ["Quiet", "🤫"] },
  { key: "texture", a: ["Hard", "🪨"], b: ["Soft", "🧸"] },
  { key: "age", a: ["New", "✨"], b: ["Old", "👴"] },
];

export const PAIRS: OppPair[] = RAW_PAIRS.map((p) => ({
  key: p.key,
  a: { word: p.a[0], emoji: p.a[1], pair: p.key },
  b: { word: p.b[0], emoji: p.b[1], pair: p.key },
}));

// Fast prompt -> opposite lookup. Every word's opposite is the other side of its pair.
const OPPOSITE_OF: Record<string, OppWord> = {};
for (const p of PAIRS) {
  OPPOSITE_OF[p.a.word] = p.b;
  OPPOSITE_OF[p.b.word] = p.a;
}

export const ALL_WORDS: OppWord[] = PAIRS.flatMap((p) => [p.a, p.b]);

// Some words read as an opposite of a word from a DIFFERENT pair too (e.g. "Soft" is a
// fair opposite of "Loud" in the sound sense). Block those pairs from supplying a
// distractor so the puzzle always has exactly one defensible answer.
const CONFUSABLE_PAIRS: Record<string, readonly string[]> = {
  volume: ["texture"],
  texture: ["volume"],
};

export type Round = {
  id: number;
  /** The word shown big at the top. */
  prompt: OppWord;
  /** The opposite of the prompt — the one true answer. */
  correct: OppWord;
  /** The correct word plus distractors from other pairs, shuffled. */
  choices: OppWord[];
};

// --- Difficulty + scoring --------------------------------------------------

const STAR_THRESHOLDS = [80, 200, 400] as const;

/** 0–3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

/** Three choices to start, four once the player is warmed up. */
export function choiceCountFor(correctCount: number): number {
  return correctCount >= 4 ? 4 : 3;
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
 * Build a round: a prompt word, its true opposite as the correct answer, and distractors
 * each drawn from a DISTINCT other pair (never the prompt's own pair, and never a pair that
 * could read as a second valid opposite). So exactly one choice is ever correct.
 *
 * `usedPrompts` keeps a prompt from repeating until the pool cycles; `avoidWord` blocks an
 * immediate repeat across a cycle reset. Random calls live only here, so callers must invoke
 * this from handlers/effects (never during render) to stay SSR-safe.
 */
export function genRound(
  correctCount: number,
  id: number,
  usedPrompts: readonly string[] = [],
  avoidWord?: string,
): Round {
  const used = new Set(usedPrompts);
  let eligible = ALL_WORDS.filter((w) => !used.has(w.word) && w.word !== avoidWord);
  // Fallbacks keep the game playable if the caller hasn't reset the cycle yet.
  if (eligible.length === 0) eligible = ALL_WORDS.filter((w) => w.word !== avoidWord);
  if (eligible.length === 0) eligible = [...ALL_WORDS];

  const prompt = pick(eligible);
  const correct = OPPOSITE_OF[prompt.word];

  const blocked = new Set<string>([prompt.pair, ...(CONFUSABLE_PAIRS[prompt.pair] ?? [])]);
  const distractorsNeeded = choiceCountFor(correctCount) - 1;
  const otherPairs = shuffle(PAIRS.filter((p) => !blocked.has(p.key)));
  const distractors = otherPairs.slice(0, distractorsNeeded).map((p) => pick([p.a, p.b]));

  return {
    id,
    prompt,
    correct,
    choices: shuffle([correct, ...distractors]),
  };
}
