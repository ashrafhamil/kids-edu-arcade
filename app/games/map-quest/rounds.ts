// Map Quest dataset + pure round/scoring helpers.
//
// Holds the *names* of every tappable region; the SVG geometry for those same
// ids lives in WorldMap.tsx, keyed by RegionId so the two files can never drift
// apart without a type error.
//
// No React and nothing random or time-based at module scope. The only
// Math.random lives inside genRound(), which the component calls strictly from
// handlers/effects, keeping this module SSR-safe.

/** Every tappable area on the map. Continents first, then oceans. */
export type RegionId =
  | "africa"
  | "antarctica"
  | "asia"
  | "australia"
  | "europe"
  | "north-america"
  | "south-america"
  | "arctic-ocean"
  | "atlantic-ocean"
  | "indian-ocean"
  | "pacific-ocean"
  | "southern-ocean";

export type RegionKind = "continent" | "ocean";

export type Region = {
  id: RegionId;
  /** Prompt + aria-label text, e.g. "Indian Ocean". */
  name: string;
  kind: RegionKind;
};

export const CONTINENTS: readonly Region[] = [
  { id: "africa", name: "Africa", kind: "continent" },
  { id: "antarctica", name: "Antarctica", kind: "continent" },
  { id: "asia", name: "Asia", kind: "continent" },
  { id: "australia", name: "Australia", kind: "continent" },
  { id: "europe", name: "Europe", kind: "continent" },
  { id: "north-america", name: "North America", kind: "continent" },
  { id: "south-america", name: "South America", kind: "continent" },
];

export const OCEANS: readonly Region[] = [
  { id: "arctic-ocean", name: "Arctic Ocean", kind: "ocean" },
  { id: "atlantic-ocean", name: "Atlantic Ocean", kind: "ocean" },
  { id: "indian-ocean", name: "Indian Ocean", kind: "ocean" },
  { id: "pacific-ocean", name: "Pacific Ocean", kind: "ocean" },
  { id: "southern-ocean", name: "Southern Ocean", kind: "ocean" },
];

export const REGIONS: readonly Region[] = [...CONTINENTS, ...OCEANS];

const REGION_BY_ID: Record<RegionId, Region> = REGIONS.reduce(
  (acc, region) => {
    acc[region.id] = region;
    return acc;
  },
  {} as Record<RegionId, Region>
);

/** Look a region up by id. Total over RegionId, so it never returns undefined. */
export function regionById(id: RegionId): Region {
  return REGION_BY_ID[id];
}

/** Correct answers needed to advance one level. */
const CORRECT_PER_LEVEL = 5;

/** Level 0 asks continents, level 1 asks oceans, level 2+ mixes both. */
export function levelFor(correctCount: number): number {
  return Math.floor(correctCount / CORRECT_PER_LEVEL);
}

/** Timer bar length for the given level: 9s down to a 4s floor. */
export function durationFor(level: number): number {
  return Math.max(4000, 9000 - level * 800);
}

/** Which regions can be asked about at this level. */
export function poolFor(level: number): readonly Region[] {
  if (level <= 0) return CONTINENTS;
  if (level === 1) return OCEANS;
  return REGIONS;
}

/** Short label describing what the current level is drilling. */
export function focusFor(level: number): string {
  if (level <= 0) return "Continents";
  if (level === 1) return "Oceans";
  return "Continents & Oceans";
}

const STAR_THRESHOLDS = [80, 200, 400] as const;

/** 0-3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

export type Round = {
  id: number;
  level: number;
  /** The region the child has to find on the map. */
  target: Region;
  /** How long this round's timer bar lasts, in ms. */
  durationMs: number;
};

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Build the next round. The target is drawn from the level's pool minus
 * `usedIds`, so every region in the pool is asked once before any repeats;
 * `avoidId` additionally blocks an immediate repeat across a cycle boundary.
 * Both filters degrade gracefully — if they would empty the pool, they are
 * dropped rather than throwing.
 */
export function genRound(
  id: number,
  correctCount: number,
  usedIds: readonly RegionId[],
  avoidId?: RegionId
): Round {
  const level = levelFor(correctCount);
  const pool = poolFor(level);

  const unseen = pool.filter((region) => !usedIds.includes(region.id));
  const fromPool = unseen.length > 0 ? unseen : pool;

  const withoutRepeat = fromPool.filter((region) => region.id !== avoidId);
  const candidates = withoutRepeat.length > 0 ? withoutRepeat : fromPool;

  return { id, level, target: pick(candidates), durationMs: durationFor(level) };
}
