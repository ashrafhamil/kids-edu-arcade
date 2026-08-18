// Plant Parts dataset + pure round/scoring helpers.
//
// No React, and nothing random or time-based at module scope. The only Math.random
// lives inside genRound(), which the component calls strictly from handlers/effects,
// keeping this module SSR-safe.

/** Stable key for a part — also the key into the SVG geometry in PlantSvg.tsx. */
export type PartId = "root" | "stem" | "leaf" | "flower" | "fruit" | "seed";

export type PlantPart = {
  id: PartId;
  /** Word shown on the answer tile. */
  name: string;
  /** Small emoji cue printed above the word. */
  emoji: string;
  /**
   * Region key. Parts sharing a region are the ones a child could fairly argue for
   * when the other is highlighted, so they never appear together (see CONFUSABLE).
   * - `stalk`  — root and stem meet at the soil line and are both "the stick part".
   * - `seedcase` — seeds live inside the fruit, so the two are nested, not separate.
   */
  region: string;
};

const PLANT_PARTS: PlantPart[] = [
  { id: "root", name: "Root", emoji: "🥕", region: "stalk" },
  { id: "stem", name: "Stem", emoji: "🌾", region: "stalk" },
  { id: "leaf", name: "Leaf", emoji: "🍃", region: "leaf" },
  { id: "flower", name: "Flower", emoji: "🌸", region: "flower" },
  { id: "fruit", name: "Fruit", emoji: "🍎", region: "seedcase" },
  { id: "seed", name: "Seed", emoji: "🌰", region: "seedcase" },
];

// Two parts from the same region (Root/Stem, Fruit/Seed) can both look like a fair
// answer at a glance. Blocking same-region distractors keeps every round down to
// exactly one defensible tile.
//
// Each region holds at most two parts, so blocking never removes more than two names:
// 6 - 1 answer - 1 neighbour = 4 eligible distractors, always more than the 3 a
// four-choice round needs. The distractor set therefore never becomes predictable.
const CONFUSABLE = PLANT_PARTS.reduce<Record<string, readonly PartId[]>>((map, part) => {
  map[part.id] = PLANT_PARTS.filter((p) => p.region === part.region && p.id !== part.id).map(
    (p) => p.id,
  );
  return map;
}, {});

export type Round = {
  id: number;
  /** The highlighted part — the SVG glows here and its name is the answer. */
  correct: PlantPart;
  /** The correct tile plus distractors, shuffled. */
  choices: PlantPart[];
  /** How long this round's timer bar lasts, in ms. */
  durationMs: number;
};

const STAR_THRESHOLDS = [80, 200, 400] as const;

/** 0–3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

/** Three choices to start, four once the player is warmed up. */
export function choiceCountFor(score: number): number {
  return score >= 150 ? 4 : 3;
}

/** Timer bar length, tightening once the fourth choice tile appears. */
export function durationFor(score: number): number {
  return choiceCountFor(score) >= 4 ? 6000 : 7000;
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

/**
 * Build the next round: a random part to highlight, plus distractors drawn only from
 * parts NOT sharing its region — so exactly one tile is ever a fair answer.
 * `avoidId` keeps the same part from being highlighted twice in a row.
 */
export function genRound(id: number, score: number, avoidId?: PartId): Round {
  const count = choiceCountFor(score);
  const pool = avoidId ? PLANT_PARTS.filter((p) => p.id !== avoidId) : PLANT_PARTS;
  const correct = pick(pool);

  const blocked = new Set<PartId>([correct.id, ...(CONFUSABLE[correct.id] ?? [])]);
  const distractorPool = shuffle(PLANT_PARTS.filter((p) => !blocked.has(p.id)));
  const distractors = distractorPool.slice(0, count - 1);

  const choices = shuffle([correct, ...distractors]);
  return { id, correct, choices, durationMs: durationFor(score) };
}
