// Pure, framework-free question logic for Times Tiles (multiplication).
// Kept out of the React component so the difficulty curve and distractor rules
// are easy to read and reason about. Math.random lives inside functions only —
// never at module top level — so importing this file is side-effect free.

export type Question = {
  id: number;
  /** The two factors, e.g. 7 and 6. */
  a: number;
  b: number;
  /** Prompt body, e.g. "7 × 6". The view appends " = ?". */
  text: string;
  answer: number;
  /** Four options, shuffled, exactly one equals `answer`. */
  choices: number[];
  /** How long this question's timer bar lasts, in ms. */
  durationMs: number;
};

/** Difficulty band, ramps every 4 correct answers (capped at 7). */
export function levelFor(correctCount: number): number {
  return Math.min(Math.floor(correctCount / 4), 7);
}

/**
 * Largest factor allowed at a level. Starts at the 2×–5× tables and expands one
 * table per band, reaching 9× by band 4 and topping out at the 12× table.
 */
export function factorMaxFor(level: number): number {
  return Math.min(5 + level, 12);
}

/** Timer tightens each band: ~6s at the start, never below 3s. */
export function durationFor(level: number): number {
  return Math.max(3000, 6000 - level * 450);
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

/** Both factors drawn from [2, max] so every prompt is a real times-table fact. */
function makeFactors(level: number): { a: number; b: number } {
  const max = factorMaxFor(level);
  return { a: rand(2, max), b: rand(2, max) };
}

/**
 * Three distinct, plausible wrong answers. Prioritises the classic mistakes —
 * an off-by-one row or column ((a±1)·b, a·(b±1)) — then small ± nudges. All are
 * non-negative, distinct, and never equal the real answer. A bounded fallback
 * guarantees three even for the smallest products.
 */
function makeDistractors(a: number, b: number, answer: number): number[] {
  const offByRowCol = shuffle([
    (a + 1) * b,
    (a - 1) * b,
    a * (b + 1),
    a * (b - 1),
  ]);
  const nudges = shuffle([
    answer + a,
    answer - a,
    answer + b,
    answer - b,
    answer + 1,
    answer - 1,
    answer + 2,
    answer - 2,
  ]);

  const distractors = new Set<number>();
  for (const candidate of [...offByRowCol, ...nudges]) {
    if (distractors.size >= 3) break;
    if (candidate >= 0 && candidate !== answer) distractors.add(candidate);
  }

  // Deterministic padding for tiny answers with few neighbours. Always positive
  // and != answer because step starts past the nudge range.
  let step = 3;
  while (distractors.size < 3) {
    distractors.add(answer + step);
    step++;
  }

  return [...distractors];
}

export function genQuestion(correctCount: number, id: number): Question {
  const level = levelFor(correctCount);
  const { a, b } = makeFactors(level);
  const answer = a * b;
  return {
    id,
    a,
    b,
    text: `${a} × ${b}`,
    answer,
    choices: shuffle([answer, ...makeDistractors(a, b, answer)]),
    durationMs: durationFor(level),
  };
}
