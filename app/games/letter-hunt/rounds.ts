// Letter Hunt dataset + pure round/level helpers.
//
// No React, and nothing random or time-based at module scope. The only Math.random
// lives inside genRound() and its private helpers, which the component calls strictly
// from handlers/effects, keeping this module SSR-safe.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Cleared rounds needed before the level ticks up. Levels are 0-based. */
export const ROUNDS_PER_LEVEL = 3;

/** Level at which lowercase letters join the grid; `a` and `A` both count then. */
const CASE_MIXED_LEVEL = 3;

/** Level at which mirror-image letter pairs are allowed to share a grid. */
const MIRROR_FREE_LEVEL = 4;

/** Grid size per level; index is the level, clamped to the last entry. */
const TILE_COUNTS = [6, 9, 9, 12] as const;

/** A grid needs at least this many non-target tiles to still be a hunt. */
const MIN_DISTRACTORS = 2;

const MIN_COPIES = 2;

const STAR_THRESHOLDS = [80, 200, 400] as const;

/**
 * Letters a 3–5 year old reads as the same shape flipped. Kept out of the same grid
 * until MIRROR_FREE_LEVEL. Lowercase pairs only bite once case-mixing starts at
 * level 3, so M/W is the only pair that is live on the uppercase-only levels.
 */
const MIRROR_PAIRS: readonly (readonly [string, string])[] = [
  ["b", "d"],
  ["p", "q"],
  ["n", "u"],
  ["M", "W"],
];

/**
 * Letters that render as the same glyph in most fonts. Never allowed together at any
 * level, because such a round has no correct answer to see.
 */
const IDENTICAL_PAIRS: readonly (readonly [string, string])[] = [["I", "l"]];

export type Tile = {
  id: number;
  /** The character drawn on the tile, in the exact case it is shown. */
  glyph: string;
  /** True when this tile is one of the copies the child must find. */
  isTarget: boolean;
};

export type Round = {
  id: number;
  level: number;
  /** Uppercase form of the hunted letter — the round's identity. */
  target: string;
  /** Every accepted form of the target: ["A"] or ["A", "a"] once case-mixed. */
  targetGlyphs: string[];
  tiles: Tile[];
  /** How many tiles must be found to clear the round. */
  targetCount: number;
  /** Grid columns, chosen so the widest grid still fits a 360px phone. */
  columns: number;
  durationMs: number;
};

/** 0–3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

/** Level reached after clearing `cleared` rounds. Levels are 0-based. */
export function levelFor(cleared: number): number {
  return Math.floor(cleared / ROUNDS_PER_LEVEL);
}

/** Grid size for a level: 6 tiles, then 9, then 12. */
export function tileCountFor(level: number): number {
  return TILE_COUNTS[Math.min(Math.max(level, 0), TILE_COUNTS.length - 1)];
}

/** Most copies of the target that may be hidden at this level. */
export function maxCopiesFor(level: number): number {
  if (level <= 1) return 2;
  if (level <= 3) return 3;
  return 4;
}

/** Three columns for 6 and 9 tiles, four for 12 — never wider than a phone. */
export function columnsFor(tileCount: number): number {
  return tileCount >= 12 ? 4 : 3;
}

/** True once lowercase letters join the grid and both cases count as the target. */
export function isCaseMixed(level: number): boolean {
  return level >= CASE_MIXED_LEVEL;
}

/** Round timer, tightening with the level down to a six-second floor. */
export function durationFor(level: number): number {
  return Math.max(6000, 12000 - level * 1200);
}

function inPairs(
  pairs: readonly (readonly [string, string])[],
  a: string,
  b: string
): boolean {
  return pairs.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

/**
 * True when two glyphs are too easy to mix up to sit in the same grid at this level.
 * Applied both target-vs-distractor and distractor-vs-distractor, so the child never
 * has to separate two mirrored shapes anywhere on the board.
 */
export function areConfusable(a: string, b: string, level: number): boolean {
  if (inPairs(IDENTICAL_PAIRS, a, b)) return true;
  return level < MIRROR_FREE_LEVEL && inPairs(MIRROR_PAIRS, a, b);
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
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

/** Every form of a letter that can appear on a tile at this level. */
function glyphsFor(letter: string, level: number): string[] {
  return isCaseMixed(level) ? [letter, letter.toLowerCase()] : [letter];
}

function copyCountFor(level: number, tileCount: number): number {
  const ceiling = Math.min(maxCopiesFor(level), tileCount - MIN_DISTRACTORS);
  return randInt(MIN_COPIES, Math.max(MIN_COPIES, ceiling));
}

/**
 * Pick one glyph per distractor letter, skipping any letter that would be confusable
 * with the target or with a distractor already chosen. Letters are distinct by base
 * letter, so `D` and `d` never appear as two separate distractors.
 */
function pickDistractorGlyphs(
  target: string,
  targetGlyphs: string[],
  count: number,
  level: number
): string[] {
  const chosen: string[] = [];
  const candidates = shuffle(ALPHABET.filter((letter) => letter !== target));

  for (const letter of candidates) {
    if (chosen.length >= count) break;
    const options = glyphsFor(letter, level).filter(
      (glyph) =>
        !targetGlyphs.some((t) => areConfusable(glyph, t, level)) &&
        !chosen.some((c) => areConfusable(glyph, c, level))
    );
    if (options.length > 0) chosen.push(pick(options));
  }

  return chosen;
}

/**
 * Build the next round. `avoidTarget` keeps the same letter from being hunted twice in
 * a row. Every tile is tagged `isTarget` at build time, so a tap never has to re-derive
 * case rules.
 */
export function genRound(id: number, level: number, avoidTarget?: string): Round {
  const tileCount = tileCountFor(level);
  const targetPool = avoidTarget ? ALPHABET.filter((l) => l !== avoidTarget) : ALPHABET;
  const target = pick(targetPool);
  const targetGlyphs = glyphsFor(target, level);

  const targetCount = copyCountFor(level, tileCount);
  const distractors = pickDistractorGlyphs(
    target,
    targetGlyphs,
    tileCount - targetCount,
    level
  );

  const glyphs = [
    ...Array.from({ length: targetCount }, () => pick(targetGlyphs)),
    ...distractors,
  ];

  const tiles = shuffle(glyphs).map((glyph, index) => ({
    id: index,
    glyph,
    isTarget: targetGlyphs.includes(glyph),
  }));

  return {
    id,
    level,
    target,
    targetGlyphs,
    tiles,
    targetCount: tiles.filter((t) => t.isTarget).length,
    columns: columnsFor(tileCount),
    durationMs: durationFor(level),
  };
}
