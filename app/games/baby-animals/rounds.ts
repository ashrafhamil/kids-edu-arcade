// Baby Animals dataset + pure round/scoring helpers.
//
// No React, and nothing random or time-based at module scope. The only Math.random
// lives inside genRound(), which the component calls strictly from handlers/effects,
// keeping this module SSR-safe.

export type Pair = {
  /** Stable id. Unique across the dataset, so it doubles as the answer key. */
  id: string;
  /** Grown animal, shown big as the prompt. */
  grownEmoji: string;
  /** Grown animal name — spoken label for the prompt. */
  grownName: string;
  /** Baby animal, shown on the tap tile. Tiles are emoji-only. */
  babyEmoji: string;
  /** Baby animal name — the tile's aria-label, since the tile carries no text. */
  babyName: string;
};

// Only pairs where BOTH emoji exist, look clearly different from each other, and
// the "this one is the little version" reading is obvious to a pre-reader.
// Deliberately excluded because the emoji would teach something false:
//   🐑 ewe → 🐏 ram      — a ram is an adult male sheep, not a lamb.
//   🦁 lion → 🐯         — 🐯 is a tiger cub, not a lion cub.
//   🐀 rat → 🐁          — a mouse is not a baby rat.
//   🐂 ox → 🐄           — a cow is not a baby ox.
//   🐫 camel → 🐪        — two species, not parent and calf.
//   🐳 whale → 🐬        — a dolphin is not a baby whale.
//   🐸 frog → 🐛         — a tadpole has no emoji; a caterpillar is not a froglet.
//   🦋 butterfly → 🐛   — true as a life cycle, but a caterpillar is a larva, not a
//                        "little version" of its parent; unguessable for a pre-reader.
//   🐢 / 🐘 / 🐐 / 🐧    — no baby emoji exists at all.
export const PAIRS: readonly Pair[] = [
  { id: "chicken", grownEmoji: "🐔", grownName: "Hen", babyEmoji: "🐣", babyName: "Chick" },
  { id: "duck", grownEmoji: "🦆", grownName: "Duck", babyEmoji: "🐤", babyName: "Duckling" },
  { id: "bird", grownEmoji: "🐦", grownName: "Bird", babyEmoji: "🐥", babyName: "Baby bird" },
  { id: "dog", grownEmoji: "🐕", grownName: "Dog", babyEmoji: "🐶", babyName: "Puppy" },
  { id: "cat", grownEmoji: "🐈", grownName: "Cat", babyEmoji: "🐱", babyName: "Kitten" },
  { id: "cow", grownEmoji: "🐄", grownName: "Cow", babyEmoji: "🐮", babyName: "Calf" },
  { id: "pig", grownEmoji: "🐖", grownName: "Pig", babyEmoji: "🐷", babyName: "Piglet" },
  { id: "horse", grownEmoji: "🐎", grownName: "Horse", babyEmoji: "🐴", babyName: "Foal" },
  { id: "tiger", grownEmoji: "🐅", grownName: "Tiger", babyEmoji: "🐯", babyName: "Tiger cub" },
  { id: "rabbit", grownEmoji: "🐇", grownName: "Rabbit", babyEmoji: "🐰", babyName: "Bunny" },
  { id: "mouse", grownEmoji: "🐁", grownName: "Mouse", babyEmoji: "🐭", babyName: "Baby mouse" },
  { id: "monkey", grownEmoji: "🐒", grownName: "Monkey", babyEmoji: "🐵", babyName: "Baby monkey" },
] as const;

// Babies that read as near-identical to each other (all three are yellow chicks).
// At most one member of a group may appear in any single round, otherwise the
// question has more than one defensible answer.
const LOOKALIKE_GROUPS: readonly (readonly string[])[] = [["chicken", "duck", "bird"]];

// Pairs that are related but still clearly told apart — used to sharpen the
// distractors once the player is warmed up. Never banned, just preferred.
const NEAR_NEIGHBORS: Record<string, readonly string[]> = {
  cat: ["tiger", "dog"],
  tiger: ["cat"],
  dog: ["cat"],
  cow: ["horse", "pig"],
  horse: ["cow"],
  pig: ["cow"],
  mouse: ["rabbit"],
  rabbit: ["mouse"],
};

export type Round = {
  id: number;
  /** Grown animal shown big as the prompt. */
  grownEmoji: string;
  /** Grown animal name, for the prompt's screen-reader label. */
  grownName: string;
  /** The correct pair id. */
  answer: string;
  /** Shuffled tap options; always the answer plus distinct, non-lookalike babies. */
  choices: Pair[];
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

/** Score at/above which one distractor is drawn from a related animal. */
const CLOSE_DISTRACTOR_SCORE = 100;

/** Ids whose baby emoji would be confusable with `id`'s, including `id` itself. */
function lookalikeIds(id: string): Set<string> {
  const group = LOOKALIKE_GROUPS.find((g) => g.includes(id));
  return new Set(group ?? [id]);
}

/** A tile may join the round only if no already-picked tile looks like it. */
function fitsWith(picked: readonly Pair[], candidate: Pair): boolean {
  const lookalikes = lookalikeIds(candidate.id);
  return !picked.some((p) => lookalikes.has(p.id));
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
 * Build the next round. `avoidId` keeps the same animal from coming up twice in a
 * row. Distractors never include a lookalike baby (no two yellow chicks in one
 * round); once the score passes CLOSE_DISTRACTOR_SCORE, a related animal is
 * favored as one distractor to sharpen the challenge.
 */
export function genRound(id: number, score: number, avoidId?: string): Round {
  const count = choiceCountFor(score);
  const prompts = avoidId ? PAIRS.filter((p) => p.id !== avoidId) : PAIRS;
  const answer = pick(prompts);

  const picked: Pair[] = [answer];

  if (score >= CLOSE_DISTRACTOR_SCORE) {
    const neighborIds = NEAR_NEIGHBORS[answer.id] ?? [];
    const neighbors = PAIRS.filter((p) => neighborIds.includes(p.id) && fitsWith(picked, p));
    if (neighbors.length > 0) picked.push(pick(neighbors));
  }

  for (const p of shuffle(PAIRS)) {
    if (picked.length >= count) break;
    if (fitsWith(picked, p)) picked.push(p);
  }

  return {
    id,
    grownEmoji: answer.grownEmoji,
    grownName: answer.grownName,
    answer: answer.id,
    choices: shuffle(picked),
    durationMs: durationFor(score),
  };
}
