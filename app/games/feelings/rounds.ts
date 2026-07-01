// Feelings dataset + pure round/scoring helpers.
//
// No React, and nothing random or time-based at module scope. The only Math.random
// lives inside genRound(), which the component calls strictly from handlers/effects,
// keeping this module SSR-safe.

export type Emotion = {
  /** Display name. Unique across the dataset, so it doubles as an id. */
  name: string;
  /** The face shown big as the prompt. */
  emoji: string;
};

const EMOTIONS: Emotion[] = [
  { name: "Happy", emoji: "😄" },
  { name: "Sad", emoji: "😢" },
  { name: "Angry", emoji: "😠" },
  { name: "Surprised", emoji: "😲" },
  { name: "Scared", emoji: "😨" },
  { name: "Excited", emoji: "🤩" },
  { name: "Calm", emoji: "😌" },
  { name: "Confused", emoji: "😕" },
];

// Some faces read as more than one plausible emotion (wide eyes = surprised or scared;
// big smiles = happy, excited, or calm). Blocking these pairs from sharing a round keeps
// every puzzle down to exactly one defensible answer.
const CONFUSABLE: Record<string, readonly string[]> = {
  Surprised: ["Scared"],
  Scared: ["Surprised"],
  Happy: ["Excited", "Calm"],
  Excited: ["Happy", "Calm"],
  Calm: ["Happy", "Excited"],
};

export type Round = {
  id: number;
  /** The correct emotion, including the face shown as the prompt. */
  correct: Emotion;
  /** The correct word plus distractors, shuffled. */
  choices: Emotion[];
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
 * Build the next round: a random face as the prompt/answer, plus distractors drawn only
 * from emotions NOT flagged as visually confusable with it — so exactly one choice is ever
 * a fair answer. `avoidName` keeps the same face from appearing twice in a row.
 */
export function genRound(id: number, score: number, avoidName?: string): Round {
  const count = choiceCountFor(score);
  const pool = avoidName ? EMOTIONS.filter((e) => e.name !== avoidName) : EMOTIONS;
  const correct = pick(pool);

  const blocked = new Set<string>([correct.name, ...(CONFUSABLE[correct.name] ?? [])]);
  const distractorPool = shuffle(EMOTIONS.filter((e) => !blocked.has(e.name)));
  const distractors = distractorPool.slice(0, count - 1);

  const choices = shuffle([correct, ...distractors]);
  return { id, correct, choices };
}
