// Pure, framework-free question logic for Math Pop.
// Kept out of the React component so the game loop stays readable and the
// difficulty/scoring rules are easy to reason about and unit-friendly.

export type Op = "+" | "-" | "×" | "÷";

export type Question = {
  id: number;
  /** Prompt body, e.g. "7 + 5". The view appends " = ?". */
  text: string;
  answer: number;
  /** Four options, shuffled, exactly one equals `answer`. */
  choices: number[];
  /** How long this question's timer bar lasts, in ms. */
  durationMs: number;
};

/** Difficulty band, ramps every 5 correct answers (capped). */
export function levelFor(correctCount: number): number {
  return Math.min(Math.floor(correctCount / 5), 4);
}

/** Timer shrinks slightly each band, never below 3s. */
export function durationFor(level: number): number {
  return Math.max(3000, 6000 - level * 500);
}

/** Stars from final score, per the game spec thresholds. */
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

type Core = { a: number; b: number; op: Op; answer: number };

// Difficulty curve:
//  0: single-digit addition
//  1: + subtraction (single digit, non-negative)
//  2: two-digit addition / subtraction
//  3+: multiplication & division with small numbers, mixed with the rest
function makeCore(level: number): Core {
  if (level <= 0) {
    const a = rand(1, 9);
    const b = rand(1, 9);
    return { a, b, op: "+", answer: a + b };
  }
  if (level === 1) {
    if (Math.random() < 0.5) {
      const a = rand(1, 9);
      const b = rand(1, 9);
      return { a, b, op: "+", answer: a + b };
    }
    const a = rand(2, 9);
    const b = rand(1, a);
    return { a, b, op: "-", answer: a - b };
  }
  if (level === 2) {
    if (Math.random() < 0.5) {
      const a = rand(10, 49);
      const b = rand(10, 49);
      return { a, b, op: "+", answer: a + b };
    }
    const a = rand(20, 99);
    const b = rand(10, a - 1);
    return { a, b, op: "-", answer: a - b };
  }
  // level >= 3
  const roll = Math.random();
  if (roll < 0.35) {
    const a = rand(2, 9);
    const b = rand(2, 9);
    return { a, b, op: "×", answer: a * b };
  }
  if (roll < 0.6) {
    const quotient = rand(2, 9);
    const b = rand(2, 9);
    const a = quotient * b;
    return { a, b, op: "÷", answer: quotient };
  }
  if (roll < 0.8) {
    const a = rand(10, 60);
    const b = rand(10, 40);
    return { a, b, op: "+", answer: a + b };
  }
  const a = rand(20, 99);
  const b = rand(10, a - 1);
  return { a, b, op: "-", answer: a - b };
}

// Three plausible, distinct, non-negative wrong answers near the truth.
// Bounded loop + deterministic padding so it can never spin forever.
function makeChoices(answer: number): number[] {
  const options = new Set<number>([answer]);
  const spread = Math.max(2, Math.round(answer * 0.25));

  let guard = 0;
  while (options.size < 4 && guard < 40) {
    guard++;
    const sign = Math.random() < 0.5 ? -1 : 1;
    const candidate = answer + rand(1, spread) * sign;
    if (candidate >= 0) options.add(candidate);
  }

  // Padding fallback (e.g. tiny answers with a narrow random range).
  let step = 1;
  while (options.size < 4) {
    if (answer + step >= 0) options.add(answer + step);
    if (options.size < 4 && answer - step >= 0) options.add(answer - step);
    step++;
  }

  return shuffle([...options]);
}

export function genQuestion(level: number, id: number): Question {
  const { a, b, op, answer } = makeCore(level);
  return {
    id,
    text: `${a} ${op} ${b}`,
    answer,
    choices: makeChoices(answer),
    durationMs: durationFor(level),
  };
}
