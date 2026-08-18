// Skip Count dataset + pure round/scoring helpers.
//
// No React, and nothing random or time-based at module scope. Every Math.random
// call lives inside genRound(), which the component invokes strictly from
// handlers/effects, keeping this module SSR-safe.

/** Skip-counting steps unlocked at each level; the last level mixes them all. */
const STEPS_BY_LEVEL: readonly (readonly number[])[] = [
  [2],
  [5],
  [10],
  [3],
  [2, 3, 5, 10],
];

export const MAX_LEVEL = STEPS_BY_LEVEL.length - 1;

/** Correct answers needed to move up one level. */
const CORRECT_PER_LEVEL = 4;

/** Highest number that may appear in a sequence, so every term stays 2 digits. */
const MAX_TERM = 99;

/** Sequences show 3 or 4 visible terms, so a row holds 4 or 5 slots. */
const MIN_VISIBLE_TERMS = 3;
const MAX_VISIBLE_TERMS = 4;

/** Largest multiple-of-step start, keeping numbers kid-sized (e.g. 2s start ≤ 12). */
const MAX_START_MULTIPLE = 6;

/**
 * Starts that are NOT a multiple of the step, so sequences don't always begin at
 * the step itself ("3, 5, 7, ?" as well as "2, 4, 6, ?"). One offset family per
 * step, each chosen to stay friendly at this band.
 */
const OFFSETS_BY_STEP: Record<number, readonly number[]> = {
  2: [1],
  3: [1, 2],
  5: [1, 2, 3],
  10: [5],
};

/** How often a sequence starts off the step's own multiples. */
const OFFSET_CHANCE = 0.4;

/** From this level the gap may sit mid-sequence ("5, ?, 15, 20"). */
const MIDDLE_GAP_MIN_LEVEL = 2;

/** How often an eligible round hides a middle term instead of the last one. */
const MIDDLE_GAP_CHANCE = 0.35;

const CHOICE_COUNT = 4;

const STAR_THRESHOLDS = [80, 200, 400] as const;

/** Where the hidden term sits — at the end of the row, or between two terms. */
type GapKind = "end" | "middle";

export type Round = {
  id: number;
  /** The full sequence; the term at `gapIndex` is the hidden one. */
  terms: number[];
  /** Index of the hidden term — the last slot, or a middle slot from level 2. */
  gapIndex: number;
  /** The skip-counting step this sequence uses. */
  step: number;
  /** The hidden term, i.e. `terms[gapIndex]`. */
  answer: number;
  /** Shuffled tap options: the answer plus three plausible distractors. */
  choices: number[];
  /** How long this round's timer bar lasts, in ms. */
  durationMs: number;
};

/** 0–3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

/** Difficulty level, rising one band every `CORRECT_PER_LEVEL` correct answers. */
export function levelFor(correctCount: number): number {
  return Math.min(Math.floor(correctCount / CORRECT_PER_LEVEL), MAX_LEVEL);
}

/** Timer bar length: 7.5s at level 0, tightening each level, never below 3.5s. */
export function durationFor(level: number): number {
  return Math.max(3500, 7500 - level * 650);
}

// ---- Small pure random helpers (called only from generators) ----

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

// ---- Sequence building ----

/** The steps a player may meet at this level. */
function stepsFor(level: number): readonly number[] {
  return STEPS_BY_LEVEL[Math.min(Math.max(level, 0), MAX_LEVEL)];
}

/**
 * First term of the sequence. Derived from the cap so the last term can never
 * pass MAX_TERM: `maxStart = MAX_TERM - (slots - 1) * step`.
 */
function startFor(step: number, slots: number): number {
  const maxStart = MAX_TERM - (slots - 1) * step;
  const highestMultiple = Math.min(MAX_START_MULTIPLE, Math.floor(maxStart / step));
  const base = step * rand(1, Math.max(1, highestMultiple));

  const offsets = (OFFSETS_BY_STEP[step] ?? []).filter((o) => base + o <= maxStart);
  if (offsets.length === 0 || Math.random() >= OFFSET_CHANCE) return base;
  return base + pick(offsets);
}

