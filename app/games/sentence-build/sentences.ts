// Sentence Build dataset + pure round/scoring helpers.
//
// No React, and nothing random or time-based at module scope. The only Math.random
// lives inside genRound(), which the component calls strictly from handlers/effects,
// keeping this module SSR-safe.
//
// ---------------------------------------------------------------------------
// Dataset rule: every sentence has EXACTLY ONE valid word order.
// ---------------------------------------------------------------------------
// Capitalisation and the full stop are baked into the tiles: exactly one tile is
// capitalised (it must go first) and exactly one tile carries the "." (it must go
// last). That is both a structural hint for the child and the outer lock on the
// word order.
//
// Inside those pinned ends, uniqueness is forced by construction. Every sentence
// obeys all of these:
//   1. Number lock — the two noun phrases never share a number, and the verb
//      agrees with the subject. Swapping them breaks agreement
//      ("chickens feeds", "the corn are"), so no swap survives.
//   2. Bare-noun lock — at most one determiner word ("My", "The", "Our"). The
//      noun without it is plural or a mass noun, so re-attaching the determiner
//      strands a bare singular count noun ("bare gardener"), which is not English.
//   3. Pronoun lock — "us" / "me" are accusative, so they can never be re-read as
//      the subject of the sentence.
//   4. No movable pieces — no adverbs, no prepositional phrases, no coordination,
//      and no adjective that could attach to either noun. Those are the only
//      constructions that give a second genuinely valid order.
//   5. No dative alternation — a ditransitive never ships a "to" / "for" tile, so
//      "gives us apples" has no "gives apples to us" twin. Every "to" tile is an
//      infinitive marker glued to the verb that follows it.
//
// Acceptance standard used when writing this list: a rival word order disqualifies
// a sentence only if it is a genuine free-variation alternative a child could
// legitimately produce. A re-parse that is merely parseable but semantically
// absurd does not.

export type Sentence = {
  /** The one correct order, tiles joined by spaces. Unique, so it doubles as an id. */
  text: string;
  /** The tiles in their correct order. First is capitalised, last carries the ".". */
  words: string[];
};

/** Word counts the game ramps through; the last one repeats forever. */
const LENGTHS = [4, 5, 6, 8] as const;

/** Correct sentences needed to move up one level. */
const SENTENCES_PER_LEVEL = 3;

const STAR_THRESHOLDS = [80, 200, 400] as const;

const TEXTS: readonly string[] = [
  // 4 words
  "My sister paints flowers.",
  "Our teacher reads stories.",
  "My brother collects stamps.",
  "The farmer feeds chickens.",
  "Our dog chases butterflies.",
  "My grandmother bakes cookies.",
  "The babies drink milk.",
  // 5 words
  "My cousin is drawing dinosaurs.",
  "My father is washing dishes.",
  "The chickens are eating corn.",
  "The gardener is planting trees.",
  "The doctor is helping patients.",
  "My uncle is fixing bicycles.",
  "The waiter is bringing drinks.",
  // 6 words
  "My grandmother is sending us postcards.",
  "The teacher is reading us stories.",
  "My mother is buying me shoes.",
  "The baker is giving us bread.",
  "My brother is teaching me chess.",
  "The farmer is showing us tractors.",
  // 8 words. No accusative pronoun here: an infinitive that can take a benefactive
  // dative would otherwise open a second valid order.
  "The class is learning how to plant seeds.",
  "My sister is learning how to bake bread.",
  "My brother is learning how to fix bicycles.",
  "The nurse is teaching how to wash hands.",
  "The coach is showing how to throw balls.",
  "The farmer is showing how to feed chickens.",
];

/** Every sentence, pre-split into tiles. Deterministic, so module scope is safe. */
const SENTENCES: readonly Sentence[] = TEXTS.map((text) => ({ text, words: text.split(" ") }));

export type Tile = {
  /** Unique per round, so duplicate words ("my" twice) stay distinct tiles. */
  key: string;
  /** The word exactly as it must be read, including any capital or full stop. */
  word: string;
};

export type Round = {
  id: number;
  /** The sentence to rebuild. */
  sentence: Sentence;
  /** Tiles in shuffled (pool) order — never already in the correct order. */
  tiles: Tile[];
  /** How long the timer bar lasts for the WHOLE sentence, in ms. */
  durationMs: number;
};

/** 0-3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

/** Difficulty level, one step up every SENTENCES_PER_LEVEL correct sentences. */
export function levelFor(sentencesCompleted: number): number {
  return Math.floor(sentencesCompleted / SENTENCES_PER_LEVEL);
}

/** How many words the sentence at this level has: 4 -> 5 -> 6 -> 8, then 8 forever. */
export function lengthFor(level: number): number {
  return LENGTHS[Math.min(level, LENGTHS.length - 1)];
}

/** Timer bar length for the WHOLE sentence, tightening with the level. */
export function durationFor(level: number): number {
  return Math.max(8000, 20000 - level * 1500);
}

function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Sentences of exactly `wordCount` words. Never empty for a length in LENGTHS. */
function poolFor(wordCount: number): Sentence[] {
  return SENTENCES.filter((s) => s.words.length === wordCount);
}

/** A shuffle of the tiles that is not already the answer, so the round is a real puzzle. */
function scramble(words: readonly string[]): string[] {
  let display = words.slice();
  for (let attempt = 0; attempt < 8; attempt++) {
    display = shuffle(words);
    if (display.some((word, i) => word !== words[i])) break;
  }
  return display;
}

/**
 * Build the next round. `avoidText` (the sentence just played) is skipped when the
 * bucket holds more than one sentence, so the same sentence never repeats back to back.
 */
export function genRound(id: number, sentencesCompleted: number, avoidText?: string): Round {
  const level = levelFor(sentencesCompleted);
  const bucket = poolFor(lengthFor(level));
  const fresh = bucket.filter((s) => s.text !== avoidText);
  const sentence = pick(fresh.length > 0 ? fresh : bucket);

  const tiles = scramble(sentence.words).map((word, i) => ({ key: `${id}-${i}`, word }));
  return { id, sentence, tiles, durationMs: durationFor(level) };
}
