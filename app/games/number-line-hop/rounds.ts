// Number Line Hop dataset-free round logic: a numeric sequence with one or two
// hidden tiles, plus the pure difficulty/scoring helpers.
//
// No React here, and nothing random or time-based at module scope. Every
// Math.random call sits inside genRound(), which the component only ever calls
// from handlers and effects — that keeps this module SSR-safe.

export type Round = {
  id: number;
  /** Difficulty band this round was built for. */
  level: number;
  /** The whole sequence, left to right, gaps included. */
  tiles: number[];
  /** Indexes into `tiles` that render as gaps. Ascending: filled left to right. */
  gapIndexes: number[];
  /** Tap options per gap, same order as `gapIndexes`. Exactly one is correct. */
  choicesPerGap: number[][];
  /** How long each gap's timer bar lasts, in ms. */
  durationMs: number;
};

/** Shape of the number line for one difficulty band. */
type LineShape = {
  /** First number on the line. */
  start: number;
  /** Last number on the line. */
  end: number;
  /** Distance between neighbouring tiles (2 = counting by twos). */
  step: number;
  /** How many tiles are hidden. */
  gaps: number;
};

const STAR_THRESHOLDS = [80, 200, 400] as const;
const CORRECT_PER_LEVEL = 4;
const MAX_LEVEL = 3;
const FOUR_CHOICE_SCORE = 150;
/** Two gaps sit this close so the sibling number is a genuine near-miss. */
const TWIN_GAP_SPANS = [1, 2] as const;
/** How far the near-miss search walks away from the answer before padding. */
const MAX_DISTRACTOR_DELTA = 12;

/** Difficulty band, one step up every 4 correct taps (capped at 3). */
export function levelFor(correctCount: number): number {
  return Math.min(Math.floor(correctCount / CORRECT_PER_LEVEL), MAX_LEVEL);
}

/** The number line each band draws: 1–5, then 1–10, then 1–10 twice over, then twos to 20. */
export function shapeFor(level: number): LineShape {
  switch (level) {
    case 0:
      return { start: 1, end: 5, step: 1, gaps: 1 };
    case 1:
      return { start: 1, end: 10, step: 1, gaps: 1 };
    case 2:
      return { start: 1, end: 10, step: 1, gaps: 2 };
    default:
      return { start: 2, end: 20, step: 2, gaps: 1 };
  }
}

/** Timer shrinks each band, never below 4s. */
export function durationFor(level: number): number {
  return Math.max(4000, 8000 - level * 700);
}

/** Three choices to start, four once the player is warmed up. */
export function choiceCountFor(score: number): number {
  return score >= FOUR_CHOICE_SCORE ? 4 : 3;
}

/** 0–3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The full sequence a band draws, e.g. [2, 4, 6, ... 20]. */
function buildTiles({ start, end, step }: LineShape): number[] {
  const tiles: number[] = [];
  for (let value = start; value <= end; value += step) tiles.push(value);
  return tiles;
}

/**
 * Which tiles to hide. A single gap can sit anywhere; a pair is kept 1–2 tiles
 * apart so each gap's sibling is itself a near-miss of the other — the only way
 * both distractor rules (near-miss, never visible) can hold at once.
 */
function pickGapIndexes(tileCount: number, gaps: number): number[] {
  if (gaps < 2) return [rand(0, tileCount - 1)];

  const span = TWIN_GAP_SPANS[rand(0, TWIN_GAP_SPANS.length - 1)];
  const first = rand(0, tileCount - 1 - span);
  return [first, first + span];
}

/**
 * Near-miss distractors for one gap: numbers ±1, ±2, ±3… away from the answer,
 * walking outwards and skipping anything already readable on the line. On the
 * short lines the visible neighbours are used up immediately, so the search has
 * to widen past ±2 — see the deviation note in the report.
 */
function distractorsFor(answer: number, visible: ReadonlySet<number>, count: number): number[] {
  const picked: number[] = [];

  for (let delta = 1; delta <= MAX_DISTRACTOR_DELTA && picked.length < count; delta++) {
    for (const candidate of shuffle([answer - delta, answer + delta])) {
      if (picked.length >= count) break;
      if (candidate < 1 || candidate === answer) continue;
      if (visible.has(candidate) || picked.includes(candidate)) continue;
      picked.push(candidate);
    }
  }

  // Deterministic padding so a tight line can never return too few tiles.
  for (let extra = 1; picked.length < count; extra++) {
    const candidate = answer + MAX_DISTRACTOR_DELTA + extra;
    if (!picked.includes(candidate)) picked.push(candidate);
  }

  return picked;
}

/**
 * Tap options for every gap, in the order they get filled. Gaps to the left are
 * already answered by the time a gap comes up, so their numbers count as visible;
 * gaps still to come do not, which lets a pending sibling serve as a distractor.
 */
function buildChoicesPerGap(tiles: number[], gapIndexes: number[], count: number): number[][] {
  return gapIndexes.map((gapIndex, order) => {
    const answer = tiles[gapIndex];
    const pending = new Set(gapIndexes.slice(order).map((i) => tiles[i]));
    const visible = new Set(tiles.filter((value) => !pending.has(value)));
    return shuffle([answer, ...distractorsFor(answer, visible, count - 1)]);
  });
}

/** Build the next round for the given band, sized for the current score. */
export function genRound(id: number, level: number, score: number): Round {
  const shape = shapeFor(level);
  const tiles = buildTiles(shape);
  const gapIndexes = pickGapIndexes(tiles.length, shape.gaps);

  return {
    id,
    level,
    tiles,
    gapIndexes,
    choicesPerGap: buildChoicesPerGap(tiles, gapIndexes, choiceCountFor(score)),
    durationMs: durationFor(level),
  };
}
