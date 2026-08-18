// Add Ladder question generation + pure difficulty/scoring helpers.
//
// No React here, and nothing random at module scope: every Math.random call sits
// inside a function body that the component only calls from handlers/effects,
// which keeps this module SSR-safe.

/** Rungs the climber must clear before the ladder resets one level harder. */
export const RUNGS_PER_LEVEL = 10;

/** Arithmetic shapes a question can take. */
export type QuestionForm = "add" | "sub" | "missing";

export type Question = {
  id: number;
  /** Full prompt, e.g. "7 + 5 = ?" or "? + 4 = 11". Numerals only. */
  text: string;
  answer: number;
  /** Four options, shuffled, exactly one equals `answer`. */
  choices: number[];
  /** How long this question's timer bar lasts, in ms. */
  durationMs: number;
};

const CHOICE_COUNT = 4;
const STAR_THRESHOLDS = [80, 200, 400] as const;

/** Hardest content band; past this only the timer keeps tightening. */
const MAX_BAND = 4;

/**
 * Which question shapes each band draws from. Repeating a form inside a band is
 * how it gets weighted, so the mix stays readable at a glance.
 *  0: addition within 10
 *  1: addition within 20
 *  2: subtraction mixes in
 *  3: missing-addend mixes in
 *  4: missing-addend dominates
 */
const FORMS_BY_BAND: readonly (readonly QuestionForm[])[] = [
  ["add"],
  ["add"],
  ["add", "sub"],
  ["add", "sub", "missing"],
  ["add", "sub", "missing", "missing"],
];

/** 0–3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

/** Level number from rungs climbed: one level per full ladder. */
export function levelFor(rungsClimbed: number): number {
  return Math.floor(rungsClimbed / RUNGS_PER_LEVEL);
}

/** Content difficulty band, capped so the arithmetic stays within 20. */
export function bandFor(level: number): number {
  return Math.min(level, MAX_BAND);
}

/** Timer bar length: shrinks every level, never below 3.5s. */
export function durationFor(level: number): number {
  return Math.max(3500, 7000 - level * 600);
}

/** Which rung the climber stands on after `rungsClimbed` correct answers. */
export function rungFor(rungsClimbed: number): number {
  const within = rungsClimbed % RUNGS_PER_LEVEL;
  return within === 0 && rungsClimbed > 0 ? RUNGS_PER_LEVEL : within;
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

type Core = {
  text: string;
  answer: number;
  /** The off-by-operation answer, e.g. the sum when the answer is the difference. */
  trap: number;
};

/** Largest total in play: within 10 at band 0, within 20 after that. */
function totalRangeFor(band: number): { min: number; max: number } {
  return band <= 0 ? { min: 3, max: 10 } : { min: 11, max: 20 };
}

function makeAdd(band: number): Core {
  const { min, max } = totalRangeFor(band);
  const total = rand(min, max);
  const a = rand(1, total - 1);
  const b = total - a;
  return { text: `${a} + ${b} = ?`, answer: total, trap: Math.abs(a - b) };
}

function makeSub(band: number): Core {
  const { max } = totalRangeFor(band);
  const minuend = rand(Math.max(3, max - 9), max);
  const subtrahend = rand(1, minuend - 1);
  return {
    text: `${minuend} - ${subtrahend} = ?`,
    answer: minuend - subtrahend,
    trap: minuend + subtrahend,
  };
}

function makeMissing(band: number): Core {
  const { min, max } = totalRangeFor(band);
  const total = rand(min, max);
  const known = rand(1, total - 1);
  const missing = total - known;
  const unknownFirst = Math.random() < 0.5;
  return {
    text: unknownFirst ? `? + ${known} = ${total}` : `${known} + ? = ${total}`,
    answer: missing,
    trap: total + known,
  };
}

function makeCore(form: QuestionForm, band: number): Core {
  if (form === "sub") return makeSub(band);
  if (form === "missing") return makeMissing(band);
  return makeAdd(band);
}

/**
 * Four distinct, non-negative options. The off-by-operation trap goes in first
 * because it is the distractor that teaches, then ±1/±2 in random order. The
 * final padding loop always adds a new higher value, so it cannot spin forever.
 */
function makeChoices(answer: number, trap: number): number[] {
  const options: number[] = [answer];
  const add = (value: number): void => {
    if (value >= 0 && options.length < CHOICE_COUNT && !options.includes(value)) {
      options.push(value);
    }
  };

  // A zero trap only happens on equal addends (6 + 6), where it is a throwaway
  // tile — let the near-miss offsets take that slot instead.
  if (trap > 0) add(trap);
  for (const offset of shuffle([1, -1, 2, -2])) add(answer + offset);

  let extra = 3;
  while (options.length < CHOICE_COUNT) {
    add(answer + extra);
    extra++;
  }

  return shuffle(options);
}

/** How many times to re-roll before accepting a repeat of the previous prompt. */
const REROLL_ATTEMPTS = 4;

/**
 * Build the next rung's question. `avoidText` keeps the same prompt from showing
 * twice in a row; after a bounded number of tries the last roll is accepted.
 */
export function genQuestion(level: number, id: number, avoidText?: string): Question {
  const band = bandFor(level);
  let core = makeCore(pick(FORMS_BY_BAND[band]), band);

  for (let attempt = 0; attempt < REROLL_ATTEMPTS && core.text === avoidText; attempt++) {
    core = makeCore(pick(FORMS_BY_BAND[band]), band);
  }

  return {
    id,
    text: core.text,
    answer: core.answer,
    choices: makeChoices(core.answer, core.trap),
    durationMs: durationFor(level),
  };
}
