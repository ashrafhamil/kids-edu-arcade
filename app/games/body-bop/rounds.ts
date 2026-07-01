// Body Bop dataset + pure round/scoring helpers.
//
// No React, and nothing random or time-based at module scope. The only Math.random
// lives inside genRound(), which the component calls strictly from handlers/effects,
// keeping this module SSR-safe.

export type BodyPart = {
  /** Display name. Unique across the dataset, so it doubles as an id. */
  name: string;
  /** Icon shown on the answer tile. */
  emoji: string;
  /** Region key — parts that share a region read as visually close (see CONFUSABLE below). */
  region: string;
};

const BODY_PARTS: BodyPart[] = [
  { name: "Eye", emoji: "👁️", region: "face" },
  { name: "Ear", emoji: "👂", region: "face" },
  { name: "Nose", emoji: "👃", region: "face" },
  { name: "Mouth", emoji: "👄", region: "mouth" },
  { name: "Tooth", emoji: "🦷", region: "mouth" },
  { name: "Tongue", emoji: "👅", region: "mouth" },
  { name: "Hand", emoji: "✋", region: "arm" },
  { name: "Arm", emoji: "💪", region: "arm" },
  { name: "Foot", emoji: "🦶", region: "leg" },
  { name: "Leg", emoji: "🦵", region: "leg" },
  { name: "Brain", emoji: "🧠", region: "head" },
];

// Two parts from the same region (e.g. Mouth/Tooth/Tongue, Hand/Arm) can both look like a
// fair answer at a glance. Blocking same-region distractors keeps every round down to
// exactly one defensible tile.
const CONFUSABLE = BODY_PARTS.reduce<Record<string, readonly string[]>>((map, part) => {
  map[part.name] = BODY_PARTS.filter((p) => p.region === part.region && p.name !== part.name).map(
    (p) => p.name,
  );
  return map;
}, {});

export type Round = {
  id: number;
  /** The correct body part, whose name is the text prompt. */
  correct: BodyPart;
  /** The correct tile plus distractors, shuffled. */
  choices: BodyPart[];
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
 * Build the next round: a random body part as the prompt/answer, plus distractors drawn
 * only from parts NOT sharing its region — so exactly one tile is ever a fair answer.
 * `avoidName` keeps the same part from appearing twice in a row.
 */
export function genRound(id: number, score: number, avoidName?: string): Round {
  const count = choiceCountFor(score);
  const pool = avoidName ? BODY_PARTS.filter((p) => p.name !== avoidName) : BODY_PARTS;
  const correct = pick(pool);

  const blocked = new Set<string>([correct.name, ...(CONFUSABLE[correct.name] ?? [])]);
  const distractorPool = shuffle(BODY_PARTS.filter((p) => !blocked.has(p.name)));
  const distractors = distractorPool.slice(0, count - 1);

  const choices = shuffle([correct, ...distractors]);
  return { id, correct, choices };
}
