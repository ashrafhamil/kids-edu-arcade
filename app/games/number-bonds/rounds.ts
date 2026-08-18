// Number Bonds round generation + scoring helpers.
//
// Pure and framework-free: no React, and nothing random or time-based at module
// scope. Every Math.random lives inside genRound()'s helpers, which the component
// calls strictly from handlers/effects, keeping this module SSR-safe.

/** The bond targets used across the level curve. */
const TOTALS = [10, 20, 100] as const;

/** Bonds to 100 are practised in tens, the smaller totals in ones. */
const TENS_TOTAL = 100;
const TENS_UNIT = 10;
const ONES_UNIT = 1;

/** Four numeric tiles every round. */
const CHOICE_COUNT = 4;

/** No tile ever shows more than the largest total. */
const MAX_CHOICE = 100;

/** Correct answers needed before the next level. */
const CORRECT_PER_LEVEL = 4;

/** Highest level; L3 is the terminal band that mixes all three totals. */
const MAX_LEVEL = 3;

const STAR_THRESHOLDS = [80, 200, 400] as const;

/** A single "left + ? = total" prompt. */
type Prompt = {
  /** The number shown before the blank. */
  left: number;
  /** The bond target shown after the equals sign. */
  total: number;
  /** The missing partner the child has to tap. */
  answer: number;
};

export type Round = Prompt & {
  id: number;
  /** Shuffled tap options; always contains the answer plus distinct near-misses. */
  choices: number[];
  /** How long this round's timer bar lasts, in ms. */
  durationMs: number;
  /** Difficulty band this round was drawn from, shown as a pill in the play area. */
  level: number;
};

/** 0–3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

/** Difficulty band, ramping one level every 4 correct answers (capped). */
export function levelFor(correctCount: number): number {
  return Math.min(Math.floor(correctCount / CORRECT_PER_LEVEL), MAX_LEVEL);
}

/** Timer bar length, tightening one notch per level. */
export function durationFor(level: number): number {
  return Math.max(3500, 7000 - level * 600);
}

/**
 * Level curve: bonds to 10, then to 20, then to 100 in tens, then all three mixed.
 */
function totalsFor(level: number): readonly number[] {
  if (level <= 0) return [TOTALS[0]];
  if (level === 1) return [TOTALS[1]];
  if (level === 2) return [TOTALS[2]];
  return TOTALS;
}

/** Bonds to 100 step in tens (10 + ? = 100); the smaller totals step in ones. */
function unitFor(total: number): number {
  return total === TENS_TOTAL ? TENS_UNIT : ONES_UNIT;
}

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

/** Identifies a prompt so the same equation never appears twice in a row. */
export function promptKey(round: Prompt): string {
  return `${round.left}+${round.total}`;
}

function makePrompt(level: number): Prompt {
  const total = pick(totalsFor(level));
  const unit = unitFor(total);
  const left = rand(1, total / unit - 1) * unit;
  return { left, total, answer: total - left };
}

/**
 * A tile may show any non-negative number up to the largest total, as long as it
 * is neither the answer nor the number already printed in the prompt.
 */
function isPlausible(value: number, prompt: Prompt): boolean {
  return (
    value >= 0 && value <= MAX_CHOICE && value !== prompt.answer && value !== prompt.left
  );
}

/**
 * Near-misses a child actually makes: off by one step, or off by ten. Tens bonds
 * stay on multiples of ten so the tiles read as 70 / 80 / 90 / 100.
 */
function nearMissesFor(prompt: Prompt): number[] {
  const { answer } = prompt;
  return unitFor(prompt.total) === TENS_UNIT
    ? [answer - 10, answer + 10, answer - 20, answer + 20]
    : [answer - 1, answer + 1, answer - 10, answer + 10];
}

/**
 * The complement of the prompt number taken against a *different* total — the
 * mistake of bonding 7 to 20 when the equation asks for 10.
 */
function crossTotalComplements(prompt: Prompt): number[] {
  return TOTALS.filter((total) => total !== prompt.total).map((total) => total - prompt.left);
}

/**
 * Deterministic filler for the rare prompt whose near-misses nearly all fall out
 * of range; walks outward from the answer one step at a time. Bounded so it can
 * never spin forever.
 */
function padWithNeighbours(tiles: Set<number>, prompt: Prompt): void {
  const unit = unitFor(prompt.total);
  for (let step = 1; tiles.size < CHOICE_COUNT && step <= MAX_CHOICE; step++) {
    for (const candidate of [prompt.answer + step * unit, prompt.answer - step * unit]) {
      if (tiles.size < CHOICE_COUNT && isPlausible(candidate, prompt)) tiles.add(candidate);
    }
  }
}

function buildChoices(prompt: Prompt): number[] {
  const tiles = new Set<number>([prompt.answer]);
  const candidates = [...shuffle(nearMissesFor(prompt)), ...crossTotalComplements(prompt)];

  for (const candidate of candidates) {
    if (tiles.size >= CHOICE_COUNT) break;
    if (isPlausible(candidate, prompt)) tiles.add(candidate);
  }
  padWithNeighbours(tiles, prompt);

  return shuffle([...tiles]);
}

/**
 * Build the next round for the band `correctCount` has unlocked. `avoidKey` keeps
 * the same equation from appearing twice in a row.
 */
export function genRound(id: number, correctCount: number, avoidKey?: string): Round {
  const level = levelFor(correctCount);

  let prompt = makePrompt(level);
  for (let tries = 0; tries < 8 && promptKey(prompt) === avoidKey; tries++) {
    prompt = makePrompt(level);
  }

  return {
    ...prompt,
    id,
    choices: buildChoices(prompt),
    durationMs: durationFor(level),
    level,
  };
}
