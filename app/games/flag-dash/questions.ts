// Pure question + scoring logic for Flag Dash. Kept out of the React component
// so the game loop stays readable and the difficulty curve is easy to tune.
//
// Every function here is deterministic except the Math.random calls inside
// genQuestion, which is only ever invoked from event handlers / effects in the
// component (never during render), keeping the module SSR-safe.

import { COUNTRIES, type Country } from "./data";

export type Question = {
  id: number;
  /** The country whose flag is shown — the correct answer. */
  answer: Country;
  /** Four distinct countries, including the answer, in shuffled order. */
  choices: Country[];
  /** Per-question timer, shrinks as the player gets more correct. */
  durationMs: number;
};

const CHOICE_COUNT = 4;

// Timer curve: generous at first, then tightens to keep older kids on edge.
const START_MS = 6000;
const MIN_MS = 2600;
const STEP_MS = 250; // shaved off per difficulty step
const ANSWERS_PER_STEP = 3; // speed up every 3 correct answers

// Star thresholds for the home-hub badges (score is in points).
const STAR_THRESHOLDS = [80, 200, 400] as const;

/** Timer length for the next question, based on how many are already correct. */
export function durationFor(correctCount: number): number {
  const step = Math.floor(correctCount / ANSWERS_PER_STEP);
  return Math.max(MIN_MS, START_MS - step * STEP_MS);
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
 * Build a question: one correct country plus three distinct distractors, all
 * shuffled. The answer is drawn only from flags NOT in `usedNames`, so a flag
 * never reappears until every flag has been shown. `avoidName` additionally
 * prevents an immediate repeat across a cycle boundary (when the used set was
 * just reset). Distractors may still repeat — only the shown flag is unique.
 */
export function genQuestion(
  correctCount: number,
  id: number,
  usedNames: readonly string[] = [],
  avoidName?: string,
): Question {
  const used = new Set(usedNames);
  let eligible = COUNTRIES.filter((c) => !used.has(c.name) && c.name !== avoidName);
  // Fallbacks keep the game playable if the caller hasn't reset the cycle yet
  // (or the pool is tiny): drop the used filter, then the avoid filter.
  if (eligible.length === 0) eligible = COUNTRIES.filter((c) => c.name !== avoidName);
  if (eligible.length === 0) eligible = [...COUNTRIES];
  const answer = pick(eligible);
  const distractors = shuffle(COUNTRIES.filter((c) => c.name !== answer.name)).slice(
    0,
    CHOICE_COUNT - 1
  );
  return {
    id,
    answer,
    choices: shuffle([answer, ...distractors]),
    durationMs: durationFor(correctCount),
  };
}
