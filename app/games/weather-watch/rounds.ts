// Weather Watch dataset + pure round/scoring helpers.
//
// No React, and nothing random or time-based at module scope. The only Math.random
// lives inside genRound(), which the component calls strictly from handlers/effects,
// keeping this module SSR-safe.

export type WeatherType = {
  /** Display name. Unique across the dataset, so it doubles as an id. */
  name: string;
  /** Icon shown on the answer tile. */
  emoji: string;
  /** Scenario cues that hint at this weather — one is shown big as the prompt. */
  cues: string[];
};

const WEATHER: WeatherType[] = [
  { name: "Sunny", emoji: "☀️", cues: ["☀️", "🕶️", "🏖️"] },
  { name: "Rainy", emoji: "🌧️", cues: ["🌧️", "☔", "🐸"] },
  { name: "Snowy", emoji: "❄️", cues: ["❄️", "⛄", "🧤"] },
  { name: "Windy", emoji: "🌬️", cues: ["🌬️", "🪁", "🍃"] },
  { name: "Cloudy", emoji: "☁️", cues: ["☁️"] },
  { name: "Stormy", emoji: "⛈️", cues: ["⛈️", "🌩️", "⚡"] },
];

// Weather types that read as visually/conceptually close, used to sharpen the
// distractors once the player is warmed up. Never mutually exclusive from the
// answer pool — just preferred as a distractor when available.
const NEAR_NEIGHBORS: Record<string, readonly string[]> = {
  Rainy: ["Stormy"],
  Stormy: ["Rainy"],
  Cloudy: ["Windy"],
  Windy: ["Cloudy"],
};

export type Round = {
  id: number;
  /** The scenario cue(s) shown big as the prompt. */
  cue: string;
  /** The correct weather name. */
  answer: string;
  /** Shuffled tap options; always contains the answer plus distinct distractors. */
  choices: WeatherType[];
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

/** Score at/above which distractors start favoring visually-close weather types. */
const CLOSE_DISTRACTOR_SCORE = 100;

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
 * Build the next round. `avoidName` keeps the same weather type from repeating twice in a
 * row. Once the score passes CLOSE_DISTRACTOR_SCORE, a visually-close neighbor (e.g. Stormy
 * for Rainy) is favored as one distractor to sharpen the challenge.
 */
export function genRound(id: number, score: number, avoidName?: string): Round {
  const count = choiceCountFor(score);
  const pool = avoidName ? WEATHER.filter((w) => w.name !== avoidName) : WEATHER;
  const answer = pick(pool);
  const cue = pick(answer.cues);

  const others = WEATHER.filter((w) => w.name !== answer.name);
  const distractors: WeatherType[] = [];

  if (score >= CLOSE_DISTRACTOR_SCORE) {
    const neighborNames = NEAR_NEIGHBORS[answer.name] ?? [];
    const neighbor = others.find((w) => neighborNames.includes(w.name));
    if (neighbor) distractors.push(neighbor);
  }

  const remaining = shuffle(others.filter((w) => !distractors.includes(w)));
  for (const w of remaining) {
    if (distractors.length >= count - 1) break;
    distractors.push(w);
  }

  const choices = shuffle([answer, ...distractors]);
  return { id, cue, answer: answer.name, choices };
}
