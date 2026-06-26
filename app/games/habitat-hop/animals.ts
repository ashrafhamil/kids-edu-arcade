// Pure data + scoring logic for Habitat Hop. Kept free of React so the game loop
// stays readable and the difficulty curve is easy to tune.
//
// Every export here is deterministic except the Math.random calls inside
// nextAnimal, which is only ever invoked from event handlers / effects in the
// component (never during render), keeping the module SSR-safe. No top-level
// Math.random / Date.now / window access.

export type Habitat = "Land" | "Sea" | "Sky";

export type Animal = {
  emoji: string;
  name: string;
  habitat: Habitat;
};

/** The three drop bins, in display order (left → right). */
export type Bin = {
  habitat: Habitat;
  emoji: string;
  label: string;
};

export const BINS: readonly Bin[] = [
  { habitat: "Land", emoji: "🌳", label: "Land" },
  { habitat: "Sea", emoji: "🌊", label: "Sea" },
  { habitat: "Sky", emoji: "🌤️", label: "Sky" },
] as const;

// Every animal is UNAMBIGUOUSLY one habitat. Ambiguous creatures (frog, penguin,
// crocodile, duck, turtle, seal, flamingo, swan) are deliberately excluded.
export const ANIMALS: readonly Animal[] = [
  // ── Land (9) ──
  { emoji: "🦁", name: "Lion", habitat: "Land" },
  { emoji: "🐘", name: "Elephant", habitat: "Land" },
  { emoji: "🐯", name: "Tiger", habitat: "Land" },
  { emoji: "🦒", name: "Giraffe", habitat: "Land" },
  { emoji: "🦓", name: "Zebra", habitat: "Land" },
  { emoji: "🐎", name: "Horse", habitat: "Land" },
  { emoji: "🐄", name: "Cow", habitat: "Land" },
  { emoji: "🐰", name: "Rabbit", habitat: "Land" },
  { emoji: "🦊", name: "Fox", habitat: "Land" },

  // ── Sea (9) ──
  { emoji: "🐟", name: "Fish", habitat: "Sea" },
  { emoji: "🐠", name: "Clownfish", habitat: "Sea" },
  { emoji: "🐬", name: "Dolphin", habitat: "Sea" },
  { emoji: "🐳", name: "Whale", habitat: "Sea" },
  { emoji: "🐙", name: "Octopus", habitat: "Sea" },
  { emoji: "🦈", name: "Shark", habitat: "Sea" },
  { emoji: "🦀", name: "Crab", habitat: "Sea" },
  { emoji: "🦞", name: "Lobster", habitat: "Sea" },
  { emoji: "🐡", name: "Pufferfish", habitat: "Sea" },

  // ── Sky (8) ──
  { emoji: "🦅", name: "Eagle", habitat: "Sky" },
  { emoji: "🦜", name: "Parrot", habitat: "Sky" },
  { emoji: "🦉", name: "Owl", habitat: "Sky" },
  { emoji: "🕊️", name: "Dove", habitat: "Sky" },
  { emoji: "🦋", name: "Butterfly", habitat: "Sky" },
  { emoji: "🐝", name: "Bee", habitat: "Sky" },
  { emoji: "🦇", name: "Bat", habitat: "Sky" },
  { emoji: "🐦", name: "Bird", habitat: "Sky" },
] as const;

// ── Difficulty curve ──
// Generous to start, tightening as the player builds a correct streak.
const START_MS = 5000;
const MIN_MS = 2800;
const STEP_MS = 150; // shaved off per difficulty step
const ANSWERS_PER_STEP = 2; // speed up every 2 correct answers

// Star thresholds for the home-hub badges (score is in points).
const STAR_THRESHOLDS = [80, 200, 400] as const;

/** Per-animal timer length, based on how many are already correct. */
export function durationFor(correctCount: number): number {
  const step = Math.floor(correctCount / ANSWERS_PER_STEP);
  return Math.max(MIN_MS, START_MS - step * STEP_MS);
}

/** 0–3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce(
    (stars, threshold) => stars + (score >= threshold ? 1 : 0),
    0,
  );
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Choose the next animal, drawing only from animals NOT in `usedNames` so an
 * animal never repeats until the whole pool has cycled. `avoidName` prevents an
 * immediate repeat across a cycle boundary (when the used set was just reset).
 * Fallbacks keep the game playable if the caller hasn't reset the cycle yet.
 */
export function nextAnimal(
  usedNames: readonly string[] = [],
  avoidName?: string,
): Animal {
  const used = new Set(usedNames);
  let eligible = ANIMALS.filter((a) => !used.has(a.name) && a.name !== avoidName);
  if (eligible.length === 0) eligible = ANIMALS.filter((a) => a.name !== avoidName);
  if (eligible.length === 0) eligible = [...ANIMALS];
  return pick(eligible);
}