/** Which slot holds the hidden term: the last one, or a middle one from level 2. */
function gapIndexFor(level: number, slots: number): number {
  const lastIndex = slots - 1;
  const middleAllowed = level >= MIDDLE_GAP_MIN_LEVEL && slots >= 3;
  if (!middleAllowed || Math.random() >= MIDDLE_GAP_CHANCE) return lastIndex;
  return rand(1, slots - 2);
}

/**
 * Wrong answers, most plausible first:
 *  1. off by one step — the previous term (forgot to add) and the term after next
 *     (added twice),
 *  2. off by one value — a small counting slip,
 *  3. off by two / step-plus-one, as fallbacks.
 * The ± order within each pair is shuffled so a distractor family isn't always
 * on the same side of the answer.
 */
function distractorCandidates(answer: number, step: number, gap: GapKind): number[] {
  const stepNeighbours = shuffle([answer - step, answer + step]);
  const offByOne = shuffle([answer - 1, answer + 1]);
  const offByTwo = shuffle([answer - 2, answer + 2]);
  const stepPlusOne = shuffle([answer - step - 1, answer + step + 1]);

  // A middle gap shows both step neighbours already, so a half-step slip (45 in
  // "35, ?, 55, 65") stands in as the nearest still-plausible miscount. Only
  // even steps halve to a whole number.
  const halfStep =
    gap === "middle" && step % 2 === 0
      ? shuffle([answer - step / 2, answer + step / 2])
      : [];

  return [...stepNeighbours, ...halfStep, ...offByOne, ...offByTwo, ...stepPlusOne];
}

/**
 * Three distinct positive distractors.
 *
 * With the gap at the end, the previous term is the classic "forgot to add the
 * step" slip, so terms already on screen stay eligible. With the gap in the
 * middle, both step neighbours sit in plain sight — offering one there would be a
 * giveaway rather than a plausible mistake, so `bannedTerms` excludes them and
 * the off-by-one family takes over.
 */
function buildDistractors(
  answer: number,
  step: number,
  gap: GapKind,
  bannedTerms: number[]
): number[] {
  const banned = new Set<number>([answer, ...bannedTerms]);
  const chosen: number[] = [];

  for (const candidate of distractorCandidates(answer, step, gap)) {
    if (chosen.length >= CHOICE_COUNT - 1) break;
    if (candidate <= 0 || banned.has(candidate)) continue;
    banned.add(candidate);
    chosen.push(candidate);
  }

  // Safety net for tiny answers, where several candidates fall at or below zero.
  for (let extra = 3; chosen.length < CHOICE_COUNT - 1; extra++) {
    const candidate = answer + extra;
    if (banned.has(candidate)) continue;
    banned.add(candidate);
    chosen.push(candidate);
  }

  return chosen;
}

/**
 * Build the next round for the given level. `avoidStep` keeps the same step from
 * repeating twice in a row once the level offers a choice of steps.
 */
export function genRound(level: number, id: number, avoidStep?: number): Round {
  const pool = stepsFor(level);
  const usable = pool.length > 1 ? pool.filter((s) => s !== avoidStep) : pool;
  const step = pick(usable.length > 0 ? usable : pool);

  const slots = rand(MIN_VISIBLE_TERMS, MAX_VISIBLE_TERMS) + 1;
  const start = startFor(step, slots);
  const terms = Array.from({ length: slots }, (_, i) => start + i * step);

  const gapIndex = gapIndexFor(level, slots);
  const answer = terms[gapIndex];
  const gap: GapKind = gapIndex < slots - 1 ? "middle" : "end";
  const bannedTerms = gap === "middle" ? terms.filter((_, i) => i !== gapIndex) : [];

  return {
    id,
    terms,
    gapIndex,
    step,
    answer,
    choices: shuffle([answer, ...buildDistractors(answer, step, gap, bannedTerms)]),
    durationMs: durationFor(level),
  };
}
