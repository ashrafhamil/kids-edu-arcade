// Fraction Feast dataset + pure round/scoring helpers.
//
// No React, and nothing random or time-based at module scope. The only Math.random
// lives inside genRound(), which the component calls strictly from handlers/effects,
// keeping this module SSR-safe.

export type FractionValue = { numerator: number; denominator: number };

/**
 * The only fractions this game ever shows, already in lowest terms (halves, thirds,
 * quarters, fifths). Every value here is numerically distinct, so offering any subset of
 * this list as choices can never produce two options that mean the same amount — the
 * exact collision (e.g. both 1/2 and 2/4) the design must avoid.
 */
const FRACTIONS: FractionValue[] = [
  { numerator: 1, denominator: 2 },
  { numerator: 1, denominator: 3 },
  { numerator: 2, denominator: 3 },
  { numerator: 1, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 1, denominator: 5 },
  { numerator: 2, denominator: 5 },
  { numerator: 3, denominator: 5 },
  { numerator: 4, denominator: 5 },
];

/** Halves/thirds/quarters only, until the player has a few correct rounds under their belt. */
const EASY_FRACTIONS = FRACTIONS.filter((f) => f.denominator <= 4);

export function label(f: FractionValue): string {
  return `${f.numerator}/${f.denominator}`;
}

export type Round = {
  id: number;
  /** The shaded fraction of the pizza — the one true answer. */
  answer: FractionValue;
  /** The answer plus distractors, shuffled. Every value is distinct. */
  choices: FractionValue[];
};

const STAR_THRESHOLDS = [80, 200, 400] as const;

/** 0–3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

/** Three choices to start, four once the player is warmed up. */
export function choiceCountFor(correctCount: number): number {
  return correctCount >= 4 ? 4 : 3;
}

/** Fifths only unlock after a few correct rounds, keeping the earliest pizzas simple. */
function poolFor(correctCount: number): FractionValue[] {
  return correctCount >= 3 ? FRACTIONS : EASY_FRACTIONS;
}

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

function sameFraction(a: FractionValue, b: FractionValue): boolean {
  return a.numerator === b.numerator && a.denominator === b.denominator;
}

/**
 * Build the next round: a random shaded fraction as the answer, plus distractors drawn
 * from the same reduced-fraction pool so every choice is a distinct, unambiguous value.
 * `avoid` keeps the same fraction from appearing twice in a row.
 */
export function genRound(id: number, correctCount: number, avoid?: FractionValue): Round {
  const pool = poolFor(correctCount);
  const eligible = avoid ? pool.filter((f) => !sameFraction(f, avoid)) : pool;
  const answer = pick(eligible.length > 0 ? eligible : pool);

  const distractorPool = shuffle(pool.filter((f) => !sameFraction(f, answer)));
  const count = choiceCountFor(correctCount);
  const distractors = distractorPool.slice(0, count - 1);

  const choices = shuffle([answer, ...distractors]);
  return { id, answer, choices };
}
